import plugin from '../../../../lib/plugins/plugin.js'

export class MCSManagerBind extends plugin {
    constructor() {
        super({
            name: 'MCSManager-绑定',
            dsc: '绑定MCSManager实例',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(mcs|MCS)\\s*(绑定|bind)\\s*.*$',
                    fnc: 'bind'
                },
                {
                    reg: '^#?(mcs|MCS)\\s*(解绑|unbind)$',
                    fnc: 'unbind'
                },
                {
                    reg: '^#?(mcs|MCS)\\s*(绑定信息|bindinfo)$',
                    fnc: 'info'
                }
            ]
        })
    }

    /**
     * 解析绑定命令
     * @param {string} command 命令内容
     * @returns {Object|null} 解析结果
     */
    parseBindCommand(command) {
        // 移除命令前缀并分割参数
        const params = command.replace(/^#?(mcs|MCS)\s*(绑定|bind)\s*/, '').trim().split(/\s+/)
        
        if (params.length !== 2) {
            return null
        }

        const [url, apiKey] = params
        
        // 验证URL格式
        try {
            new URL(url)
        } catch (error) {
            return null
        }

        return { url, apiKey }
    }

    /**
     * 绑定命令处理
     * @param {*} e 消息事件
     */
    async bind(e) {
        // 如果没有消息内容，发送帮助信息
        if (!e.msg) {
            await e.reply('MCS绑定帮助：\n命令格式：#mcs bind URL API密钥\n例如：#mcs bind http://localhost:23333 your-api-key')
            return true
        }

        // 解析命令
        const bindInfo = this.parseBindCommand(e.msg)
        if (!bindInfo) {
            await e.reply('格式错误！\n命令格式：#mcs bind URL API密钥\n例如：#mcs bind http://localhost:23333 your-api-key')
            return false
        }

        try {
            // 更新用户配置
            await global.mcsUserData.updateUserData(e.user_id, {
                baseUrl: bindInfo.url,
                apiKey: bindInfo.apiKey
            })

            await e.reply('绑定成功！您现在可以使用其他MCS Manager命令了。')
            return true
        } catch (error) {
            logger.error(`[MCS Bind] 绑定失败: ${error}`)
            await e.reply('绑定失败，请检查输入是否正确，或联系管理员。')
            return false
        }
    }

    /**
     * 解绑命令处理
     * @param {*} e 消息事件
     */
    async unbind(e) {
        try {
            await global.mcsUserData.deleteUserData(e.user_id)
            await e.reply('解绑成功！您的MCS Manager配置已被删除。')
            return true
        } catch (error) {
            logger.error(`[MCS Bind] 解绑失败: ${error}`)
            await e.reply('解绑失败，请联系管理员。')
            return false
        }
    }

    /**
     * 查看绑定信息
     * @param {*} e 消息事件
     */
    async info(e) {
        try {
            const data = await global.mcsUserData.getUserData(e.user_id)
            const msg = [
                '您的MCS Manager绑定信息：',
                `服务器地址：${data.baseUrl}`,
                `API密钥：${data.apiKey.slice(0, 8)}****`,
            ].join('\n')
            
            await e.reply(msg)
            return true
        } catch (error) {
            logger.error(`[MCS Bind] 获取信息失败: ${error}`)
            await e.reply('获取绑定信息失败，请联系管理员。')
            return false
        }
    }
}
