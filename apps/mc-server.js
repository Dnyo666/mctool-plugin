import { Data, checkGroupAdmin, queryServerStatus, getConfig } from './mc-utils.js';
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
                    reg: '^#?[Mm][Cc](添加|add)\\s+\\S+\\s+\\S+\\s*.*$',
                    /** 执行方法 */
                    fnc: 'addServer',
                    /** 权限 */
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc](删除|del)\\s+\\d+$',
                    fnc: 'deleteServer',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc](���态|status|列表|list)$',
                    fnc: 'getServerList',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc](在线|online)$',
                    fnc: 'getOnlinePlayers',
                    permission: 'all'
                }
            ]
        });
    }

    async addServer(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc](?:add|添加)\s+(\S+)\s+(\S+)\s*(.*)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc添加 <名称> <地址> [描述]');
                return;
            }

            const [, name, address, description = ''] = match;
            const servers = Data.getGroupData('servers', e.group_id);
            
            // 检查服务器数量限制
            const maxServers = getConfig('maxServers') || 10;
            if (Object.keys(servers).length >= maxServers) {
                e.reply(`每个群最多只能添加 ${maxServers} 个服务器`);
                return;
            }

            // 检查是否已存在相同地址的服务器
            if (Object.values(servers).some(server => server.address === address)) {
                e.reply('该服务器地址已存在');
                return;
            }

            // 获取当前最大ID
            const maxId = Object.keys(servers).reduce((max, id) => Math.max(max, parseInt(id) || 0), 0);
            const serverId = (maxId + 1).toString();

            servers[serverId] = {
                name,
                address,
                description,
                addTime: Date.now()
            };

            Data.saveGroupData('servers', e.group_id, servers);
            
            e.reply(`服务器添加成功\nID: ${serverId}\n名称: ${name}\n地址: ${address}\n描述: ${description}`);
        } catch (error) {
            console.error('[MCTool] 添加服务器失败:', error);
            e.reply('添加服务器失败，请稍后重试');
        }
    }

    async deleteServer(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc](?:del|删除)\s+(\d+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc删除 <ID>');
                return;
            }

            const [, serverId] = match;
            const servers = Data.getGroupData('servers', e.group_id);

            if (!servers[serverId]) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            const serverInfo = servers[serverId];
            delete servers[serverId];
            Data.saveGroupData('servers', e.group_id, servers);
            
            e.reply(`已删除服务器\nID: ${serverId}\n名称: ${serverInfo.name}`);
        } catch (error) {
            console.error('[MCTool] 删除服务器失败:', error);
            e.reply('删除失败，请稍后重试');
        }
    }

    /**
     * 查询服务器状态
     * @param {string} serverId 服务器ID
     * @param {string} groupId 群号
     * @returns {Promise<Object>} 服务器状态
     */
    async queryServer(serverId, groupId) {
        const server = Data.getGroupServer(groupId, serverId);
        if (!server) {
            return null;
        }

        const config = getConfig();
        if (!config.apis || !Array.isArray(config.apis) || config.apis.length === 0) {
            logger.error('[MCTool] 未配置有效的API');
            return null;
        }

        // 遍历所有API尝试查询
        for (const api of config.apis) {
            try {
                const result = await queryServerStatus(server.address, api);
                if (result && result.online) {
                    return result;
                }
            } catch (error) {
                logger.error(`[MCTool] API ${api.name} 查询失败:`, error);
            }
        }

        return null;
    }

    /**
     * 获取服务器列表
     * @param {*} e 事件对象
     */
    async getServerList(e) {
        try {
            const servers = Data.getGroupData('servers', e.group_id);
            if (Object.keys(servers).length === 0) {
                e.reply('当前群组未添加任何服务器');
                return true;
            }

            const config = getConfig();
            if (!config.apis || !Array.isArray(config.apis) || config.apis.length === 0) {
                logger.error('[MCTool] 未配置有效的API');
                await e.reply('未配置有效的API，请联系管理员检查配置');
                return true;
            }

            const messages = [
                '服务器列表：\n' +
                '可用命令：\n' +
                '#mc添加 <名称> <地址> [描述] - 添加服务器\n' +
                '#mc删除 <ID> - 删除服务器\n' +
                '#mc在线 - 查看服务器在线状态'
            ];

            for (const [id, server] of Object.entries(servers)) {
                try {
                    const status = await this.queryServer(id, e.group_id);
                    
                    let statusText = '未知';
                    if (status) {
                        if (!status.online) {
                            statusText = '离线';
                        } else {
                            statusText = '在线';
                            if (status.version) {
                                statusText += `\n版本: ${status.version}`;
                            }
                            statusText += `\n在线人数: ${status.players.online}/${status.players.max}`;
                        }
                    }

                    messages.push(
                        `服务器信息 [${id}]:\n` +
                        `名称: ${server.name}\n` +
                        `地址: ${server.address}\n` +
                        `描述: ${server.description || '无'}\n` +
                        `状态: ${statusText}`
                    );
                } catch (error) {
                    logger.error(`[MCTool] 查询服务器 ${id} 失败:`, error);
                    messages.push(
                        `服务器信息 [${id}]:\n` +
                        `名称: ${server.name}\n` +
                        `地址: ${server.address}\n` +
                        `描述: ${server.description || '无'}\n` +
                        `状态: 查询出错`
                    );
                }

                // 在服务器之间添加短暂延迟
                if (Object.keys(servers).length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // 使用合并转发
            await this.reply_forward_msg(e, messages);
            return true;
        } catch (error) {
            logger.error('[MCTool] 获取服务器列表失败:', error);
            e.reply('获取服务器列表失败，请稍后重试');
            return true;
        }
    }

    async getServerStatus(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const servers = Data.getGroupData('servers', e.group_id);
            if (Object.keys(servers).length === 0) {
                e.reply('当前群组未添加任何服务器');
                return;
            }

            // 获取配置的最大并发数
            const maxConcurrent = getConfig('task.maxConcurrent') || 5;
            const current = Data.read('current');
            const statusList = [];
            const serverEntries = Object.entries(servers);

            // 分批处理服务器查询
            for (let i = 0; i < serverEntries.length; i += maxConcurrent) {
                const batch = serverEntries.slice(i, i + maxConcurrent);
                const promises = batch.map(async ([id, server]) => {
                    try {
                        const status = current[id];
                        if (!status) {
                            return `[${id}] ${server.name}: 未知`;
                        }

                        if (status.api && !status.api.success) {
                            return `[${id}] ${server.name}: 查询失败 (${status.api.name})`;
                        }

                        const playerCount = status.players?.online || 0;
                        const maxPlayers = status.players?.max || 0;
                        const playerList = (status.players?.list || [])
                            .map(p => typeof p === 'string' ? p : (p.name || p.name_clean || ''))
                            .filter(name => name)
                            .join(', ');

                        let statusText = status.online ? '在线' : '离线';
                        if (status.online) {
                            statusText += ` (${playerCount}/${maxPlayers})`;
                            if (playerCount > 0 && playerList) {
                                statusText += `\n在线玩家: ${playerList}`;
                            }
                        }

                        return `[${id}] ${server.name}: ${statusText}`;
                    } catch (error) {
                        logger.error(`[MCTool] 处理服务器 ${id} 状态失败:`, error);
                        return `[${id}] ${server.name}: 处理失败`;
                    }
                });

                const results = await Promise.all(promises);
                statusList.push(...results);

                // 添加适当的延迟，避免API限制
                if (i + maxConcurrent < serverEntries.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            let msg = [
                '服务器状态：',
                ...statusList
            ];

            if (statusList.length > 5) {
                const forwardMsg = await common.makeForwardMsg(e, msg, '服务器状态');
                await e.reply(forwardMsg);
            } else {
                e.reply(msg.join('\n'));
            }
        } catch (error) {
            logger.error('[MCTool] 获取服务器状态失败:', error);
            e.reply('获取服务器状态失败，请稍后重试');
        }
    }

    async getOnlinePlayers(e) {
        try {
            const servers = Data.getGroupData('servers', e.group_id);
            if (Object.keys(servers).length === 0) {
                e.reply('当前群组未添加任何服务器');
                return true;
            }

            const config = getConfig();
            if (!config.apis || !Array.isArray(config.apis) || config.apis.length === 0) {
                logger.error('[MCTool] 未配置有效的API');
                await e.reply('未配置有效的API，请联系管理员检查配置');
                return true;
            }

            const messages = ['服务器在线状态：'];

            for (const [id, server] of Object.entries(servers)) {
                try {
                    // 使用统一的查询方法
                    const status = await this.queryServer(id, e.group_id);
                    
                    let message = `[${id}] ${server.name}`;
                    if (!status || !status.online) {
                        message += ': 离线';
                    } else {
                        message += `\n在线人数: ${status.players.online}/${status.players.max}`;
                        
                        // 处理玩家列表
                        const playerNames = status.players.list
                            .map(p => typeof p === 'string' ? p : p.name)
                            .filter(Boolean);

                        if (playerNames.length > 0) {
                            message += `\n在线玩家: ${playerNames.join('、')}`;
                        } else if (status.players.online > 0) {
                            message += '\n协议端未展示玩家列表或存在分服';
                        } else {
                            message += '\n当前无玩家在线';
                        }
                    }
                    messages.push(message);
                } catch (error) {
                    logger.error(`[MCTool] 查询服务器 ${id} 失败:`, error);
                    messages.push(`[${id}] ${server.name}: 查询出错`);
                }

                // 在服务器之间添加短暂延迟
                if (Object.keys(servers).length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // 使用合并转发
            await this.reply_forward_msg(e, messages);
            return true;
        } catch (error) {
            logger.error('[MCTool] 获取在线玩家失败:', error);
            e.reply('获取在线玩家失败，请稍后重试');
            return true;
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