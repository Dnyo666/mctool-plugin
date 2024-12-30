import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import lodash from 'lodash'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class Config {
    constructor() {
        this.configPath = path.join(__dirname, 'config', 'config.yaml')
    }

    getConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return this.getDefault()
            }
            const config = YAML.parse(fs.readFileSync(this.configPath, 'utf8'))
            return lodash.merge(this.getDefault(), config)
        } catch (err) {
            logger.error('[MCTool] 读取配置文件失败:', err)
            return this.getDefault()
        }
    }

    setConfig(config) {
        try {
            const dirPath = path.dirname(this.configPath)
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true })
            }

            // 合并新配置
            const mergedConfig = lodash.merge(this.getConfig(), config)

            // 使用模板生成配置文件内容
            const content = `#不知道的不要乱改

# API配置
apis:
  - name: ${mergedConfig.apis[0].name}
    url: ${mergedConfig.apis[0].url}
    timeout: ${mergedConfig.apis[0].timeout}  # 超时时间（秒）
    maxRetries: ${mergedConfig.apis[0].maxRetries}  # 最大重试次数
    retryDelay: ${mergedConfig.apis[0].retryDelay}  # 重试延迟（毫秒）
    parser:  # 解析配置
      online: ${mergedConfig.apis[0].parser.online}  # 在线状态字段
      players:  # 玩家相关字段
        online: ${mergedConfig.apis[0].parser.players.online}  # 在线人数字段
        max: ${mergedConfig.apis[0].parser.players.max}  # 最大人数字段
        list: ${mergedConfig.apis[0].parser.players.list}  # 玩家列表字段
      version: ${mergedConfig.apis[0].parser.version}  # 版本字段
      motd: ${mergedConfig.apis[0].parser.motd}  # MOTD字段

  - name: ${mergedConfig.apis[1]?.name || 'mcstatus'}
    url: ${mergedConfig.apis[1]?.url || 'https://api.mcstatus.io/v2/status/java/{host}:{port}'}
    timeout: ${mergedConfig.apis[1]?.timeout || 30}  # 超时时间（秒）
    maxRetries: ${mergedConfig.apis[1]?.maxRetries || 3}  # 最大重试次数
    retryDelay: ${mergedConfig.apis[1]?.retryDelay || 1000}  # 重试延迟（毫秒）
    parser:  # 解析配置
      online: ${mergedConfig.apis[1]?.parser?.online || 'online'}  # 在线状态字段
      players:  # 玩家相关字段
        online: ${mergedConfig.apis[1]?.parser?.players?.online || 'players.online'}  # 在线人数字段
        max: ${mergedConfig.apis[1]?.parser?.players?.max || 'players.max'}  # 最大人数字段
        list: ${mergedConfig.apis[1]?.parser?.players?.list || 'players.list[].name_clean'}  # 玩家列表字段
      version: ${mergedConfig.apis[1]?.parser?.version || 'version.name_clean'}  # 版本字段
      motd: ${mergedConfig.apis[1]?.parser?.motd || 'motd.clean[]'}  # MOTD字段

# 定时任务配置
schedule:
  cron: "${mergedConfig.schedule.cron}"  # 每分钟的第30秒执行
  startupNotify: ${mergedConfig.schedule.startupNotify}   # 是否在机器人启动时发送服务器状态推送
  retryDelay: ${mergedConfig.schedule.retryDelay}      # 重试等待时间（毫秒）

# 数据存储路径
dataPath: ${mergedConfig.dataPath}

# 默认群组推送配置
defaultGroup:
  enabled: ${mergedConfig.defaultGroup.enabled}          # 是否默认开启功能
  serverStatusPush: ${mergedConfig.defaultGroup.serverStatusPush} # 是否默认开启服务器状态推送
  newPlayerAlert: ${mergedConfig.defaultGroup.newPlayerAlert}   # 是否默认开启新玩家提醒

# 验证配置
verification:
  enabled: ${mergedConfig.verification.enabled}         # 是否默认开启验证
  expireTime: ${mergedConfig.verification.expireTime}     # 验证请求过期时间（秒）
  maxRequests: ${mergedConfig.verification.maxRequests}        # 最大验证请求数`

            fs.writeFileSync(this.configPath, content, 'utf8')
            return true
        } catch (err) {
            logger.error('[MCTool] 保存配置文件失败:', err)
            return false
        }
    }

    getDefault() {
        return {
            schedule: {
                cron: '30 * * * * *',
                startupNotify: true,
                retryDelay: 5000
            },
            apis: [
                {
                    name: 'mcsrvstat',
                    url: 'https://api.mcsrvstat.us/3/{host}:{port}',
                    timeout: 30,
                    maxRetries: 3,
                    retryDelay: 1000,
                    parser: {
                        online: 'online',
                        players: {
                            online: 'players.online',
                            max: 'players.max',
                            list: 'players.list[].name'
                        },
                        version: 'version.name_clean',
                        motd: 'motd.clean[]'
                    }
                }
            ],
            dataPath: 'data/mctool',
            defaultGroup: {
                enabled: false,
                serverStatusPush: false,
                newPlayerAlert: false
            },
            verification: {
                enabled: false,
                expireTime: 86400,
                maxRequests: 5
            }
        }
    }

    modify(...args) {
        const value = args.pop()
        const key = args.join('.')
        const config = this.getConfig()
        lodash.set(config, key, value)
        return this.setConfig(config)
    }
}

