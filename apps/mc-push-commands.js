import { Data, getConfig, checkGroupAdmin } from './mc-utils.js'
import common from '../../../lib/common/common.js'

export class MCPushCommands extends plugin {
    constructor() {
        super({
            name: 'MCTool-推送命令',
            dsc: 'Minecraft服务器推送命令',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc](开启|关闭)推送\\s*(\\d+)?$',
                    fnc: 'togglePush',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc](开启|关闭)新人推送\\s*(\\d+)?$',
                    fnc: 'toggleNewPlayerAlert',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc](开启|关闭)状态推送\\s*(\\d+)?$',
                    fnc: 'toggleServerStatusPush',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]推送玩家\\s+(\\d+)\\s+(\\S+)$',
                    fnc: 'configurePlayerPush',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]取消推送玩家\\s+(\\d+)\\s+(\\S+)$',
                    fnc: 'cancelPlayerPush',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]推送\\s*$',
                    fnc: 'getPushConfig',
                    permission: 'admin'
                }
            ]
        });
    }

    async togglePush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#?[Mm][Cc](开启|关闭)推送\s*(\d+)?$/);
            if (!match) return;

            const [, action, serverId] = match;
            const isEnable = action === '开启';
            const subscriptions = Data.read('subscriptions') || {};
            
            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    serverStatusPush: false,
                    servers: {}
                };
            }

            // 如果指定了服务器ID
            if (serverId) {
                const servers = Data.getGroupData('servers', e.group_id);
                if (!servers[serverId]) {
                    e.reply(`未找到ID为 ${serverId} 的服务器`);
                    return;
                }

                // 初始化服务器配置
                if (!subscriptions[e.group_id].servers[serverId]) {
                    subscriptions[e.group_id].servers[serverId] = {
                        enabled: false,
                        newPlayerAlert: false,
                        players: []
                    };
                }

                subscriptions[e.group_id].servers[serverId].enabled = isEnable;
                Data.write('subscriptions', subscriptions);
                e.reply(`已${action}服务器 ${servers[serverId].name} (ID: ${serverId}) 的推送功能`);
            } else {
                // 全局推送设置
                subscriptions[e.group_id].enabled = isEnable;
                Data.write('subscriptions', subscriptions);
                e.reply(`已${action}全局推送功能`);
            }
        } catch (error) {
            logger.error('[MCTool] 操作推送功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async getPushConfig(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const subscriptions = Data.read('subscriptions') || {};
            const servers = Data.getGroupData('servers', e.group_id);
            
            // 如果群组配置不存在，创建默认配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    serverStatusPush: false,
                    servers: {}
                };

                // 为所有服务器创建默认配置
                for (const [serverId] of Object.entries(servers)) {
                    subscriptions[e.group_id].servers[serverId] = {
                        enabled: false,
                        newPlayerAlert: false,
                        players: []
                    };
                }

                Data.write('subscriptions', subscriptions);
                logger.mark(`[MCTool] 已为群组 ${e.group_id} 创建默认推送配置`);
            }

            const groupConfig = subscriptions[e.group_id];

            // 准备转发消息
            const forwardMsgs = [];

            // 添加全局配置
            forwardMsgs.push(`全局推送配置：\n` +
                `全局推送：${groupConfig.enabled ? '已开启' : '已关闭'}\n` +
                `状态推送：${groupConfig.serverStatusPush ? '已开启' : '已关闭'}`);

            // 遍历所有服务器，生成配置信息
            for (const [serverId, server] of Object.entries(servers)) {
                // 如果服务器配置不存在，创建默认配置
                if (!groupConfig.servers[serverId]) {
                    groupConfig.servers[serverId] = {
                        enabled: false,
                        newPlayerAlert: false,
                        players: []
                    };
                }

                const serverConfig = groupConfig.servers[serverId];
                forwardMsgs.push(
                    `服务器配置 [${serverId}]：\n` +
                    `名称：${server.name}\n` +
                    `地址：${server.address}\n` +
                    `推送状态：${serverConfig.enabled ? '已开启' : '已关闭'}\n` +
                    `新人提醒：${serverConfig.newPlayerAlert ? '已开启' : '已关闭'}\n` +
                    `玩家推送：${serverConfig.players.length > 0 ? 
                        (serverConfig.players[0] === 'all' ? '全部' : serverConfig.players.join('、')) : 
                        '无'}`
                );
            }

            // 添加命令说明
            forwardMsgs.push(
                `可用命令：\n` +
                `#mc开启/关闭推送 [ID] - 开启或关闭推送\n` +
                `#mc开启/关闭状态推送 [ID] - 开启或关闭服务器状态推送\n` +
                `#mc推送玩家 <ID> <玩家名/all> - 添加玩家推送\n` +
                `#mc开启/关闭新人推送 <ID> - 开启或关闭新玩家提醒\n` +
                `#mc取消推送玩家 <ID> <玩家名/all> - 取消玩家推送`
            );

            // 使用合并转发发送消息
            const forwardMsg = await common.makeForwardMsg(e, forwardMsgs, 'MC服务器推送配置');
            await e.reply(forwardMsg);
        } catch (error) {
            logger.error('[MCTool] 获取推送配置失败:', error);
            e.reply('获取推送配置失败，请稍后重试');
        }
    }

    async toggleNewPlayerAlert(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#?[Mm][Cc](开启|关闭)新人推送\s*(\d+)?$/);
            if (!match) return;

            const [, action, serverId] = match;
            if (!serverId) {
                e.reply('请指定服务器ID\n用法: #mc开启新人推送 <服务器ID>');
                return;
            }

            const isEnable = action === '开启';
            const servers = Data.getGroupData('servers', e.group_id);
            const subscriptions = Data.read('subscriptions') || {};

            // 检查服务器是否存在
            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    serverStatusPush: false,
                    servers: {}
                };
            }

            // 初始化服务器配置
            if (!subscriptions[e.group_id].servers[serverId]) {
                subscriptions[e.group_id].servers[serverId] = {
                    enabled: false,
                    newPlayerAlert: false,
                    players: []
                };
            }

            // 更新新人推送设置
            subscriptions[e.group_id].servers[serverId].newPlayerAlert = isEnable;
            Data.write('subscriptions', subscriptions);
            
            e.reply(`已${action}服务器 ${servers[serverId].name} (ID: ${serverId}) 的新玩家提醒`);
        } catch (error) {
            logger.error('[MCTool] 操作新玩家提醒失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async toggleServerStatusPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#?[Mm][Cc](开启|关闭)状态推送\s*(\d+)?$/);
            if (!match) return;

            const [, action, serverId] = match;
            const isEnable = action === '开启';
            const subscriptions = Data.read('subscriptions') || {};
            
            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    serverStatusPush: false,
                    servers: {}
                };
            }

            // 如果指定了服务器ID
            if (serverId) {
                const servers = Data.getGroupData('servers', e.group_id);
                if (!servers[serverId]) {
                    e.reply(`未找到ID为 ${serverId} 的服务器`);
                    return;
                }

                // 初始化服务器配置
                if (!subscriptions[e.group_id].servers[serverId]) {
                    subscriptions[e.group_id].servers[serverId] = {
                        enabled: false,
                        newPlayerAlert: false,
                        players: []
                    };
                }

                subscriptions[e.group_id].servers[serverId].statusPush = isEnable;
                Data.write('subscriptions', subscriptions);
                e.reply(`已${action}服务器 ${servers[serverId].name} (ID: ${serverId}) 的状态推送`);
            } else {
                // 全局状态推送设置
                subscriptions[e.group_id].serverStatusPush = isEnable;
                Data.write('subscriptions', subscriptions);
                e.reply(`已${action}全局状态推送功能`);
            }
        } catch (error) {
            logger.error('[MCTool] ��作状态推送功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async configurePlayerPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#?[Mm][Cc]推送玩家\s+(\d+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc推送玩家 <ID> <玩家名/all>');
                return;
            }

            const [, serverId, playerName] = match;
            const servers = Data.getGroupData('servers', e.group_id);
            const subscriptions = Data.read('subscriptions') || {};

            // 检查服务器是否存在
            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            // 初始化群组配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    serverStatusPush: false,
                    servers: {}
                };
            }

            // 初始化服务器配置
            if (!subscriptions[e.group_id].servers[serverId]) {
                subscriptions[e.group_id].servers[serverId] = {
                    enabled: false,
                    newPlayerAlert: false,
                    players: []
                };
            }

            const serverConfig = subscriptions[e.group_id].servers[serverId];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = ['all'];
                Data.write('subscriptions', subscriptions);
                e.reply(`已设置推送 ${servers[serverId].name} (ID: ${serverId}) 的所有玩家动态`);
                return;
            }

            if (!serverConfig.players.includes(playerName) && serverConfig.players[0] !== 'all') {
                serverConfig.players.push(playerName);
                Data.write('subscriptions', subscriptions);
                e.reply(`已添加对玩家 ${playerName} 的动态推送\n服务器: ${servers[serverId].name} (ID: ${serverId})`);
            } else {
                e.reply('该玩家已在推送列表中');
            }
        } catch (error) {
            logger.error('[MCTool] 配置推送失败:', error);
            e.reply('配置推送失败，请稍后重试');
        }
    }

    async cancelPlayerPush(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#?[Mm][Cc]取消推送玩家\s+(\d+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc取消推送玩家 <ID> <玩家名/all>');
                return;
            }

            const [, serverId, playerName] = match;
            const servers = Data.getGroupData('servers', e.group_id);
            const subscriptions = Data.read('subscriptions') || {};

            // 检查服务器是否存在
            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            // 检查推送配置是否存在
            if (!subscriptions[e.group_id]?.servers[serverId]) {
                e.reply('未找到该服务器的推送配置');
                return;
            }

            const serverConfig = subscriptions[e.group_id].servers[serverId];

            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = [];
                Data.write('subscriptions', subscriptions);
                e.reply(`已取消 ${servers[serverId].name} (ID: ${serverId}) 的所有玩家推送`);
                return;
            }

            const playerIndex = serverConfig.players.indexOf(playerName);
            if (playerIndex === -1) {
                e.reply('该玩家不在推送列表中');
                return;
            }

            serverConfig.players.splice(playerIndex, 1);
            Data.write('subscriptions', subscriptions);
            e.reply(`已取消对玩家 ${playerName} 的推送\n服务器: ${servers[serverId].name} (ID: ${serverId})`);
        } catch (error) {
            logger.error('[MCTool] 取消推送失败:', error);
            e.reply('取消推送失败，请稍后重试');
        }
    }
} 