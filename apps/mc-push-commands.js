import plugin from '../../../lib/plugins/plugin.js'
import { Data } from '../models/index.js'
import { queryServerStatus } from '../models/mc-status.js'

export class MCPush extends plugin {
    constructor() {
        super({
            name: 'MCTool-推送',
            dsc: 'Minecraft服务器推送服务',
            event: 'message',
            priority: 5000,
            task: {
                name: 'MCTool服务器状态检查',
                cron: '*/1 * * * *',
                fnc: () => this.checkServerStatus()
            },
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
    }

    async checkServerStatus() {
        try {
            const servers = Data.read('servers');
            const current = Data.read('current');

            // 遍历所有服务器
            for (const [serverId, serverConfig] of Object.entries(servers)) {
                const oldStatus = current[serverId];
                const newStatus = await queryServerStatus(serverConfig.address);
                
                // 处理状态变化
                if (oldStatus?.online !== newStatus.online || 
                    JSON.stringify(oldStatus?.players?.list) !== JSON.stringify(newStatus.players?.list)) {
                    await this.handleServerStatusChange(serverId, oldStatus, newStatus);
                }
            }
        } catch (error) {
            console.error('[MCTool] 检查服务器状态失败:', error);
        }
    }

    async handleServerStatusChange(serverId, oldStatus, newStatus) {
        const pushConfig = Data.read('push_config');
        if (!pushConfig || !pushConfig[serverId]) return;

        const serverConfig = Data.read('servers')[serverId];
        if (!serverConfig) return;

        for (const groupId of Object.keys(pushConfig[serverId])) {
            const groupConfig = pushConfig[serverId][groupId];
            
            // 处理服务器状态变化
            if (groupConfig.statusPush && oldStatus?.online !== newStatus.online) {
                const msg = newStatus.online 
                    ? `服务器 ${serverConfig.name} 已上线！\n版本: ${newStatus.version}\n${newStatus.description || ''}`
                    : `服务器 ${serverConfig.name} 已离线！`;
                await this.sendGroupMsg(groupId, msg);
            }

            // 处理玩家列表变化
            if (groupConfig.playerPush && newStatus.online) {
                const oldPlayers = new Set(oldStatus?.players?.list || []);
                const newPlayers = new Set(newStatus.players.list);
                
                // 检查新加入的玩家
                for (const player of newPlayers) {
                    if (!oldPlayers.has(player)) {
                        await this.sendGroupMsg(groupId, 
                            `玩家 ${player} 加入了服务器 ${serverConfig.name}`);
                    }
                }
                
                // 检查离开的玩家
                for (const player of oldPlayers) {
                    if (!newPlayers.has(player)) {
                        await this.sendGroupMsg(groupId,
                            `玩家 ${player} 离开了服务器 ${serverConfig.name}`);
                    }
                }
            }
        }

        // 更新当前状态
        const current = Data.read('current');
        current[serverId] = newStatus;
        Data.write('current', current);
    }

    async sendGroupMsg(groupId, msg) {
        await Bot.pickGroup(groupId).sendMsg(msg);
    }

    async togglePush(e) {
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
            console.error('[MCTool] 操作推送功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async configurePlayerPush(e) {
        try {
            const match = e.msg.match(/^#[Mm][Cc]推送玩家\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc推送玩家 <服务器ID> <玩家名/all>');
                return;
            }

            const [, serverId, playerName] = match;
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            // 检查服务器是否存在
            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {}
                };
            }

            // 初始化服务器配置
            if (!subscriptions[e.group_id].servers[serverId]) {
                subscriptions[e.group_id].servers[serverId] = {
                    enabled: true,
                    newPlayerAlert: false,
                    players: []
                };
            }

            const serverConfig = subscriptions[e.group_id].servers[serverId];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = ['all'];
                Data.write('subscriptions', subscriptions);
                e.reply(`已设置推送 ${servers[serverId].name} 的所有玩家动态`);
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
            console.error('[MCTool] 配置推送失败:', error);
            e.reply('配置推送失败，请稍后重试');
        }
    }

    async toggleNewPlayerAlert(e) {
        try {
            const match = e.msg.match(/^#[Mm][Cc](开启|关闭)新人推送\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc开启新人推送 <服务器ID>');
                return;
            }

            const [, action, serverId] = match;
            const isEnable = action === '开启';
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            // 检查服务器是否存在
            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {}
                };
            }

            // 初始化服务器配置
            if (!subscriptions[e.group_id].servers[serverId]) {
                subscriptions[e.group_id].servers[serverId] = {
                    enabled: true,
                    newPlayerAlert: false,
                    players: []
                };
            }

            // 更新新人推送设置
            subscriptions[e.group_id].servers[serverId].newPlayerAlert = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${isEnable ? '开启' : '关闭'}服务器 ${servers[serverId].name} 的新玩家提醒`);
        } catch (error) {
            console.error('[MCTool] 操作新玩家���醒失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async toggleServerStatusPush(e) {
        try {
            const isEnable = e.msg.includes('开启');
            const subscriptions = Data.read('subscriptions');
            
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {}
                };
            }

            // 更新状态推送设置
            subscriptions[e.group_id].statusPush = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${isEnable ? '开启' : '关闭'}服务器状态推送`);
        } catch (error) {
            console.error('[MCTool] 操作状态推送失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async cancelPush(e) {
        try {
            const match = e.msg.match(/^#[Mm][Cc]取消推送\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc取消推送 <服务器ID> <玩家名/all>');
                return;
            }

            const [, serverId, playerName] = match;
            const servers = Data.read('servers');
            const subscriptions = Data.read('subscriptions');

            // 检查服务器是否存在
            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            if (!subscriptions[e.group_id]?.servers[serverId]) {
                e.reply('未找到该服务器的推送配置');
                return;
            }

            const serverConfig = subscriptions[e.group_id].servers[serverId];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = [];
                Data.write('subscriptions', subscriptions);
                e.reply(`已取消 ${servers[serverId].name} 的所有玩家推送`);
                return;
            }

            const playerIndex = serverConfig.players.indexOf(playerName);
            if (playerIndex === -1) {
                e.reply('该玩家不在推送列表中');
                return;
            }

            serverConfig.players.splice(playerIndex, 1);
            Data.write('subscriptions', subscriptions);
            e.reply(`已取消对玩家 ${playerName} 的推送`);
        } catch (error) {
            console.error('[MCTool] 取消推送失败:', error);
            e.reply('取消推送失败，请稍后重试');
        }
    }

    async getPushConfig(e) {
        try {
            const subscriptions = Data.read('subscriptions');
            const servers = Data.read('servers');
            const groupConfig = subscriptions[e.group_id];

            if (!groupConfig || !groupConfig.enabled) {
                e.reply('当前群组未开启推送功能');
                return;
            }

            let msg = '当前推送配置：\n';
            msg += `全局推送：${groupConfig.enabled ? '开启' : '关闭'}\n`;
            msg += `状态推送：${groupConfig.statusPush ? '开启' : '关闭'}\n\n`;

            if (groupConfig.servers && Object.keys(groupConfig.servers).length > 0) {
                msg += '服务器配置：\n';
                for (const [serverId, serverConfig] of Object.entries(groupConfig.servers)) {
                    const server = servers[serverId];
                    if (!server) continue;

                    msg += `${server.name}：\n`;
                    msg += `  新人提醒：${serverConfig.newPlayerAlert ? '开启' : '关闭'}\n`;
                    msg += `  玩家列表：${serverConfig.players.length > 0 ? 
                        (serverConfig.players[0] === 'all' ? '全部' : serverConfig.players.join(', ')) : 
                        '无'}\n`;
                }
            } else {
                msg += '暂无服务器配置';
            }

            e.reply(msg);
        } catch (error) {
            console.error('[MCTool] 获取推送配置失败:', error);
            e.reply('获取推送配置失败，请稍后重试');
        }
    }
} 