import plugin from '../lib/plugins/plugin.js';
import { Data, checkGroupAdmin, queryServerStatus, CONFIG, initDataFiles } from './mc-utils.js';
import common from '../lib/common/common.js';

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
                    reg: '^#mc列表$',
                    /** 执行方法 */
                    fnc: 'getServersStatus',
                    /** 权限 */
                    permission: 'all'
                },
                {
                    reg: '^#mc添加\\s+.+\\s+.+\\s*.*$',
                    fnc: 'addServer',
                    permission: 'admin'
                },
                {
                    reg: '^#mc删除\\s+\\d+$',
                    fnc: 'deleteServer',
                    permission: 'admin'
                },
                {
                    reg: '^#mc在线$',
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
            const match = e.msg.match(/^#mc添加\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
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
            console.error('添加服务器失败:', error);
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
            console.error('删除服务器失败:', error);
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
            console.error('获取服务器状态失败:', error);
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
                e.reply('该群未添加任何服务器\n请管理员使用 #mc添加 加服务器');
                return;
            }

            let totalPlayers = 0;
            const playersList = await Promise.all(servers[e.group_id].map(async server => {
                const status = await queryServerStatus(server.address);
                
                if (!status.online) {
                    return {
                        message: `服务器: ${server.name}\n状态: 离线🔴`,
                        playerCount: 0
                    };
                }

                const playerNames = status.players.list.join('\n');
                totalPlayers += status.players.list.length;

                return {
                    message: `服务器: ${server.name}\n状态: 在线🟢\n在线人数: ${status.players.online}/${status.players.max}\n在线玩家:\n${playerNames || '暂无玩家在线'}`,
                    playerCount: status.players.list.length
                };
            }));

            const needForward = playersList.some(s => s.playerCount > 10) || totalPlayers > 15;
            const messages = playersList.map(s => s.message);

            if (needForward) {
                await this.sendForwardMsg(e, messages);
            } else {
                e.reply(messages.join('\n\n'));
            }
        } catch (error) {
            console.error('获取在线玩家失败:', error);
            e.reply('获取在线玩家失败，请稍后重试');
        }
    }

    async sendForwardMsg(e, messages) {
        try {
            if (!messages.length) return;
            const msg = await common.makeForwardMsg(e, messages, '服务器状态信息');
            await e.reply(msg);
        } catch (error) {
            console.error('发送转发消息失败:', error);
            e.reply('发送消息失败，请稍后重试');
        }
    }
} 