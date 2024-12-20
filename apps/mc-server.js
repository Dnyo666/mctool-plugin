import plugin from '../../../lib/plugins/plugin.js';
import { Data, checkGroupAdmin, queryServerStatus } from './mc-utils.js';
import common from '../../../lib/common/common.js';

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
                    reg: '^#[Mm][Cc]add\\s+\\S+\\s+\\S+\\s*.*$',
                    /** 执行方法 */
                    fnc: 'addServer',
                    /** 权限 */
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]del\\s+\\S+$',
                    fnc: 'deleteServer',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]status$',
                    fnc: 'getServerStatus',
                    permission: 'all'
                },
                {
                    reg: '^#[Mm][Cc]list$',
                    fnc: 'getServerList',
                    permission: 'all'
                },
                {
                    reg: '^#[Mm][Cc]online$',
                    fnc: 'getOnlinePlayers',
                    permission: 'all'
                }
            ]
        });
    }

    async addServer(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc]add\s+(\S+)\s+(\S+)\s*(.*)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mcadd <名称> <地址> [描述]');
                return;
            }

            const [, name, address, description = ''] = match;
            const servers = Data.read('servers');
            
            if (Object.values(servers).some(server => server.address === address)) {
                e.reply('该服务器地址已存在');
                return;
            }

            const serverId = Date.now().toString();
            servers[serverId] = {
                name,
                address,
                description,
                addTime: Date.now()
            };

            Data.write('servers', servers);
            
            e.reply(`服务器添加成功\n名称: ${name}\n地址: ${address}\n描述: ${description}`);
        } catch (error) {
            console.error('[MCTool] 添加服务器失败:', error);
            e.reply('添加服务器失败，请稍后重试');
        }
    }

    async deleteServer(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc]del\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mcdel <服务器ID>');
                return;
            }

            const [, serverId] = match;
            const servers = Data.read('servers');

            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            delete servers[serverId];
            Data.write('servers', servers);
            
            e.reply(`已删除ID为 ${serverId} 的服务器`);
        } catch (error) {
            console.error('[MCTool] 删除服务器失败:', error);
            e.reply('删除服务器失败，请稍后重试');
        }
    }

    async getServerStatus(e) {
        try {
            const servers = Data.read('servers');
            if (Object.keys(servers).length === 0) {
                e.reply('暂无服务器配置');
                return;
            }

            const statusList = [];
            for (const [serverId, server] of Object.entries(servers)) {
                const status = await queryServerStatus(server.address);
                statusList.push(
                    `服务器: ${server.name}\n` +
                    `状态: ${status.online ? '在线' : '离线'}${status.online ? 
                        `\n版本: ${status.version}\n在线人数: ${status.players.online}/${status.players.max}` : 
                        ''}\n` +
                    `描述: ${server.description || '无'}`
                );
            }

            if (statusList.length > 3) {
                await this.reply_forward_msg(e, statusList);
            } else {
                e.reply(statusList.join('\n\n'));
            }
        } catch (error) {
            console.error('[MCTool] 获取服务器状态失败:', error);
            e.reply('获取服务器状态失败，请稍后重试');
        }
    }

    async getServerList(e) {
        try {
            const servers = Data.read('servers');
            if (Object.keys(servers).length === 0) {
                e.reply('暂无服务器配置');
                return;
            }

            const serverList = Object.entries(servers).map(([serverId, server]) => 
                `ID: ${serverId}\n` +
                `名称: ${server.name}\n` +
                `地址: ${server.address}\n` +
                `描述: ${server.description || '无'}`
            );

            if (serverList.length > 3) {
                await this.reply_forward_msg(e, serverList);
            } else {
                e.reply(serverList.join('\n\n'));
            }
        } catch (error) {
            console.error('[MCTool] 获取服务器列表失败:', error);
            e.reply('获取服务器列表失败，请稍后重试');
        }
    }

    async getOnlinePlayers(e) {
        try {
            const servers = Data.read('servers');
            if (Object.keys(servers).length === 0) {
                e.reply('暂无服务器配置');
                return;
            }

            const messages = [];
            for (const [serverId, server] of Object.entries(servers)) {
                const status = await queryServerStatus(server.address);
                if (status.online) {
                    const playerList = status.players.list.length > 0 ? 
                        status.players.list.join(', ') : 
                        '无玩家在线';
                    messages.push(
                        `服务器: ${server.name}\n` +
                        `在线人数: ${status.players.online}/${status.players.max}\n` +
                        `玩家列表: ${playerList}`
                    );
                } else {
                    messages.push(`服务器: ${server.name}\n状态: 离线`);
                }
            }

            if (messages.length > 3) {
                await this.reply_forward_msg(e, messages);
            } else {
                e.reply(messages.join('\n\n'));
            }
        } catch (error) {
            console.error('[MCTool] 获取在线玩家失败:', error);
            e.reply('获取在线玩家失败，请稍后重试');
        }
    }

    async reply_forward_msg(e, messages) {
        try {
            const msg = await common.makeForwardMsg(e, messages, '服务器状态信息');
            await e.reply(msg);
        } catch (error) {
            console.error('[MCTool] 发送转发消息失败:', error);
            e.reply('发送消息失败，请稍后重试');
        }
    }
} 