const config = new Config()

export function supportGuoba() {
    return {
        pluginInfo: {
            name: 'mctool-plugin',
            title: 'MC工具箱',
            author: '@Dnyo666',
            authorLink: 'https://github.com/Dnyo666',
            link: 'https://github.com/Dnyo666/mctool-plugin',
            isV3: true,
            isV2: false,
            description: 'Minecraft服务器状态查询、玩家绑定、进群验证等功能',
            icon: 'arcticons:minecraft-alt-2',
            iconColor: '#7CB342'
        },
        configInfo: {
            schemas: [
                {
                    component: 'Divider',
                    label: '定时任务配置',
                    componentProps: {
                        orientation: 'left',
                        plain: true
                    }
                },
                {
                    field: 'schedule.cron',
                    label: '定时任务',
                    helpMessage: '注意：必须包含6个字段（秒 分 时 日 月 周），例如：30 * * * * *',
                    bottomHelpMessage: '默认每分钟的第30秒执行一次。如果只想修改分钟，请保持其他字段为 * 号。示例：30 1,2,3 * * * * 表示在每小时的1分2分3分的第30秒执行',
                    component: 'EasyCron',
                    required: true,
                    componentProps: {
                        placeholder: '30 * * * * *',
                        defaultValue: '30 * * * * *',
                        showSecond: true,
                        width: '100%'
                    }
                },
                {
                    field: 'schedule.startupNotify',
                    label: '启动通知',
                    bottomHelpMessage: '是否在机器人启动时发送服务器状态推送',
                    component: 'Switch',
                    defaultValue: true
                },
                {
                    field: 'schedule.retryDelay',
                    label: '重试延迟',
                    bottomHelpMessage: '重试等待时间（毫秒）',
                    component: 'InputNumber',
                    required: true,
                    defaultValue: 5000,
                    componentProps: {
                        min: 1000,
                        max: 60000,
                        step: 1000,
                        addonAfter: '毫秒'
                    }
                },
                {
                    component: 'Divider',
                    label: 'API配置',
                    componentProps: {
                        orientation: 'left',
                        plain: true
                    }
                },
                {
                    field: 'apis',
                    label: 'API配置',
                    bottomHelpMessage: '服务器状态查询API配置',
                    component: 'GSubForm',
                    componentProps: {
                        multiple: true,
                        schemas: [
                            {
                                field: 'name',
                                label: 'API名称',
                                component: 'Input',
                                required: true,
                                componentProps: {
                                    placeholder: '例如：mcsrvstat'
                                }
                            },
                            {
                                field: 'url',
                                label: 'API地址',
                                component: 'Input',
                                required: true,
                                componentProps: {
                                    placeholder: '例如：https://api.mcsrvstat.us/3/{host}:{port}'
                                }
                            },
                            {
                                field: 'timeout',
                                label: '超时时间',
                                component: 'InputNumber',
                                required: true,
                                componentProps: {
                                    min: 5,
                                    max: 60,
                                    step: 5,
                                    addonAfter: '秒'
                                }
                            },
                            {
                                field: 'maxRetries',
                                label: '最大重试次数',
                                component: 'InputNumber',
                                required: true,
                                componentProps: {
                                    min: 1,
                                    max: 5,
                                    step: 1,
                                    addonAfter: '次'
                                }
                            },
                            {
                                field: 'retryDelay',
                                label: '重试延迟',
                                component: 'InputNumber',
                                required: true,
                                componentProps: {
                                    min: 1000,
                                    max: 10000,
                                    step: 1000,
                                    addonAfter: '毫秒'
                                }
                            },
                            {
                                field: 'parser',
                                label: '解析配置',
                                component: 'GSubForm',
                                componentProps: {
                                    schemas: [
                                        {
                                            field: 'online',
                                            label: '在线状态字段',
                                            component: 'Input',
                                            required: true,
                                            defaultValue: 'online',
                                            componentProps: {
                                                placeholder: '例如：online'
                                            }
                                        },
                                        {
                                            field: 'players.online',
                                            label: '在线人数字段',
                                            component: 'Input',
                                            required: true,
                                            defaultValue: 'players.online',
                                            componentProps: {
                                                placeholder: '例如：players.online'
                                            }
                                        },
                                        {
                                            field: 'players.max',
                                            label: '最大人数字段',
                                            component: 'Input',
                                            required: true,
                                            defaultValue: 'players.max',
                                            componentProps: {
                                                placeholder: '例如：players.max'
                                            }
                                        },
                                        {
                                            field: 'players.list',
                                            label: '玩家列表字段',
                                            component: 'Input',
                                            required: true,
                                            defaultValue: 'players.list[].name',
                                            componentProps: {
                                                placeholder: '例如：players.list[].name'
                                            }
                                        },
                                        {
                                            field: 'version',
                                            label: '版本字段',
                                            component: 'Input',
                                            required: true,
                                            defaultValue: 'version.name_clean',
                                            componentProps: {
                                                placeholder: '例如：version.name_clean'
                                            }
                                        },
                                        {
                                            field: 'motd',
                                            label: 'MOTD字段',
                                            component: 'Input',
                                            required: true,
                                            defaultValue: 'motd.clean[]',
                                            componentProps: {
                                                placeholder: '例如：motd.clean[]'
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    component: 'Divider',
                    label: '群组配置',
                    componentProps: {
                        orientation: 'left',
                        plain: true
                    }
                },
                {
                    field: 'defaultGroup.enabled',
                    label: '全局推送功能',
                    bottomHelpMessage: '新群组是否默认开启全局推送功能',
                    component: 'Switch',
                    defaultValue: false
                },
                {
                    field: 'defaultGroup.serverStatusPush',
                    label: '默认开启状态推送',
                    bottomHelpMessage: '新群组是否默认开启服务器状态推送',
                    component: 'Switch',
                    defaultValue: false
                },
                {
                    field: 'defaultGroup.newPlayerAlert',
                    label: '默认开启新人提醒',
                    bottomHelpMessage: '新群组是否默认开启新玩家提醒',
                    component: 'Switch',
                    defaultValue: false
                },
                {
                    component: 'Divider',
                    label: '验证配置',
                    componentProps: {
                        orientation: 'left',
                        plain: true
                    }
                },
                {
                    field: 'verification.enabled',
                    label: '验证功能',
                    bottomHelpMessage: '是否默认开启验证功能',
                    component: 'Switch',
                    defaultValue: false
                },
                {
                    field: 'verification.expireTime',
                    label: '验证过期时间',
                    bottomHelpMessage: '验证请求过期时间（秒）',
                    component: 'InputNumber',
                    required: true,
                    defaultValue: 86400,
                    componentProps: {
                        min: 300,
                        max: 604800,
                        step: 300,
                        addonAfter: '秒'
                    }
                },
                {
                    field: 'verification.maxRequests',
                    label: '最大验证请求数',
                    bottomHelpMessage: '每个用户最大验证请求数',
                    component: 'InputNumber',
                    required: true,
                    defaultValue: 5,
                    componentProps: {
                        min: 1,
                        max: 20,
                        step: 1,
                        addonAfter: '次'
                    }
                }
            ],
            getConfigData() {
                return config.getConfig()
            },
            async setConfigData(data, { Result }) {
                try {
                    // 处理cron表达式
                    if (data['schedule.cron']) {
                        let cronExp = data['schedule.cron'].trim()
                        // 标准化cron表达式，保留所有有效字符
                        const parts = cronExp.split(/\s+/).filter(part => part !== '')
                        
                        // 处理7位cron表达式（秒 分 时 日 月 周 年）转为6位（秒 分 时 日 月 周）
                        if (parts.length === 7) {
                            parts.pop() // 移除年份字段
                        }
                        
                        // 如果字段数量不足6位，使用默认值填充
                        const defaultParts = ['30', '*', '*', '*', '*', '*']
                        while (parts.length < 6) {
                            parts.push(defaultParts[parts.length])
                        }

                        // 验证每个字段的格式
                        const patterns = {
                            second: /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+|\*\/\d+)$/,
                            minute: /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+|\*\/\d+)$/,
                            hour: /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+|\*\/\d+)$/,
                            day: /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+|\*\/\d+|\?)$/,
                            month: /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+|\*\/\d+|[1-9]|1[0-2]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/,
                            week: /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*|\d+\/\d+|\*\/\d+|[0-6]|SUN|MON|TUE|WED|THU|FRI|SAT|\?)$/
                        }

                        const ranges = {
                            second: { min: 0, max: 59 },
                            minute: { min: 0, max: 59 },
                            hour: { min: 0, max: 23 },
                            day: { min: 1, max: 31 },
                            month: { min: 1, max: 12 },
                            week: { min: 0, max: 6 }
                        }

                        const fields = ['second', 'minute', 'hour', 'day', 'month', 'week']
                        for (let i = 0; i < 6; i++) {
                            const part = parts[i]
                            const field = fields[i]
                            
                            // 检查基本格式
                            if (!patterns[field].test(part)) {
                                logger.warn(`[MCTool] ${field}字段格式错误：${part}，使用默认值`)
                                parts[i] = defaultParts[i]
                                continue
                            }

                            // 如果不是特殊字符，检查数值范围
                            if (part !== '*' && part !== '?' && !part.includes('/')) {
                                const values = part.split(',').map(v => {
                                    if (v.includes('-')) {
                                        const [start, end] = v.split('-').map(Number)
                                        return { start, end }
                                    }
                                    return { start: Number(v), end: Number(v) }
                                })

                                let hasInvalidValue = false
                                for (const { start, end } of values) {
                                    if (start < ranges[field].min || end > ranges[field].max) {
                                        hasInvalidValue = true
                                        break
                                    }
                                }

                                // 如果值超出范围，使用默认值
                                if (hasInvalidValue) {
                                    logger.warn(`[MCTool] ${field}字段值超出范围：${part}，使用默认值`)
                                    parts[i] = defaultParts[i]
                                }
                            }
                        }

                        // 保存标准化后的表达式
                        data['schedule.cron'] = parts.join(' ')
                        logger.mark(`[MCTool] 处理后的cron表达式: ${data['schedule.cron']}`);
                    }

                    for (const key in data) {
                        config.modify(...key.split('.'), data[key])
                    }
                    return Result.ok({}, '保存成功~')
                } catch (err) {
                    logger.error('[MCTool] 保存配置失败:', err)
                    return Result.error(`保存失败：${err.message}`)
                }
            }
        }
    }
}
