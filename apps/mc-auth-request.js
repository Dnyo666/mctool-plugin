import plugin from '../../../lib/plugins/plugin.js';
import { Data, checkGroupAdmin } from './mc-utils.js';

export class MCAuthRequest extends plugin {
    constructor() {
        super({
            name: 'MCTool-验证请求',
            dsc: 'Minecraft玩家验证请求处理',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc]验证请求\\s+\\S+$',
                    fnc: 'requestVerification',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]验证通过\\s+\\S+$',
                    fnc: 'approveVerification',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证拒绝\\s+\\S+$',
                    fnc: 'rejectVerification',
                    permission: 'admin'
                },
                {
                    reg: '^#?[Mm][Cc]验证请求列表$',
                    fnc: 'listVerificationRequests',
                    permission: 'admin'
                }
            ]
        });
    }

    async requestVerification(e) {
        try {
            const match = e.msg.match(/^#[Mm][Cc]验证请求\s+(\S+)$/)
            if (!match) {
                e.reply('格式错误\n用法: #mc验证请求 <玩家名>')
                return
            }

            const [, playerName] = match
            const verificationConfig = Data.read('verification')

            // 检查群组是否开启验证
            if (!verificationConfig[e.group_id]?.enabled) {
                e.reply('当前群组未开启验证功能')
                return
            }

            // 检查玩家名是否已被验证
            const verifiedPlayers = verificationConfig[e.group_id]?.players || {}
            if (verifiedPlayers[playerName]) {
                e.reply('该玩家名已被验证')
                return
            }

            // 检查是否已有待处理的请求
            const requests = Data.read('verification_requests')
            if (!requests[e.group_id]) {
                requests[e.group_id] = {}
            }

            if (requests[e.group_id][playerName]) {
                e.reply('该玩家名已有待处理的验证请求')
                return
            }

            // 记录验证请求
            requests[e.group_id][playerName] = {
                qq: e.user_id,
                requestTime: Date.now()
            }
            Data.write('verification_requests', requests)

            e.reply(`已提交验证请求，请等待管理员审核\n玩家名: ${playerName}`)
        } catch (error) {
            console.error('[MCTool] 提交验证请求失败:', error)
            e.reply('提交请求失败，请稍后重试')
        }
    }

    async approveVerification(e) {
        if (!await checkGroupAdmin(e)) return

        try {
            const match = e.msg.match(/^#[Mm][Cc]验证通过\s+(\S+)$/)
            if (!match) {
                e.reply('格式错误\n用法: #mc验证通过 <玩家名>')
                return
            }

            const [, playerName] = match
            const requests = Data.read('verification_requests')

            // 检查是否存在该请求
            if (!requests[e.group_id]?.[playerName]) {
                e.reply('未找到该玩家的验证请求')
                return
            }

            const request = requests[e.group_id][playerName]
            const verificationConfig = Data.read('verification')

            // 添加到已验证列表
            if (!verificationConfig[e.group_id]) {
                verificationConfig[e.group_id] = {
                    enabled: true,
                    players: {}
                }
            }

            verificationConfig[e.group_id].players[playerName] = {
                qq: request.qq,
                verifyTime: Date.now()
            }

            // 删除请求
            delete requests[e.group_id][playerName]

            // 保存更改
            Data.write('verification', verificationConfig)
            Data.write('verification_requests', requests)

            e.reply(`已通过 ${playerName} 的验证请求`)
        } catch (error) {
            console.error('[MCTool] 通过验证请求失败:', error)
            e.reply('操作失败，请稍后重试')
        }
    }

    async rejectVerification(e) {
        if (!await checkGroupAdmin(e)) return

        try {
            const match = e.msg.match(/^#[Mm][Cc]验证拒绝\s+(\S+)$/)
            if (!match) {
                e.reply('格式错误\n用法: #mc验证拒绝 <玩家名>')
                return
            }

            const [, playerName] = match
            const requests = Data.read('verification_requests')

            // 检查是否存在该请求
            if (!requests[e.group_id]?.[playerName]) {
                e.reply('未找到该玩家的验证请求')
                return
            }

            // 删除请求
            delete requests[e.group_id][playerName]
            Data.write('verification_requests', requests)

            e.reply(`已拒绝 ${playerName} 的验证请求`)
        } catch (error) {
            console.error('[MCTool] 拒绝验证请求失败:', error)
            e.reply('操作失败，请稍后重试')
        }
    }

    async listVerificationRequests(e) {
        if (!await checkGroupAdmin(e)) return

        try {
            const requests = Data.read('verification_requests')
            const groupRequests = requests[e.group_id] || {}

            if (Object.keys(groupRequests).length === 0) {
                e.reply('当前没有待处理的验证请求')
                return
            }

            let msg = '待处理的验证请求：\n'
            for (const [playerName, request] of Object.entries(groupRequests)) {
                msg += `\n玩家名：${playerName}\nQQ：${request.qq}\n申请时间：${new Date(request.requestTime).toLocaleString()}\n`
            }

            e.reply(msg)
        } catch (error) {
            console.error('[MCTool] 获取验证请求列表失败:', error)
            e.reply('获���列表失败，请稍后重试')
        }
    }
} 