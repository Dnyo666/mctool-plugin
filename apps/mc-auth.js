import plugin from '../../../lib/plugins/plugin.js';
import { Data, initDataFiles, checkGroupAdmin } from './mc-utils.js';
import common from '../../../lib/common/common.js';

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
            event: 'message.group',
            priority: 5000,
            rule: [
                {
                    reg: '^#[Mm][Cc]验证$',
                    fnc: 'showAuthConfig'
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
                    fnc: 'listVerifiedUsers'
                },
                {
                    reg: '^#[Mm][Cc]验证删除\\s*\\d+$',
                    fnc: 'removeVerifiedUser',
                    permission: 'admin'
                }
            ]
        });

        // 初始化数据目录和文件
        initDataFiles();
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
            logger.error('操作验证功能失败:', error);
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
            logger.error('配置验证功能失败:', error);
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
            logger.error('获取验证配置失败:', error);
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
            logger.error('获取已验证用户列表失败:', error);
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
            logger.error('移除验证用户失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async sendForwardMsg(e, messages) {
        try {
            if (!messages.length) return;
            const msg = await common.makeForwardMsg(e, messages, '已验证用户列表');
            await e.reply(msg);
        } catch (error) {
            logger.error('发送转发消息失败:', error);
            e.reply('发送消息失败，请稍后重试');
        }
    }
} 