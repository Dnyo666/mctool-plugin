import { Data, getPlayerUUID, checkGroupAdmin, getConfig } from './mc-utils.js';

export class MCAuth extends plugin {
    constructor() {
        super({
            name: 'MCTool-验证',
            dsc: 'Minecraft玩家验证配置',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc]验证\\s*$',
                    fnc: 'getVerificationStatus',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证\\s+(开启|关闭)$',
                    fnc: 'toggleVerification',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证重复使用\\s+(开启|关闭)$',
                    fnc: 'toggleDuplicateNames',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证拒绝\\s+(开启|关闭)$',
                    fnc: 'toggleAutoReject',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证列表$',
                    fnc: 'listVerifiedUsers',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证删除\\s+(.+)$',
                    fnc: 'deleteVerification',
                    permission: 'admin'
                }
            ]
        });
    }

    /**
     * 验证用户名是否存在
     * @param {string} username Minecraft用户名
     * @returns {Promise<{exists: boolean, uuid?: string, raw_id?: string}>}
     */
    async verifyUsername(username) {
        const { uuid, raw_id } = await getPlayerUUID(username);
        return {
            exists: !!uuid,
            uuid,
            raw_id
        };
    }

    /**
     * 获取验证状态
     * @param {*} e 事件对象
     */
    async getVerificationStatus(e) {
        // 检查权限
        if (!await checkGroupAdmin(e)) return false;

        // 获取群组验证配置
        let config = Data.getGroupVerification(e.group_id);
        
        // 构建状态消息
        const message = [
            '当前验证功能配置：',
            `验证状态：${config.enabled ? '已开启' : '已关闭'}`,
            `允许重复使用：${config.allowDuplicateNames ? '是' : '否'}`,
            `自动拒绝重复：${config.autoReject ? '是' : '否'}`,
            `验证请求过期时间：${config.expireTime}秒`,
            `最大验证请求数：${config.maxRequests}次`,
            '',
            '可用命令：',
            '#mc验证 开启/关闭 - 开启或关闭验证功能',
            '#mc验证重复使用 开启/关闭 - 设置是否允许重复用户名',
            '#mc验证拒绝 开启/关闭 - 设置是否自动拒绝重复用户名',
            '#mc验证列表 - 查看已验证用户',
            '#mc验证删除 <用户名> - 删除指定验证记录'
        ].join('\n');

        await e.reply(message);
        return true;
    }

    /**
     * 开关验证功能
     * @param {*} e 消息事件
     */
    async toggleVerification(e) {
        if (!await checkGroupAdmin(e)) return false;

        const enable = e.msg.includes('开启');
        
        // 获取全局配置
        const globalConfig = getConfig();
        const defaultVerification = {
            enabled: globalConfig.verification?.enabled ?? false,
            expireTime: globalConfig.verification?.expireTime ?? 86400,
            maxRequests: globalConfig.verification?.maxRequests ?? 5,
            allowDuplicateNames: false,
            autoReject: true
        };

        // 获取或创建群组配置
        let config = Data.getGroupVerification(e.group_id);
        if (!config || Object.keys(config).length === 0) {
            config = {
                enabled: defaultVerification.enabled,
                expireTime: defaultVerification.expireTime,
                maxRequests: defaultVerification.maxRequests,
                allowDuplicateNames: defaultVerification.allowDuplicateNames,
                autoReject: defaultVerification.autoReject,
                users: {}
            };
        }

        config.enabled = enable;
        Data.saveGroupVerification(e.group_id, config);

        await e.reply(`已${enable ? '开启' : '关闭'}验证功能`);
        return true;
    }

    /**
     * 开关重复使用功能
     * @param {*} e 消息事件
     */
    async toggleDuplicateNames(e) {
        if (!await checkGroupAdmin(e)) return false;

        const enable = e.msg.includes('开启');
        
        // 获取全局配置
        const globalConfig = getConfig();
        const defaultVerification = {
            enabled: globalConfig.verification?.enabled ?? false,
            expireTime: globalConfig.verification?.expireTime ?? 86400,
            maxRequests: globalConfig.verification?.maxRequests ?? 5,
            allowDuplicateNames: false,
            autoReject: true
        };

        // 获取或创建群组配置
        let config = Data.getGroupVerification(e.group_id);
        if (!config || Object.keys(config).length === 0) {
            config = {
                enabled: defaultVerification.enabled,
                expireTime: defaultVerification.expireTime,
                maxRequests: defaultVerification.maxRequests,
                allowDuplicateNames: defaultVerification.allowDuplicateNames,
                autoReject: defaultVerification.autoReject,
                users: {}
            };
        }

        config.allowDuplicateNames = enable;
        Data.saveGroupVerification(e.group_id, config);

        await e.reply(`已${enable ? '允许' : '禁止'}重复使用用户名`);
        return true;
    }

    /**
     * 开关自动拒绝功能
     * @param {*} e 消息事件
     */
    async toggleAutoReject(e) {
        if (!await checkGroupAdmin(e)) return false;

        const enable = e.msg.includes('开启');
        
        // 获取全局配置
        const globalConfig = getConfig();
        const defaultVerification = {
            enabled: globalConfig.verification?.enabled ?? false,
            expireTime: globalConfig.verification?.expireTime ?? 86400,
            maxRequests: globalConfig.verification?.maxRequests ?? 5,
            allowDuplicateNames: false,
            autoReject: true
        };

        // 获取或创建群组配置
        let config = Data.getGroupVerification(e.group_id);
        if (!config || Object.keys(config).length === 0) {
            config = {
                enabled: defaultVerification.enabled,
                expireTime: defaultVerification.expireTime,
                maxRequests: defaultVerification.maxRequests,
                allowDuplicateNames: defaultVerification.allowDuplicateNames,
                autoReject: defaultVerification.autoReject,
                users: {}
            };
        }

        config.autoReject = enable;
        Data.saveGroupVerification(e.group_id, config);

        await e.reply(`已${enable ? '开启' : '关闭'}自动拒绝功能`);
        return true;
    }

    /**
     * 列出已验证用户
     * @param {*} e 消息事件
     */
    async listVerifiedUsers(e) {
        if (!await checkGroupAdmin(e)) return false;

        const verifiedUsers = Data.getGroupData('verification_users', e.group_id);
        if (!verifiedUsers || Object.keys(verifiedUsers).length === 0) {
            await e.reply('当前群组没有已验证的用户');
            return true;
        }

        let msg = '已验证用户列表：';
        for (const [qq, data] of Object.entries(verifiedUsers)) {
            const username = data.username;
            const uuid = data.uuid || '未知';
            const verifyTime = new Date(data.verifyTime).toLocaleString();
            msg += `\n\nQQ：${qq}\n用户名：${username}\nUUID：${uuid}\n验证时间：${verifyTime}`;
        }

        await e.reply(msg);
        return true;
    }

    /**
     * 删除验证记录
     * @param {*} e 消息事件
     */
    async deleteVerification(e) {
        if (!await checkGroupAdmin(e)) return false;

        const username = e.msg.match(/^#?[Mm][Cc]验证删除\s+(.+)$/)[1].trim();
        if (!username) {
            await e.reply('请提供要删除验证的用户名');
            return false;
        }

        const verifiedUsers = Data.getGroupData('verification_users', e.group_id);
        let found = false;
        for (const [qq, data] of Object.entries(verifiedUsers)) {
            if (data.username.toLowerCase() === username.toLowerCase()) {
                delete verifiedUsers[qq];
                found = true;
                break;
            }
        }

        if (!found) {
            await e.reply('未找到该用户名的验证记录');
            return false;
        }

        Data.saveGroupData('verification_users', e.group_id, verifiedUsers);
        await e.reply(`已删除用户 ${username} 的验证记录`);
        return true;
    }
} 