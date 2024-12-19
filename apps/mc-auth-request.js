import plugin from '../../../lib/plugins/plugin.js';
import { Data } from './mc-utils.js';
import fetch from 'node-fetch';

// MC用户名格式验证正则
const MC_USERNAME_REGEX = /^[A-Za-z0-9_]{3,26}$/i;

export class MCAuthRequest extends plugin {
    constructor() {
        super({
            name: 'MCTool-验证请求',
            dsc: 'Minecraft正版用户验证入群请求处理',
            event: 'request',
            priority: 5000
        });
    }

    /** 处理入群请求 */
    async accept(e) {
        // 只处理入群请求
        if (e.sub_type !== 'add' || e.request_type !== 'group') {
            return false;
        }

        logger.info(`[MC正版验证] 收到入群请求：${e.user_id} -> ${e.group_id}`);
        logger.info(`[MC正版验证] 申请信息：${e.comment}`);

        // 检查群是否开启验证
        const config = Data.read('auth_config');
        const groupConfig = config.groups?.[e.group_id];
        if (!groupConfig?.enabled) {
            logger.info(`[MC正版验证] 群${e.group_id}未开启验证，跳过处理`);
            return false;
        }

        try {
            // 验证用户名格式
            const username = this.validateUsername(e.comment);
            if (!username.valid) {
                return this.handleInvalidUsername(e);
            }

            // 检查用户名是否已被使用
            if (!groupConfig.allowReuse) {
                const verifiedUsers = Data.read('verified_users');
                const groupUsers = verifiedUsers[e.group_id] || [];
                if (groupUsers.some(user => user.username.toLowerCase() === username.username.toLowerCase())) {
                    return this.handleUsedUsername(e, username.username);
                }
            }

            // 验证正版用户
            const userData = await this.verifyMinecraftUser(username.username);
            return this.handleVerificationResult(e, userData, username.username);

        } catch (error) {
            return this.handleError(e, error);
        }
    }

    validateUsername(comment) {
        let username = comment?.trim() || '';
        
        // 添加调试日志
        logger.info(`[MC正版验证] 原始输入: ${username}`);
        
        // 如果输入符合MC用户名格式，直接使用
        if (MC_USERNAME_REGEX.test(username)) {
            logger.info(`[MC正���验证] 用户名验证通过: ${username}`);
            return { valid: true, username: username };
        }
        
        // 否则尝试处理问题答案格式
        const match = username.match(/问题：.*\n答案：(.+)$/);
        if (match) {
            username = match[1].trim();
            if (MC_USERNAME_REGEX.test(username)) {
                logger.info(`[MC正版验证] 从问答中提取的用户名验证通过: ${username}`);
                return { valid: true, username: username };
            }
        }
        
        logger.info(`[MC正版验证] 用户名格式不符合要求: ${username}`);
        return { valid: false, username: username };
    }

    async verifyMinecraftUser(username) {
        const config = Data.read('auth_config');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout || 5000);

        try {
            logger.info(`[MC正版验证] 正在验证用户名: ${username}`);
            
            const response = await fetch(
                `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
                {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: controller.signal
                }
            );

            if (response.status === 200) {
                const data = await response.json();
                return { code: 200, username: data.name, uuid: data.id };
            } else if (response.status === 404) {
                return { code: 500, message: '找不到该正版用户' };
            } else {
                return { code: response.status, message: '验证服务异常' };
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    handleInvalidUsername(e) {
        const username = e.comment?.trim();
        if (!username) {
            this.sendGroupMsg(e.group_id, `请在申请信息中填写MC用户名`);
            e.approve(false);
        } else {
            const match = username.match(/问题：.*\n答案：(.+)$/);
            const mcUsername = match ? match[1].trim() : username;
            this.sendGroupMsg(e.group_id, `用户名 ${mcUsername} 格式不正确，请使用正确的MC用户名`);
            e.approve(false);
        }
        return true;
    }

    handleUsedUsername(e, username) {
        this.sendGroupMsg(e.group_id, `用户名 ${username} 已被使用，不允许重复进群`);
        e.approve(false);
        return true;
    }

    handleVerificationResult(e, data, username) {
        if (data.code === 200) {
            // 添加验证记录
            const verifiedUsers = Data.read('verified_users');
            if (!verifiedUsers[e.group_id]) {
                verifiedUsers[e.group_id] = [];
            }
            verifiedUsers[e.group_id].push({
                qq: e.user_id,
                username: username,
                time: new Date().getTime()
            });
            Data.write('verified_users', verifiedUsers);

            this.sendGroupMsg(e.group_id, 
                `✅ 验证成功！\n用户名: ${data.username}\nUUID: ${data.uuid}`);
            e.approve(true);
        } else {
            this.sendGroupMsg(e.group_id, `❌ 验证失败：${data.message}`);
            e.approve(false);
        }
        return true;
    }

    handleError(e, error) {
        const errorMessage = error.name === 'AbortError' 
            ? '验证请求超时，请稍后重试'
            : '验证过程中出现错误，请稍后重试';
            
        logger.error(`[MC正版验证] ${error.message}`);
        this.sendGroupMsg(e.group_id, errorMessage);
        e.approve(false);
        return true;
    }

    sendGroupMsg(groupId, msg) {
        Bot.pickGroup(groupId).sendMsg(msg);
    }
} 