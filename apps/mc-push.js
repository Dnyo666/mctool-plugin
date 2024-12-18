import plugin from '../../../lib/plugins/plugin.js';
import { Data, checkGroupAdmin, queryServerStatus, CONFIG, initDataFiles, getConfig, formatPushMessage } from './mc-utils.js';
import schedule from 'node-schedule';

export class MCPush extends plugin {
    constructor() {
        super({
            name: 'MCTool-推送',
            dsc: 'Minecraft服务器推送服务',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#[Mm][Cc](开启|关闭)推送$',
                    fnc: 'togglePush',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]推送玩家\\s+\\S+\\s+\\S+',
                    fnc: 'configurePlayerPush',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc](开启|关闭)新人推送\\s+\\S+',
                    fnc: 'toggleNewPlayerAlert',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc](开启|关闭)状态推送$',
                    fnc: 'toggleServerStatusPush',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]取消推送\\s+\\S+\\s+\\S+',
                    fnc: 'cancelPush',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]pushlist$',
                    fnc: 'getPushConfig',
                    permission: 'all'
                }
            ]
        });

        initDataFiles();
        this.startMonitoring();
    }

    startMonitoring() {
        schedule.scheduleJob('*/1 * * * *', async () => {
            await this.checkServerStatus();
        });
    }

    async checkServerStatus() {
        try {
            const servers = Data.read('servers');
            const currentData = Data.read('current');
            const changesData = Data.read('changes');
            const historicalData = Data.read('historical');
            const subscriptions = Data.read('subscriptions');

            // 收集所有需要监控的服务器
            const serversToMonitor = new Set();
            for (const groupServers of Object.values(servers)) {
                groupServers.forEach(server => serversToMonitor.add(server.address));
            }

            // 检查每个服务器
            for (const serverAddress of serversToMonitor) {
                const status = await queryServerStatus(serverAddress);
                const wasOnline = currentData[serverAddress]?.online ?? true; // 默认为在线，避免首次检查就推送离线消息

                // 处理服务器状态变化推送
                if (status.online !== wasOnline) {
                    // 通知相关群组
                    for (const [groupId, config] of Object.entries(subscriptions)) {
                        if (!config.enabled || !config.serverStatusPush) continue;
                        const serverConfig = config.servers[serverAddress];
                        if (!serverConfig?.enabled) continue;

                        const serverName = serverConfig.serverName || serverAddress;
                        const message = formatPushMessage(null, status.online ? 'serverOnline' : 'serverOffline', serverName);
                        Bot.pickGroup(groupId).sendMsg(message);
                    }
                }

                if (!status.online) {
                    currentData[serverAddress] = {
                        online: false,
                        lastUpdate: Date.now()
                    };
                    continue;
                }

                const newPlayerList = status.players.list;
                const oldPlayerList = currentData[serverAddress]?.players || [];

                // 检测玩家变动
                const changes = this.detectPlayerChanges(oldPlayerList, newPlayerList);
                
                // 记录变动
                if (changes.join.length > 0 || changes.leave.length > 0) {
                    changesData[serverAddress] = changes;
                    
                    // 通知相关群组
                    for (const [groupId, config] of Object.entries(subscriptions)) {
                        if (!config.enabled) continue;
                        const serverConfig = config.servers[serverAddress];
                        if (!serverConfig?.enabled) continue;

                        const messages = [];

                        // 处理新玩家
                        if (config.newPlayerAlert) {
                            const newPlayers = changes.join.filter(player => 
                                !historicalData[serverAddress]?.includes(player)
                            );
                            if (newPlayers.length > 0) {
                                historicalData[serverAddress] = [
                                    ...(historicalData[serverAddress] || []),
                                    ...newPlayers
                                ];
                                newPlayers.forEach(player => {
                                    messages.push(formatPushMessage(player, 'new', serverConfig.serverName));
                                });
                            }
                        }

                        // 处理常规玩家变动
                        if (serverConfig.players.includes('all')) {
                            changes.join.forEach(player => {
                                messages.push(formatPushMessage(player, 'join', serverConfig.serverName));
                            });
                            changes.leave.forEach(player => {
                                messages.push(formatPushMessage(player, 'leave', serverConfig.serverName));
                            });
                        } else {
                            const monitoredPlayers = new Set(serverConfig.players);
                            changes.join
                                .filter(player => monitoredPlayers.has(player))
                                .forEach(player => {
                                    messages.push(formatPushMessage(player, 'join', serverConfig.serverName));
                                });
                            changes.leave
                                .filter(player => monitoredPlayers.has(player))
                                .forEach(player => {
                                    messages.push(formatPushMessage(player, 'leave', serverConfig.serverName));
                                });
                        }

                        if (messages.length > 0) {
                            Bot.pickGroup(groupId).sendMsg(messages.join('\n'));
                        }
                    }
                }

                // 更新当前玩家列表
                currentData[serverAddress] = {
                    online: true,
                    players: newPlayerList,
                    lastUpdate: Date.now()
                };
            }

            // 保存数据
            Data.write('current', currentData);
            Data.write('changes', changesData);
            Data.write('historical', historicalData);
        } catch (error) {
            console.error('检查服务器状态失败:', error);
        }
    }

    detectPlayerChanges(oldPlayers, newPlayers) {
        const join = newPlayers.filter(p => !oldPlayers.includes(p));
        const leave = oldPlayers.filter(p => !newPlayers.includes(p));
        return { join, leave };
    }

    async togglePush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const isEnable = e.msg.includes('开启');
            const subscriptions = Data.read('subscriptions');
            
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            subscriptions[e.group_id].enabled = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${isEnable ? '开启' : '关闭'}推送功能`);
        } catch (error) {
            console.error('操作推送功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async configurePlayerPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc]推送玩家\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc推送玩家 <服务器ID/IP> <玩家名/all>');
                return;
            }

            const [, serverIdentifier, playerName] = match;
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            // 查找服务器信息
            let serverAddress;
            let serverName;
            if (/^\d+$/.test(serverIdentifier)) {
                // 通过ID查找
                const serverId = parseInt(serverIdentifier);
                const server = servers[e.group_id]?.find(s => s.id === serverId);
                if (!server) {
                    e.reply(`未找到ID为 ${serverId} 的服务器`);
                    return;
                }
                serverAddress = server.address;
                serverName = server.name;
            } else {
                // 直接使用IP地址
                serverAddress = serverIdentifier;
                serverName = serverIdentifier;
            }

            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            // 初始化服务器配置
            if (!subscriptions[e.group_id].servers[serverAddress]) {
                subscriptions[e.group_id].servers[serverAddress] = {
                    serverName: serverName,
                    players: []
                };
            }

            const serverConfig = subscriptions[e.group_id].servers[serverAddress];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = ['all'];
                Data.write('subscriptions', subscriptions);
                e.reply(`已设置推送 ${serverName} 的所有玩家动态`);
                return;
            }

            if (!serverConfig.players.includes(playerName) && serverConfig.players[0] !== 'all') {
                serverConfig.players.push(playerName);
                Data.write('subscriptions', subscriptions);
                e.reply(`已添加对玩家 ${playerName} 的动态推送`);
            } else {
                e.reply('该玩家已在推送列表中');
            }
        } catch (error) {
            console.error('配置推送失败:', error);
            e.reply('配置推送失败，请稍后重试');
        }
    }

    async toggleNewPlayerAlert(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc](开启|关闭)新人推送\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc开启新人推送 <服务器ID/IP>');
                return;
            }

            const [, action, serverIdentifier] = match;
            const isEnable = action === '开启';
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            // 查找服务器信息
            let serverAddress;
            let serverName;
            if (/^\d+$/.test(serverIdentifier)) {
                // 通过ID查找
                const serverId = parseInt(serverIdentifier);
                const server = servers[e.group_id]?.find(s => s.id === serverId);
                if (!server) {
                    e.reply(`未找到ID为 ${serverId} 的服务器`);
                    return;
                }
                serverAddress = server.address;
                serverName = server.name;
            } else {
                // 直接使用IP地址
                serverAddress = serverIdentifier;
                serverName = serverIdentifier;
                // 验证服务器是否在列表中
                if (!Object.values(servers).some(groupServers => 
                    groupServers.some(s => s.address === serverAddress)
                )) {
                    e.reply('该服务器未在任何群组中添加');
                    return;
                }
            }

            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {},
                    newPlayerAlert: false,
                    serverStatusPush: false
                };
            }

            // 初始化服务器配置
            if (!subscriptions[e.group_id].servers[serverAddress]) {
                subscriptions[e.group_id].servers[serverAddress] = {
                    serverName: serverName,
                    enabled: true,
                    newPlayerAlert: false,
                    players: []
                };
            }

            // 更新新人推送设置
            subscriptions[e.group_id].servers[serverAddress].newPlayerAlert = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${isEnable ? '开启' : '关闭'}服务器 ${serverName} 的新玩家提醒`);
        } catch (error) {
            console.error('操作新玩家提醒失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async cancelPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc]取消推送\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc取消推送 <服务器ID/IP> <玩家名/all>');
                return;
            }

            const [, serverIdentifier, playerName] = match;
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            // 查找服务器信息
            let serverAddress;
            if (/^\d+$/.test(serverIdentifier)) {
                const serverId = parseInt(serverIdentifier);
                const server = servers[e.group_id]?.find(s => s.id === serverId);
                if (!server) {
                    e.reply(`未找到ID为 ${serverId} 的服务器`);
                    return;
                }
                serverAddress = server.address;
            } else {
                serverAddress = serverIdentifier;
            }

            if (!subscriptions[e.group_id]?.servers[serverAddress]) {
                e.reply('未找到该服务器的推��配置');
                return;
            }

            const serverConfig = subscriptions[e.group_id].servers[serverAddress];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = [];
            } else {
                const playerIndex = serverConfig.players.indexOf(playerName);
                if (playerIndex === -1) {
                    e.reply('该玩家不在推送列表中');
                    return;
                }
                serverConfig.players.splice(playerIndex, 1);
            }

            Data.write('subscriptions', subscriptions);
            e.reply(`已取消${playerName.toLowerCase() === 'all' ? '所有' : `玩家 ${playerName} 的`}推送`);
        } catch (error) {
            console.error('取消推送失败:', error);
            e.reply('取消推送失败，请稍后重试');
        }
    }

    async getPushConfig(e) {
        try {
            const subscriptions = Data.read('subscriptions');
            const servers = Data.read('servers');

            const groupConfig = subscriptions[e.group_id];
            if (!groupConfig || Object.keys(groupConfig.servers).length === 0) {
                e.reply('当前群聊未配置任何推送');
                return;
            }

            const configList = [];
            configList.push(`推送状态: ${groupConfig.enabled ? '已开启' : '已关闭'}`);
            configList.push(`新玩家提醒: ${groupConfig.newPlayerAlert ? '已开启' : '已关闭'}`);
            configList.push('\n已配置的服务器:');

            for (const [serverAddress, serverConfig] of Object.entries(groupConfig.servers)) {
                const server = servers[e.group_id]?.find(s => s.address === serverAddress);
                const serverName = server?.name || serverAddress;

                const playerConfig = serverConfig.players.includes('all') 
                    ? '所有玩家' 
                    : serverConfig.players.length > 0 
                        ? `指定玩家: ${serverConfig.players.join(', ')}` 
                        : '无玩家配置';

                configList.push(`\n服务器: ${serverName}`);
                configList.push(`地址: ${serverAddress}`);
                configList.push(`推送配置: ${playerConfig}`);
            }

            e.reply(configList.join('\n'));
        } catch (error) {
            console.error('获取推送配置时发生错误:', error);
            e.reply('获取推送配置失败，请稍后重试');
        }
    }

    async toggleServerStatusPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const isEnable = e.msg.includes('开启');
            const subscriptions = Data.read('subscriptions');
            
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    servers: {},
                    newPlayerAlert: false,
                    serverStatusPush: false
                };
            }

            subscriptions[e.group_id].serverStatusPush = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${isEnable ? '开启' : '关闭'}服务器状态推送功能`);
        } catch (error) {
            console.error('操作服务器状态推送功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }
} 