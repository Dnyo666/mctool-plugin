import plugin from '../../../lib/plugins/plugin.js';
import { Data, initDataFiles, checkGroupAdmin } from './mc-utils.js';
import common from '../../../lib/common/common.js';
import fetch from 'node-fetch';

// MC用户名格式验证正则
const MC_USERNAME_REGEX = /^[A-Za-z0-9_]{3,26}$/i;

// 默认群配置
const DEFAULT_GROUP_CONFIG = {
    enabled: false,         // 是否开启验证
    allowReuse: false,      // 是否允许重复使用
    rejectDuplicate: true   // 是否直接拒绝重复用户名
};

export class MCAuth extends plugin {
    constructor() {
        super({
            name: 'MCTool-验证',
            dsc: 'Minecraft正版用户验证',
            event: ['message', 'request.group.add'],
            priority: 5000,
            rule: [
                {
                    reg: '^#[Mm][Cc]验证$',
                    fnc: 'showAuthConfig',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]验证\\s*(开启|关闭)$',
                    fnc: 'handleAuth',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]验证\\s*(重复使用|拒绝)\\s*(开启|关闭)$',
                    fnc: 'configureAuth',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]验证列表$',
                    fnc: 'listVerifiedUsers',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]验证删除\\s*\\d+$',
                    fnc: 'removeVerifiedUser',
                    permission: 'admin'
                }
            ]
        });

        // 先初始化数据目录和文件
        initDataFiles();
        // 再初始化验证相关的文件
        this.initFiles();
    }

    initFiles() {
        // 初始化数据文件
        const authConfig = Data.read('auth_config') || {};
        if (!authConfig.groups) {
            authConfig.groups = {};
        }
        Data.write('auth_config', authConfig);

        const verifiedUsers = Data.read('verified_users') || {};
        Data.write('verified_users', verifiedUsers);
    }

    async handleAuth(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const isEnable = e.msg.match(/开启/);
            const config = Data.read('auth_config');
            
            if (!config.groups[e.group_id]) {
                config.groups[e.group_id] = { ...DEFAULT_GROUP_CONFIG };
            }

            config.groups[e.group_id].enabled = isEnable;
            Data.write('auth_config', config);
            
            const tips = isEnable ? 
                '验证功能已开启\n您可以通过以下命令进行更详细的设置：\n#mc验证重复使用 开启/关闭 - 是否允许重复用户名\n#mc验证拒绝 开启/关闭 - 是否自动拒绝重复用户名' :
                '验证功能已关闭';
            
            e.reply(tips);
        } catch (error) {
            console.error('操作验证功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async configureAuth(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const match = e.msg.match(/^#[Mm][Cc]验证\s*(重复使用|拒绝)\s*(开启|关闭)$/);
            const [, option, value] = match;
            const isEnable = value === '开启';
            
            const config = Data.read('auth_config');
            if (!config.groups[e.group_id]) {
                config.groups[e.group_id] = { ...DEFAULT_GROUP_CONFIG };
            }

            const groupConfig = config.groups[e.group_id];
            
            switch (option) {
                case '重复使用':
                    groupConfig.allowReuse = isEnable;
                    if (isEnable) {
                        groupConfig.rejectDuplicate = false;
                    }
                    break;
                case '拒绝':
                    groupConfig.rejectDuplicate = isEnable;
                    if (isEnable) {
                        groupConfig.allowReuse = false;
                    }
                    break;
            }

            Data.write('auth_config', config);

            let tips = `已${value}${option}功能`;
            if (option === '重复使用' && isEnable) {
                tips += '\n注意：开启重复使用会自动关闭拒绝功能';
            } else if (option === '拒绝' && isEnable) {
                tips += '\n注意：开启拒绝会自动关闭重复使用功能';
            }

            e.reply(tips);
        } catch (error) {
            console.error('配置验证功能失败:', error);
            e.reply('配置失败，请稍后重试');
        }
    }

    async showAuthConfig(e) {
        try {
            const config = Data.read('auth_config');
            const groupConfig = config.groups[e.group_id] || { ...DEFAULT_GROUP_CONFIG };

            const status = [
                '当前验证功能配置：',
                `验证状态：${groupConfig.enabled ? '已开启' : '已关闭'}`,
                `允许重复使用：${groupConfig.allowReuse ? '是' : '否'}`,
                `自动拒绝重复：${groupConfig.rejectDuplicate ? '是' : '否'}`,
                '',
                '可用命令：',
                '#mc验证 开启/关闭 - 开启或关闭验证功能',
                '#mc验证重复使用 开启/关闭 - 设置是否允许重复用户名',
                '#mc验证拒绝 开启/关闭 - 设置是否自动拒绝重复用户名',
                '#mc验证列表 - 查看已验证用户',
                '#mc验证删除 <序号> - 删除指定验证记录'
            ].join('\n');

            e.reply(status);
        } catch (error) {
            console.error('获取验证配置失败:', error);
            e.reply('获取配置失败，请稍后重试');
        }
    }

    async listVerifiedUsers(e) {
        try {
            const verifiedUsers = Data.read('verified_users');
            const groupUsers = verifiedUsers[e.group_id] || [];

            if (groupUsers.length === 0) {
                e.reply('当前群没有已验证的用户');
                return;
            }

            const userList = groupUsers.map((user, index) => 
                `${index + 1}. QQ: ${user.qq}\n   用户名: ${user.username}`
            );

            if (userList.length >= 10) {
                await this.sendForwardMsg(e, userList);
            } else {
                e.reply(['已验证用户列表：', ...userList].join('\n'));
            }
        } catch (error) {
            console.error('获取已验证用户列表失败:', error);
            e.reply('获取列表失败，请稍后重试');
        }
    }

    async removeVerifiedUser(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const index = parseInt(e.msg.match(/\d+/)[0]) - 1;
            const verifiedUsers = Data.read('verified_users');
            const groupUsers = verifiedUsers[e.group_id] || [];

            if (index < 0 || index >= groupUsers.length) {
                e.reply('无效的用户序号');
                return;
            }

            const removedUser = groupUsers.splice(index, 1)[0];
            verifiedUsers[e.group_id] = groupUsers;
            Data.write('verified_users', verifiedUsers);

            e.reply(`已移除验证用户：${removedUser.username} (QQ: ${removedUser.qq})`);
        } catch (error) {
            console.error('移除验证用户失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async sendForwardMsg(e, messages) {
        try {
            if (!messages.length) return;
            const msg = await common.makeForwardMsg(e, messages, '已验证用户列表');
            await e.reply(msg);
        } catch (error) {
            console.error('发送转发消息失败:', error);
            e.reply('发送消息失败，请稍后重试');
        }
    }

    // 处理入群验证
    async accept(e) {
        // 检查群是否开启验证
        const config = Data.read('auth_config');
        const groupConfig = config.groups[e.group_id];
        if (!groupConfig?.enabled) return false;

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
            logger.info(`[MC正版验证] 用户名验证通过: ${username}`);
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
        return false;
    }

    handleUsedUsername(e, username) {
        this.sendGroupMsg(e.group_id, `用户名 ${username} 已被使用，不允许重复进群`);
        e.approve(false);
        return false;
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
                username: username
            });
            Data.write('verified_users', verifiedUsers);

            this.sendGroupMsg(e.group_id, 
                `✅ 验证成功！\n用户名: ${data.username}\nUUID: ${data.uuid}`);
            e.approve(true);
        } else {
            this.sendGroupMsg(e.group_id, `❌ 验证失败：${data.message}`);
            e.approve(false);
        }
        return false;
    }

    handleError(e, error) {
        const errorMessage = error.name === 'AbortError' 
            ? '验证请求超时，请稍后重试'
            : '验证过程中出现错误，请稍后重试';
            
        logger.error(`[MC正版验证] ${error.message}`);
        this.sendGroupMsg(e.group_id, errorMessage);
        e.approve(false);
        return false;
    }

    sendGroupMsg(groupId, msg) {
        Bot.pickGroup(groupId).sendMsg(msg);
    }
} 