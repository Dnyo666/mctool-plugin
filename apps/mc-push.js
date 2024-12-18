import plugin from '../lib/plugins/plugin.js';
import { Data, checkGroupAdmin, queryServerStatus, CONFIG, initDataFiles } from './mc-utils.js';
import schedule from 'node-schedule';

export class MCPush extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'MCTool-推送',
            /** 功能描述 */
            dsc: 'Minecraft服务器推送服务',
            /** 指令正则匹配 */
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 5000,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#mc(开启|关闭)推送$',
                    /** 执行方法 */
                    fnc: 'togglePush',
                    /** 权限 */
                    permission: 'admin'
                },
                {
                    reg: '^#mc推送\\s+\\S+\\s+\\S+',
                    fnc: 'configurePlayerPush',
                    permission: 'admin'
                },
                {
                    reg: '^#mc(开启|关闭)新人推送$',
                    fnc: 'toggleNewPlayerAlert',
                    permission: 'admin'
                },
                {
                    reg: '^#mc取消推送\\s+\\S+\\s+\\S+',
                    fnc: 'cancelPush',
                    permission: 'admin'
                }
            ]
        });

        initDataFiles();
        this.startMonitoring();
    }

    startMonitoring() {
        const interval = getConfig('checkInterval');
        schedule.scheduleJob(`*/${interval} * * * *`, async () => {
            await this.checkServerStatus();
        });
    }

    async checkServerStatus() {
        try {
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');
            const players = Data.read('players');

            for (const [groupId, groupServers] of Object.entries(servers)) {
                if (!subscriptions[groupId]?.enabled) continue;

                for (const server of groupServers) {
                    const status = await queryServerStatus(server.address);
                    if (!status.online) continue;

                    const oldPlayers = players[server.id]?.list || [];
                    const newPlayers = status.players.list;

                    // 检测玩家变动
                    const changes = this.detectPlayerChanges(oldPlayers, newPlayers);
                    if (changes.join.length > 0 || changes.leave.length > 0) {
                        await this.notifyChanges(groupId, server, changes, subscriptions[groupId]);
                    }

                    // 检测新玩家
                    if (subscriptions[groupId].newPlayerAlert) {
                        await this.checkNewPlayers(groupId, server, newPlayers);
                    }

                    // 更新玩家列表
                    players[server.id] = {
                        list: newPlayers,
                        lastUpdate: Date.now()
                    };
                }
            }

            Data.write('players', players);
        } catch (error) {
            console.error('检查服务器状态失败:', error);
        }
    }

    detectPlayerChanges(oldPlayers, newPlayers) {
        const join = newPlayers.filter(p => !oldPlayers.includes(p));
        const leave = oldPlayers.filter(p => !newPlayers.includes(p));
        return { join, leave };
    }

    async notifyChanges(groupId, server, changes, subscription) {
        const serverConfig = subscription.servers[server.id];
        if (!serverConfig) return;

        const messages = [];
        
        for (const player of changes.join) {
            if (serverConfig.players.includes('all') || serverConfig.players.includes(player)) {
                messages.push(formatPushMessage(player, '进入', server.name));
            }
        }

        for (const player of changes.leave) {
            if (serverConfig.players.includes('all') || serverConfig.players.includes(player)) {
                messages.push(formatPushMessage(player, '离开', server.name));
            }
        }

        if (messages.length > 0) {
            Bot.pickGroup(groupId).sendMsg(messages.join('\n'));
        }
    }

    async checkNewPlayers(groupId, server, currentPlayers) {
        const historical = Data.read('historical');
        if (!historical[server.id]) {
            historical[server.id] = [];
        }

        const newPlayers = currentPlayers.filter(p => !historical[server.id].includes(p));
        if (newPlayers.length > 0) {
            historical[server.id].push(...newPlayers);
            Data.write('historical', historical);

            const message = `【新玩家提醒】\n服务器: ${server.name}\n新玩家: ${newPlayers.join(', ')}`;
            Bot.pickGroup(groupId).sendMsg(message);
        }
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
            const match = e.msg.match(/^#mc推送\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc推送 <服务器ID> <玩家名/all>');
                return;
            }

            const [, serverId, playerName] = match;
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            const server = servers[e.group_id]?.find(s => s.id === parseInt(serverId));
            if (!server) {
                e.reply('未找到指定的服务器');
                return;
            }

            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            if (!subscriptions[e.group_id].servers[server.id]) {
                subscriptions[e.group_id].servers[server.id] = {
                    players: []
                };
            }

            const serverConfig = subscriptions[e.group_id].servers[server.id];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = ['all'];
                Data.write('subscriptions', subscriptions);
                e.reply(`已设置推送 ${server.name} 的所有玩家动态`);
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
            const isEnable = e.msg.includes('开启');
            const subscriptions = Data.read('subscriptions');
            
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            subscriptions[e.group_id].newPlayerAlert = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${isEnable ? '开启' : '关闭'}新玩家提醒`);
        } catch (error) {
            console.error('操作新玩家提醒失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async cancelPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#mc取消推送\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc取消推送 <服务器ID> <玩家名>');
                return;
            }

            const [, serverId, playerName] = match;
            const subscriptions = Data.read('subscriptions');

            if (!subscriptions[e.group_id]?.servers[serverId]) {
                e.reply('未找到该服务器的推送配置');
                return;
            }

            const serverConfig = subscriptions[e.group_id].servers[serverId];
            const playerIndex = serverConfig.players.indexOf(playerName);

            if (playerIndex === -1) {
                e.reply('该玩家不在推送列表中');
                return;
            }

            serverConfig.players.splice(playerIndex, 1);
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已取消对玩家 ${playerName} 的动态推送`);
        } catch (error) {
            console.error('取消推送失败:', error);
            e.reply('取消推送失败，请稍后重试');
        }
    }
} 