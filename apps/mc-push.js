import { Data, getConfig, queryServerStatus } from './mc-utils.js'
import common from '../../../lib/common/common.js'
import schedule from 'node-schedule'

// 使用静态变量来跟踪初始化状态
let isInitialized = false;
let job = null; // 用于存储定时任务实例

export class MCPush extends plugin {
    constructor() {
        super({
            name: 'MCTool-推送',
            dsc: 'Minecraft服务器推送服务',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^$',  // 空规则，不会匹配任何消息
                    fnc: 'noop'
                }
            ]
        });

        // 仅在未初始化时执行初始化
        if (!isInitialized) {
            this.init();
        }
    }

    async noop() { }  // 空方法

    async init() {
        // 如果已经初始化，直接返回
        if (isInitialized) {
            return;
        }

        // 设置初始化标志
        isInitialized = true;

        logger.mark('[MCTool] 初始化推送服务...');
        
        // 获取配置
        const config = getConfig();
        const { cron } = config.schedule;

        
        // 确保数据文件存在
        const current = Data.read('current') || {};
        const historical = Data.read('historical') || {};
        
        Data.write('current', current);
        Data.write('historical', historical);

        // 清空changes.json
        Data.write('changes', {});

        // 启动时进行一次完整检查
        logger.mark('[MCTool] 开始启动时状态检查...');
        await this.checkInitialStatus();

        // 启动定时任务
        try {
            // 如果已经有定时任务在运行，先停止它
            if (job) {
                job.cancel();
                job = null;
            }

            // 从配置文件获取定时任务配置
            const config = getConfig();
            const { cron } = config.schedule;

            // 标准化cron表达式
            const cronParts = cron.split(/\s+/).filter(Boolean);
            if (cronParts.length !== 6) {
                throw new Error('无效的cron表达式：必须包含6个字段（秒 分 时 日 月 周）');
            }

            // 转换cron表达式为node-schedule支持的格式
            // node-schedule不支持秒级别的cron，需要特殊处理
            const second = parseInt(cronParts[0]);
            const minute = cronParts[1].includes('*/') ? Array.from({ length: 60 / parseInt(cronParts[1].split('*/')[1]) }, (_, i) => i * parseInt(cronParts[1].split('*/')[1])) : cronParts[1] === '*' ? null : cronParts[1].split(',').map(Number);
            const hour = cronParts[2] === '*' ? null : cronParts[2].split(',').map(Number);
            const date = cronParts[3] === '*' ? null : cronParts[3].split(',').map(Number);
            const month = cronParts[4] === '*' ? null : cronParts[4].split(',').map(Number);
            const dayOfWeek = cronParts[5] === '*' ? null : cronParts[5].split(',').map(Number);

            const scheduleRule = {
                second: second, // 确保秒字段为整数
                minute: minute, // 确保分钟字段为数组或null
                hour: hour,     // 确保小时字段为数组或null
                date: date,     // 确保日期字段为数组或null
                month: month,   // 确保月份字段为数组或null
                dayOfWeek: dayOfWeek // 确保星期字段为数组或null
            };

            // 创建定时任务
            job = schedule.scheduleJob(scheduleRule, async () => {
                // 使用锁避免并发执行
                if (this.isChecking) {
                    logger.mark('[MCTool] 上一次检查任务尚未完成，跳过本次检查');
                    return;
                }
                this.isChecking = true;

                logger.mark(`[MCTool] 开始执行定时检查任务... (cron: ${cron})`);
                try {
                    await this.checkServerStatus();
                } catch (error) {
                    logger.error('[MCTool] 定时任务执行失败:', error);
                } finally {
                    this.isChecking = false;
                }
            });

            if (job) {
                const nextInvocation = job.nextInvocation();
                logger.mark(`[MCTool] 定时任务已启动`);
                logger.mark(`[MCTool] cron表达式: ${cron}`);
                logger.mark(`[MCTool] 下次执行时间: ${nextInvocation}`);
                
                // 输出更详细的调度信息
                const parts = [];
                if (scheduleRule.second !== '*') parts.push(`第 ${scheduleRule.second} 秒`);
                if (scheduleRule.minute !== '*') parts.push(`第 ${scheduleRule.minute} 分`);
                if (scheduleRule.hour !== '*') parts.push(`第 ${scheduleRule.hour} 时`);
                if (scheduleRule.date !== '*') parts.push(`${scheduleRule.date} 日`);
                if (scheduleRule.month !== '*') parts.push(`${scheduleRule.month} 月`);
                if (scheduleRule.dayOfWeek !== '*') parts.push(`星期 ${scheduleRule.dayOfWeek}`);
                
                logger.mark(`[MCTool] 执行规则: ${parts.length > 0 ? parts.join('，') : '每分钟'}`);
            } else {
                logger.error(`[MCTool] 定时任务创建失败，scheduleRule: ${JSON.stringify(scheduleRule)}`);
                throw new Error('定时任务创建失败');
            }
        } catch (error) {
            logger.error(`[MCTool] 启动定时任务失败: ${error.message}`);
            logger.error(`[MCTool] 当前cron表达式: ${config?.schedule?.cron || '未知'}`);
            logger.error('[MCTool] 请检查cron表达式格式是否正确，格式说明：秒 分 时 日 月 周');
            logger.error('[MCTool] 示例：');
            logger.error('  - 30 * * * * *     每分钟的第30秒执行');
            logger.error('  - 0 */5 * * * *    每5分钟的第0秒执行');
            logger.error('  - 0 0,30 * * * *   每小时的第0分和第30分的第0秒执行');
            logger.error(`[MCTool] 错误详情: ${error.stack}`);
        }

        logger.mark('[MCTool] 推送服务初始化完成');
    }

    async checkInitialStatus() {
        try {
            // 读取配置
            const config = getConfig();
            const apis = config.apis || [];
            
            if (apis.length === 0) {
                logger.error('[MCTool] 未配置API，请在config.yaml中配置apis');
                return;
            }

            // 读取数据文件
            const subscriptions = Data.read('subscriptions') || {};

            // 收集需要检查的服务器
            const groupServers = new Map(); // 按群组收集服务器
            for (const [groupId, groupConfig] of Object.entries(subscriptions)) {
                if (!groupConfig?.enabled) continue;
                
                const servers = Data.getGroupData('servers', groupId);
                const groupMessages = [];

                for (const [serverId, serverConfig] of Object.entries(groupConfig.servers)) {
                    if (!serverConfig?.enabled || !servers[serverId]) continue;

                    // 检查服务器状态
                    let serverStatus = null;
                    for (const api of apis) {
                        try {
                            serverStatus = await queryServerStatus(servers[serverId].address, api);
                            if (serverStatus?.api?.success) {
                                logger.mark(`[MCTool] 服务器 ${serverId} 使用 ${api.name} 查询成功`);
                                break;
                            }
                        } catch (error) {
                            logger.error(`[MCTool] 服务器 ${serverId} 使用 ${api.name} 查询失败: ${error.message}`);
                        }
                    }

                    // 生成服务器状态消息
                    const playerList = (serverStatus?.players?.list || [])
                        .map(p => typeof p === 'string' ? p : p.name)
                        .filter(Boolean);

                    let statusMsg = [
                        `服务器：${servers[serverId].name}`,
                        `状态：${serverStatus?.api?.success ? (serverStatus.online ? '在线' : '离线') : '离线'}`,
                        `地址：${servers[serverId].address}`
                    ];

                    if (serverStatus?.api?.success && serverStatus.online) {
                        statusMsg.push(
                            `在线人数：${serverStatus.players?.online || 0}/${serverStatus.players?.max || 0}`,
                            `在线玩家：${playerList.length > 0 ? playerList.join('、') : '无'}`
                        );
                    } else {
                        statusMsg.push('当前无法连接到服务器');
                    }

                    groupMessages.push(statusMsg.join('\n'));

                    // 更新当前状态
                    const current = Data.read('current') || {};
                    current[serverId] = serverStatus;
                    Data.write('current', current);

                    // 添加延迟避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (groupMessages.length > 0) {
                    groupServers.set(groupId, groupMessages);
                }
            }

            // 只有在配置启用时才发送消息
            if (config.schedule.startupNotify) {
                // 向每个群发送消息
                for (const [groupId, messages] of groupServers) {
                    try {
                        // 准备转发消息数组
                        let forwardMsg = [];
                        
                        // 添加标题
                        forwardMsg.push({
                            message: '机器人启动完毕，服务器状态如下：',
                            user_id: Bot.uin,
                            nickname: Bot.nickname
                        });

                        // 每个服务器单独一条消息
                        messages.forEach(msg => {
                            forwardMsg.push({
                                message: msg,
                                user_id: Bot.uin,
                                nickname: Bot.nickname
                            });
                        });

                        // 发送合并转发消息
                        await Bot.pickGroup(groupId).sendMsg(await Bot.makeForwardMsg(forwardMsg));
                        
                        logger.mark(`[MCTool] 已向群组 ${groupId} 推送启动状态检查结果`);
                    } catch (error) {
                        logger.error(`[MCTool] 向群组 ${groupId} 推送启动状态检查结果失败:`, error);
                        logger.error(`[MCTool] 错误详情: ${error.stack}`);
                        // 如果转发失败，尝试直接发送
                        try {
                            await Bot.pickGroup(groupId).sendMsg(['机器人启动完毕，服务器状态如下：', ...messages].join('\n\n'));
                        } catch (err) {
                            logger.error(`[MCTool] 直接发送消息也失败:`, err);
                        }
                    }
                }
            } else {
                logger.mark('[MCTool] 根据配置，跳过启动状态推送');
            }

            logger.mark('[MCTool] 启动状态检查完成');
        } catch (error) {
            logger.error('[MCTool] 启动状态检查失败:', error);
            logger.error(`[MCTool] 错误详情: ${error.stack}`);
        }
    }

    async checkServerStatus(isRetry = false) {
        try {
            // 读取配置
            const config = getConfig();
            const apis = config.apis || [];
            
            if (apis.length === 0) {
                logger.error('[MCTool] 未配置API，请在config.yaml中配置apis');
                return;
            }

            // 读取数据文件
            const current = Data.read('current') || {};
            const historical = Data.read('historical') || {};
            const subscriptions = Data.read('subscriptions') || {};

            // 收集需要检查的服务器
            const serversToCheck = new Map();
            for (const [groupId, groupConfig] of Object.entries(subscriptions)) {
                if (!groupConfig?.enabled) continue;
                
                const servers = Data.getGroupData('servers', groupId);
                for (const [serverId, serverConfig] of Object.entries(groupConfig.servers)) {
                    if (serverConfig?.enabled && servers[serverId]) {
                        serversToCheck.set(serverId, {
                            ...servers[serverId],
                            groupConfigs: [...(serversToCheck.get(serverId)?.groupConfigs || []), { groupId, config: groupConfig }]
                        });
                        logger.mark(`[MCTool] 添加服务器${serverId}到检查列表`);
                    }
                }
            }

            if (serversToCheck.size === 0) {
                logger.mark('[MCTool] 没有需要检查的服务器');
                return;
            }

            logger.mark(`[MCTool] 开始检查 ${serversToCheck.size} 个服务器`);

            // 存储所有需要推送的消息
            const groupMessages = new Map();

            // 检查每个服务器
            for (const [serverId, serverInfo] of serversToCheck) {
                try {
                    logger.mark(`[MCTool] 检查服务器 ${serverId} (${serverInfo.address})`);
                    const oldStatus = current[serverId];
                    let newStatus = null;

                    // 尝试所有API
                    for (const api of apis) {
                        try {
                            newStatus = await queryServerStatus(serverInfo.address, api);
                            if (newStatus?.api?.success) {
                                logger.mark(`[MCTool] 服务器 ${serverId} 使用 ${api.name} 查询成功`);
                                break;
                            }
                        } catch (error) {
                            logger.error(`[MCTool] 服务器 ${serverId} 使用 ${api.name} 查询失败: ${error.message}`);
                        }
                    }

                    if (!newStatus?.api?.success) {
                        logger.error(`[MCTool] 服务器 ${serverId} 所有API查询失败`);
                        continue;
                    }

                    // 检查状态变化
                    const statusChanged = !oldStatus?.online !== !newStatus.online;
                    const oldPlayerList = new Set((oldStatus?.players?.list || []).map(p => typeof p === 'string' ? p : p.name));
                    const newPlayerList = new Set((newStatus.players?.list || []).map(p => typeof p === 'string' ? p : p.name));

                    // 检测玩家变化
                    const joinedPlayers = [...newPlayerList].filter(p => !oldPlayerList.has(p));
                    const leftPlayers = [...oldPlayerList].filter(p => !newPlayerList.has(p));

                    // 处理玩家变化
                    if (joinedPlayers.length > 0 || leftPlayers.length > 0) {
                        // 更新历史记录
                        for (const player of newPlayerList) {
                            if (!historical[player]) {
                                historical[player] = {
                                    firstSeen: Date.now(),
                                    lastSeen: Date.now(),
                                    servers: [serverId]
                                };
                                logger.mark(`[MCTool] 发现新玩家: ${player}`);
                            } else {
                                historical[player].lastSeen = Date.now();
                                if (!historical[player].servers.includes(serverId)) {
                                    historical[player].servers.push(serverId);
                                    logger.mark(`[MCTool] 玩家${player}首次在服务器${serverId}上线`);
                                }
                            }
                        }

                        // 为每个群组准备玩家变化消息
                        for (const { groupId, config: groupConfig } of serverInfo.groupConfigs) {
                            if (!groupMessages.has(groupId)) {
                                groupMessages.set(groupId, []);
                            }

                            const messages = groupMessages.get(groupId);
                            const serverConfig = groupConfig.servers[serverId];

                            if (newStatus.online) {
                                const shouldPushPlayer = (player) => {
                                    return serverConfig.players.includes('all') || 
                                           serverConfig.players.includes(player);
                                };

                                // 玩家上下线
                                for (const player of joinedPlayers) {
                                    if (shouldPushPlayer(player)) {
                                        messages.push(`服务器 ${serverInfo.name}: 玩家 ${player} 进入服务器`);
                                    }
                                }

                                for (const player of leftPlayers) {
                                    if (shouldPushPlayer(player)) {
                                        messages.push(`服务器 ${serverInfo.name}: 玩家 ${player} 离开服务器`);
                                    }
                                }

                                // 新玩家提醒
                                if (groupConfig.newPlayerAlert) {
                                    for (const player of joinedPlayers) {
                                        if (!historical[player] || !historical[player].servers.includes(serverId)) {
                                            messages.push(`服务器 ${serverInfo.name}: 发现新玩家 ${player}`);
                                        }
                                    }
                                }
                            }
                        }

                        // 更新数据
                        Data.write('historical', historical);
                    }

                    // 处理服务器状态变化（直接处理，不再进行二次检测）
                    if (statusChanged) {
                        // 为每个群组准备状态变化消息
                        for (const { groupId, config: groupConfig } of serverInfo.groupConfigs) {
                            if (!groupMessages.has(groupId)) {
                                groupMessages.set(groupId, []);
                            }

                            const messages = groupMessages.get(groupId);
                            const serverConfig = groupConfig.servers[serverId];

                            // 服务器状态变化
                            if (serverConfig.statusPush || groupConfig.serverStatusPush) {
                                // 处理玩家列表，确保获取正确的玩家名称
                                const playerList = (newStatus.players?.list || [])
                                    .map(p => {
                                        if (typeof p === 'string') return p;
                                        if (typeof p === 'object' && p !== null) return p.name || p.name_clean || '';
                                        return '';
                                    })
                                    .filter(name => name !== '');

                                const statusMsg = newStatus.online ? 
                                    `服务器 ${serverInfo.name}: 已上线\n` +
                                    `在线人数：${newStatus.players?.online || 0}/${newStatus.players?.max || 0}\n` +
                                    `在线玩家：${playerList.length > 0 ? playerList.join('、') : '无'}` :
                                    `服务器 ${serverInfo.name}: 已离线`;
                                messages.push(statusMsg);
                                logger.mark(`[MCTool] 服务器 ${serverId} 状态变化：${statusMsg}`);
                            }
                        }
                    }

                    // 更新当前状态
                    current[serverId] = newStatus;
                    Data.write('current', current);

                    // 添加延迟避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    logger.error(`[MCTool] 处理服务器 ${serverId} 时发生错误:`, error);
                    logger.error(`[MCTool] 错误详情: ${error.stack}`);
                }
            }

            // 发送消息
            for (const [groupId, messages] of groupMessages) {
                if (messages.length > 0) {
                    try {
                        // 准备转发消息
                        const forwardMessages = messages.map((msg, index) => msg);

                        // 使用合并转发发送消息
                        const forwardMsg = await common.makeForwardMsg(Bot, forwardMessages, 'MC服务器状态变化');
                        await Bot.pickGroup(groupId).sendMsg(forwardMsg);
                        
                        logger.mark(`[MCTool] 已向群组 ${groupId} 推送 ${messages.length} 条消息`);
                    } catch (error) {
                        logger.error(`[MCTool] 向群组 ${groupId} 推送消息失败:`, error);
                        logger.error(`[MCTool] 错误详情: ${error.stack}`);
                    }
                }
            }

            logger.mark('[MCTool] 服务器状态检查完成');
        } catch (error) {
            logger.error('[MCTool] 服务器状态检查失败:', error);
            logger.error(`[MCTool] 错误详情: ${error.stack}`);
        }
    }

    /**
     * 检查服务器状态变化
     * @param {string} serverId 服务器ID
     * @param {string} groupId 群号
     * @param {Object} currentStatus 当前状态
     * @param {Object} lastStatus 上次状态
     * @returns {boolean} 是否有变化
     */
    checkStatusChange(serverId, groupId, currentStatus, lastStatus) {
        if (!currentStatus || !lastStatus) return false;

        // 检查在线状态变化
        if (currentStatus.online !== lastStatus.online) {
            return true;
        }

        // 检查玩家数量变化
        if (currentStatus.players.online !== lastStatus.players.online) {
            return true;
        }

        // 检查玩家列表变化
        const currentPlayers = new Set(currentStatus.players.list.map(p => p.name));
        const lastPlayers = new Set(lastStatus.players.list.map(p => p.name));

        if (currentPlayers.size !== lastPlayers.size) {
            return true;
        }

        for (const player of currentPlayers) {
            if (!lastPlayers.has(player)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 生成状态变化消息
     * @param {Object} server 服务器配置
     * @param {Object} currentStatus 当前状态
     * @param {Object} lastStatus 上次状态
     * @returns {string} 状态变化消息
     */
    generateChangeMessage(server, currentStatus, lastStatus) {
        const messages = [`服务器 ${server.name} 状态变化：`];

        // 在线状态变化
        if (currentStatus.online !== lastStatus.online) {
            messages.push(`状态：${lastStatus.online ? '在线' : '离线'} → ${currentStatus.online ? '在线' : '离线'}`);
        }

        // 玩家数量变化
        if (currentStatus.players.online !== lastStatus.players.online) {
            messages.push(`在线人数：${lastStatus.players.online} → ${currentStatus.players.online}`);
        }

        // 玩家列表变化
        const currentPlayers = new Set(currentStatus.players.list.map(p => p.name));
        const lastPlayers = new Set(lastStatus.players.list.map(p => p.name));

        // 新加入的玩家
        const joinedPlayers = [...currentPlayers].filter(p => !lastPlayers.has(p));
        if (joinedPlayers.length > 0) {
            messages.push(`新加入：${joinedPlayers.join(', ')}`);
        }

        // 离开的玩家
        const leftPlayers = [...lastPlayers].filter(p => !currentPlayers.has(p));
        if (leftPlayers.length > 0) {
            messages.push(`已离开：${leftPlayers.join(', ')}`);
        }

        return messages.join('\n');
    }

    /**
     * 处理状态变化
     * @param {string} serverId 服务器ID
     * @param {string} groupId 群号
     * @param {Object} currentStatus 当前状态
     * @param {Object} lastStatus 上次状态
     */
    async handleStatusChange(serverId, groupId, currentStatus, lastStatus) {
        const server = Data.getGroupServer(groupId, serverId);
        if (!server) return;

        // 检查是否有变化
        if (!this.checkStatusChange(serverId, groupId, currentStatus, lastStatus)) {
            return;
        }

        // 生成变化消息
        const message = this.generateChangeMessage(server, currentStatus, lastStatus);

        // 发送消息
        try {
            await Bot.pickGroup(groupId).sendMsg(message);
            logger.mark(`[MCTool] 向群组 ${groupId} 推送服务器 ${serverId} 状态变化`);
        } catch (error) {
            logger.error(`[MCTool] 推送状态变化失败: ${error.message}`);
            logger.error(`[MCTool] 错误详情: ${error.stack}`);
        }

        // 保存当前状态
        Data.saveGroupData('current', groupId, {
            ...Data.getGroupData('current', groupId),
            [serverId]: currentStatus
        });
    }
}