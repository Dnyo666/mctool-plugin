import plugin from '../../../lib/plugins/plugin.js';
import { Data, checkGroupAdmin } from './mc-utils.js';

export class MCAuth extends plugin {
    constructor() {
        super({
            name: 'MCTool-验证',
            dsc: 'Minecraft玩家验证',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#[Mm][Cc]验证\\s+\\S+$',
                    fnc: 'verifyPlayer',
                    permission: 'all'
                },
                {
                    reg: '^#[Mm][Cc]验证开启$',
                    fnc: 'enableVerification',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]验证关闭$',
                    fnc: 'disableVerification',
                    permission: 'admin'
                },
                {
                    reg: '^#[Mm][Cc]验证状态$',
                    fnc: 'getVerificationStatus',
                    permission: 'all'
                }
            ]
        });
    }

    async verifyPlayer(e) {
        try {
            const match = e.msg.match(/^#[Mm][Cc]验证\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc验证 <玩家名>');
                return;
            }

            const [, playerName] = match;
            const verificationConfig = Data.read('verification');

            // 检查群组是否开启验证
            if (!verificationConfig[e.group_id]?.enabled) {
                e.reply('当前群组未开启验证功能');
                return;
            }

            // 检查玩家名是否已被验证
            const verifiedPlayers = verificationConfig[e.group_id]?.players || {};
            if (verifiedPlayers[playerName]) {
                e.reply('该玩家名已被验证');
                return;
            }

            // 记录验证信息
            if (!verificationConfig[e.group_id].players) {
                verificationConfig[e.group_id].players = {};
            }
            verificationConfig[e.group_id].players[playerName] = {
                qq: e.user_id,
                verifyTime: Date.now()
            };
            Data.write('verification', verificationConfig);

            e.reply(`玩家 ${playerName} 验证成功`);
        } catch (error) {
            console.error('[MCTool] 验证玩家失败:', error);
            e.reply('验证失败，请稍后重试');
        }
    }

    async enableVerification(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const verificationConfig = Data.read('verification');
            
            if (!verificationConfig[e.group_id]) {
                verificationConfig[e.group_id] = {
                    enabled: false,
                    players: {}
                };
            }

            verificationConfig[e.group_id].enabled = true;
            Data.write('verification', verificationConfig);

            e.reply('已开启验证功能');
        } catch (error) {
            console.error('[MCTool] 开启验证功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async disableVerification(e) {
        if (!await checkGroupAdmin(e)) return;

        try {
            const verificationConfig = Data.read('verification');
            
            if (!verificationConfig[e.group_id]) {
                verificationConfig[e.group_id] = {
                    enabled: false,
                    players: {}
                };
            }

            verificationConfig[e.group_id].enabled = false;
            Data.write('verification', verificationConfig);

            e.reply('已关闭验证功能');
        } catch (error) {
            console.error('[MCTool] 关闭验证功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    async getVerificationStatus(e) {
        try {
            const verificationConfig = Data.read('verification');
            const groupConfig = verificationConfig[e.group_id];

            if (!groupConfig) {
                e.reply('当前群组未配置验证功能');
                return;
            }

            let msg = `验证功能: ${groupConfig.enabled ? '已开启' : '已关闭'}\n`;
            const players = groupConfig.players || {};
            const playerCount = Object.keys(players).length;

            if (playerCount > 0) {
                msg += `\n已验证玩家(${playerCount}个):\n`;
                for (const [playerName, info] of Object.entries(players)) {
                    msg += `${playerName} (QQ: ${info.qq})\n`;
                }
            } else {
                msg += '\n暂无已验证玩家';
            }

            e.reply(msg);
        } catch (error) {
            console.error('[MCTool] 获取验证状态失败:', error);
            e.reply('获取状态失败，请稍后重试');
        }
    }
} 