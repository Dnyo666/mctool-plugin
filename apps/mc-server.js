import plugin from '../../../lib/plugins/plugin.js';
import { Data, checkGroupAdmin, queryServerStatus, CONFIG, initDataFiles } from './mc-utils.js';
import common from '../../../lib/common/common.js';
import logger from '../../../lib/logger/logger.js';

export class MCServer extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'MCTool-服务器',
            /** 功能描述 */
            dsc: 'Minecraft服务器管理',
            /** 指令正则匹配 */
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 5000,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#[Mm][Cc]列表$',
                    /** 执行方法 */
                    fnc: 'getServersStatus',
                    /** 权限 */
                    permission: 'all'
                },
                {
                    reg: '^#[Mm][Cc]添加\\s+.+\\s+.+\\s*.*$',
                    fnc: 'addServer',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]删除\\s+\\d+$',
                    fnc: 'deleteServer',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]在线$',
                    fnc: 'getOnlinePlayers',
                    permission: 'all'
                }
            ]
        });

        initDataFiles();
    }

    async addServer(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc]添加\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc添加 [名称] [地址:端口] [描述]');
                return;
            }

            const [, name, address, description = '无描述'] = match;
            const servers = Data.read('servers');
            
            if (!servers[e.group_id]) {
                servers[e.group_id] = [];
            }

            if (servers[e.group_id].some(s => s.address === address)) {
                e.reply('该服务器地址已存在');
                return;
            }

            const id = servers[e.group_id].length > 0 
                ? Math.max(...servers[e.group_id].map(s => s.id)) + 1 
                : 1;

            servers[e.group_id].push({ id, name, address, description });
            Data.write('servers', servers);
            
            e.reply(`服务器添加成功\n名称: ${name}\n地址: ${address}\n描述: ${description}`);
        } catch (error) {
            logger.error('[MCTool] 添加服务器失败:', error);
            e.reply('添加服务器失败，请稍后重试');
        }
    }

    async deleteServer(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const serverId = parseInt(e.msg.match(/\d+/)[0]);
            const servers = Data.read('servers');

            if (!servers[e.group_id] || !servers[e.group_id].length) {
                e.reply('该群未添加任何服务器');
                return;
            }

            const index = servers[e.group_id].findIndex(s => s.id === serverId);
            if (index === -1) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            servers[e.group_id].splice(index, 1);
            Data.write('servers', servers);
            
            e.reply(`已删除ID为 ${serverId} 的服务器`);
        } catch (error) {
            logger.error('[MCTool] 删除服务器失败:', error);
            e.reply('删除服务器失败，请稍后重试');
        }
    }

    async getServersStatus(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        try {
            const servers = Data.read('servers');
            if (!servers[e.group_id] || !servers[e.group_id].length) {
                e.reply('该群未添加任何服务器\n请管理员使用 #mc添加 添加服务器');
                return;
            }

            const statusList = await Promise.all(servers[e.group_id].map(async server => {
                const status = await queryServerStatus(server.address);
                const statusText = status.online ? '在线🟢' : '离线🔴';
                const players = status.online ? `${status.players.online}/${status.players.max}` : '0/0';

                return `ID: ${server.id}\n名称: ${server.name}\n地址: ${server.address}\n描述: ${server.description}\n状态: ${statusText}\n在线人数: ${players}`;
            }));

            if (statusList.length >= 5) {
                await this.sendForwardMsg(e, statusList);
            } else {
                e.reply(statusList.join('\n\n'));
            }
        } catch (error) {
            logger.error('[MCTool] 获取服务器状态失败:', error);
            e.reply('获取服务器状态失败，请稍后重试');
        }
    }

    async getOnlinePlayers(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        try {
            const servers = Data.read('servers');
            if (!servers[e.group_id] || !servers[e.group_id].length) {
                e.reply('该群未添加任何服务器\n请管理员使用 #mc添加 添加服务器');
                return;
            }

            let totalPlayers = 0;
            const onlineServers = [];
            
            // 查询所有服务器状态
            await Promise.all(servers[e.group_id].map(async server => {
                const status = await queryServerStatus(server.address);
                if (status.online) {
                    totalPlayers += status.players.list.length;
                    onlineServers.push({
                        name: server.name,
                        players: status.players.list,
                        maxPlayers: status.players.max
                    });
                }
            }));

            if (onlineServers.length === 0) {
                e.reply('当前没有在线的服务器');
                return;
            }

            // 格式化服务器信息
            const messages = onlineServers.map(server => {
                const playerList = server.players.length > 0 ? 
                    server.players.join('\n') : 
                    '暂无玩家在线';
                return `${server.name} (${server.players.length}/${server.maxPlayers})\n${playerList}`;
            });

            // 根据玩家数量决定是否使用转发消息
            if (totalPlayers > 15 || onlineServers.some(s => s.players.length > 10)) {
                await this.sendForwardMsg(e, messages);
            } else {
                e.reply(messages.join('\n\n'));
            }
        } catch (error) {
            logger.error('[MCTool] 获取在线玩家失败:', error);
            e.reply('获取在线玩家失败，请稍后重试');
        }
    }

    async sendForwardMsg(e, messages) {
        try {
            if (!messages.length) return;
            const msg = await common.makeForwardMsg(e, messages, '服务器状态信息');
            await e.reply(msg);
        } catch (error) {
            logger.error('[MCTool] 发送转发消息失败:', error);
            e.reply('发送消息失败，请稍后重试');
        }
    }
} 