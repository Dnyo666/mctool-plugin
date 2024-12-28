import plugin from '../../../lib/plugins/plugin.js';
import { Data, getPlayerUUID } from './mc-utils.js';

// MC用户名格式验证正则
const MC_USERNAME_REGEX = /^[A-Za-z0-9_]{3,16}$/i;

export class MCAuthRequest extends plugin {
    constructor() {
        super({
            name: 'MCTool-验证请求',
            dsc: 'Minecraft玩家验证请求处理',
            event: 'request.group.add',
            priority: 5000
        });
    }

    /**
     * 处理进群验证请求
     * @param {*} e 事件对象
     */
    async accept(e) {
        try {
            logger.mark(`[MCTool] 收到进群申请：群号 ${e.group_id}，用户 ${e.user_id}，验证信息：${e.comment || '无'}`);

            // 获取群组验证配置
            const config = Data.getGroupVerification(e.group_id);
            
            // 如果群组未开启验证，直接跳过
            if (!config?.enabled) {
                logger.mark(`[MCTool] 群 ${e.group_id} 未开启验证，跳过处理`);
                return false;  // 返回 false 表示不处理该请求，让其他插件或系统处理
            }

            // 验证用户名格式
            const result = this.validateUsername(e.comment);
            if (!result.valid) {
                return this.handleInvalidUsername(e);
            }

            // 记录验证请求
            Data.addVerificationRequest(e.group_id, e.user_id, {
                username: result.username,
                comment: e.comment,
                status: 'pending'
            });

            // 检查用户名是否已被验证
            const existingUser = Object.entries(config.users || {}).find(([_, data]) => 
                data.username.toLowerCase() === result.username.toLowerCase()
            );

            // 如果不允许重复使用且用户名已被使用
            if (!config.allowDuplicateNames && existingUser) {
                return this.handleUsedUsername(e, result.username);
            }

            // 验证玩家名是否存在
            const { uuid, raw_id } = await getPlayerUUID(result.username);
            return this.handleVerificationResult(e, {
                success: !!uuid,
                username: result.username,
                uuid,
                raw_uuid: raw_id
            });

        } catch (error) {
            return this.handleError(e, error);
        }
    }

    /**
     * 验证用户名格式
     * @param {string} comment 验证信息
     * @returns {{valid: boolean, username: string}} 验证结果
     */
    validateUsername(comment) {
        let username = comment?.trim() || '';
        logger.info(`[MCTool] 原始输入: ${username}`);

        // 如果输入符合MC用户名格式，直接使用
        if (MC_USERNAME_REGEX.test(username)) {
            logger.info(`[MCTool] 用户名验证通过: ${username}`);
            return { valid: true, username: username };
        }

        // 尝试理问题答案格式
        const match = username.match(/问题：.*\n答案：(.+)$/);
        if (match) {
            username = match[1].trim();
            if (MC_USERNAME_REGEX.test(username)) {
                logger.info(`[MCTool] 从问答中提取的用户名验证通过: ${username}`);
                return { valid: true, username: username };
            }
        }

        logger.info(`[MCTool] 用户名格式不符合要求: ${username}`);
        return { valid: false, username: username };
    }

    /**
     * 处理无效用户名
     * @param {*} e 事件对象
     */
    handleInvalidUsername(e) {
        const username = e.comment?.trim();
        if (!username) {
            this.sendGroupMsg(e.group_id, '请在申请信息中填写MC用户名');
            e.approve(false);
            Data.updateVerificationRequest(e.group_id, e.user_id, false);
        } else {
            // 提取真实用户名
            const match = username.match(/问题：.*\n答案：(.+)$/);
            const mcUsername = match ? match[1].trim() : username;
            this.sendGroupMsg(e.group_id, `有mc玩家 ${mcUsername} 申请进群，但用户名格式不正确，请管理员核验`);
        }
        return false;
    }

    /**
     * 处理已使用的用户名
     * @param {*} e 事件对象
     * @param {string} username 用户名
     */
    handleUsedUsername(e, username) {
        this.sendGroupMsg(e.group_id, `用户名 ${username} 已被使用，不允许重复进群`);
        e.approve(false);
        Data.updateVerificationRequest(e.group_id, e.user_id, false);
        return false;
    }

    /**
     * 处理验证结果
     * @param {*} e 事件对象
     * @param {object} data 验证数据
     */
    handleVerificationResult(e, data) {
        if (data.success) {
            // 获取群组验证配置
            const config = Data.getGroupVerification(e.group_id);
            
            // 更新用户信息，确保记录所有必要的信息
            config.users[e.user_id] = {
                username: data.username,
                uuid: data.uuid,
                raw_uuid: data.raw_uuid,
                qq: e.user_id,
                group_id: e.group_id,
                verifyTime: Date.now()
            };
            
            // 保存配置
            Data.saveGroupVerification(e.group_id, config);

            // 更新请求状态
            Data.updateVerificationRequest(e.group_id, e.user_id, true);

            // 发送成功消息
            this.sendGroupMsg(e.group_id, [
                '✅ 验证通过！',
                `用户名：${data.username}`,
                `UUID：${data.uuid}`,
                `QQ号：${e.user_id}`
            ].join('\n'));
            e.approve(true);
        } else {
            // 更新请求状态为待处理
            Data.updateVerificationRequest(e.group_id, e.user_id, 'pending');

            // 发送通知消息给管理员
            this.sendGroupMsg(e.group_id, [
                `⚠️ 用户 ${e.user_id} 的验证请求需要管理员处理`,
                `验证用户名：${data.username}`,
                '请管理员确认以下几点：',
                '1. 用户名拼写是否正确',
                '2. 是否使用了正版用户名',
                '3. API 服务是否正常',
                '请管理员手动审核此申请'
            ].join('\n'));
            
            // 不自动拒绝，返回 false 让管理员手动处理
            return false;
        }
        return false;
    }

    /**
     * 处理错误
     * @param {*} e 事件对象
     * @param {Error} error 错误对象
     */
    handleError(e, error) {
        const errorMessage = error.name === 'AbortError' 
            ? '验证请求超时，请稍后重试'
            : '验证过程中出现错误，请稍后重试';
            
        logger.error(`[MCTool] ${error.message}`);
        this.sendGroupMsg(e.group_id, errorMessage);
        e.approve(false);
        Data.updateVerificationRequest(e.group_id, e.user_id, false);
        return false;
    }

    /**
     * 发送群消息
     * @param {number} groupId 群号
     * @param {string|string[]} msg 消息内容
     */
    sendGroupMsg(groupId, msg) {
        try {
            if (Array.isArray(msg)) {
                msg = msg.join('\n');
            }
            Bot.pickGroup(groupId).sendMsg(msg);
        } catch (error) {
            logger.error('[MCTool] 发送消息失败:', error);
        }
    }
} 