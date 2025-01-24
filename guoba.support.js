import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import lodash from 'lodash'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 基础路径
const PLUGIN_DIR = path.join(__dirname)  // 插件根目录
const CONFIG_FILE = path.join(PLUGIN_DIR, 'config', 'config.yaml')  // 配置文件路径

class Config {
    constructor() {
        this.configPath = CONFIG_FILE
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
  maxRequests: ${mergedConfig.verification.maxRequests}        # 最大验证请求数

# 皮肤渲染配置
skin:
  use3D: ${mergedConfig.skin?.use3D || false}  # 是否使用3D渲染
  server: ${mergedConfig.skin?.server || 'http://127.0.0.1:3006'}  # 渲染服务器地址
  endpoint: ${mergedConfig.skin?.endpoint || '/render'}  # 渲染接口路径
  width: ${mergedConfig.skin?.width || 300}   # 渲染宽度
  height: ${mergedConfig.skin?.height || 600}  # 渲染高度

# Mod功能配置
mod:
  enableDownload: ${mergedConfig.mod?.enableDownload ?? true}  # 是否启用mod下载功能
  defaultSource: '${mergedConfig.mod?.defaultSource || 'curseforge'}'  # 默认mod源（modrinth或curseforge）`

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
                },
                {
                    name: 'mcstatus',
                    url: 'https://api.mcstatus.io/v2/status/java/{host}:{port}',
                    timeout: 30,
                    maxRetries: 3,
                    retryDelay: 1000,
                    parser: {
                        online: 'online',
                        players: {
                            online: 'players.online',
                            max: 'players.max',
                            list: 'players.list[].name_clean'
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
            },
            skin: {
                use3D: false,
                renderType: 1,
                render1: {
                    server: 'https://skin2.ixiaojiu.love',
                    definition: 1.5,
                    transparent: true
                },
                render2: {
                    server: 'http://127.0.0.1:3006',
                    endpoint: '/render',
                    width: 300,
                    height: 600
                }
            },
            mod: {
                enableDownload: true,
                defaultSource: 'curseforge'
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
            iconColor: '#7CBA3B'
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
                },
                {
                    component: 'Divider',
                    label: '皮肤渲染配置',
                    componentProps: {
                        orientation: 'left',
                        plain: true
                    }
                },
                {
                    field: 'skin.use3D',
                    label: '3D渲染',
                    bottomHelpMessage: '是否使用3D渲染（需要配置渲染服务器）',
                    component: 'Switch',
                    defaultValue: false
                },
                {
                    field: 'skin.renderType',
                    label: '渲染方案',
                    bottomHelpMessage: '选择3D渲染方案（推荐使用行走视图，效果更好）',
                    component: 'Select',
                    componentProps: {
                        options: [
                            { label: '行走视图（推荐）', value: 1 },
                            { label: '站立视图', value: 2 }
                        ],
                        placeholder: '请选择渲染方案'
                    },
                    defaultValue: 1
                },
                {
                    field: 'skin.render1.server',
                    label: '行走视图服务器',
                    bottomHelpMessage: '行走视图渲染服务器地址，公用API：https://skin2.ixiaojiu.love',
                    component: 'Input',
                    required: false,
                    defaultValue: 'https://skin2.ixiaojiu.love',
                    componentProps: {
                        placeholder: 'https://skin2.ixiaojiu.love'
                    }
                },
                {
                    field: 'skin.render1.definition',
                    label: '行走视图清晰度',
                    bottomHelpMessage: '行走视图渲染图像清晰度，推荐在1.5-2.5之间',
                    component: 'InputNumber',
                    required: false,
                    defaultValue: 1.5,
                    componentProps: {
                        min: 1,
                        max: 3,
                        step: 0.1
                    }
                },
                {
                    field: 'skin.render1.transparent',
                    label: '行走视图透明背景',
                    bottomHelpMessage: '行走视图渲染是否使用透明背景，推荐开启',
                    component: 'Switch',
                    defaultValue: true
                },
                {
                    field: 'skin.render2.server',
                    label: '站立视图服务器',
                    bottomHelpMessage: '站立视图渲染服务器地址，公用API：http://skin.ixiaojiu.love',
                    component: 'Input',
                    required: false,
                    defaultValue: 'http://127.0.0.1:3006',
                    componentProps: {
                        placeholder: 'http://127.0.0.1:3006'
                    }
                },
                {
                    field: 'skin.render2.endpoint',
                    label: '站立视图接口',
                    bottomHelpMessage: '站立视图渲染服务器的接口路径',
                    component: 'Input',
                    required: false,
                    defaultValue: '/render',
                    componentProps: {
                        placeholder: '/render'
                    }
                },
                {
                    field: 'skin.render2.width',
                    label: '站立视图宽度',
                    bottomHelpMessage: '站立视图渲染图像宽度，推荐在300-500之间',
                    component: 'InputNumber',
                    required: false,
                    defaultValue: 300,
                    componentProps: {
                        min: 100,
                        max: 1000,
                        step: 50
                    }
                },
                {
                    field: 'skin.render2.height',
                    label: '站立视图高度',
                    bottomHelpMessage: '站立视图渲染图像高度',
                    component: 'InputNumber',
                    required: false,
                    defaultValue: 600,
                    componentProps: {
                        min: 100,
                        max: 1000,
                        step: 50
                    }
                },
                {
                    component: 'Divider',
                    label: 'Mod功能配置',
                    componentProps: {
                        orientation: 'left',
                        plain: true
                    }
                },
                {
                    field: 'mod.enableDownload',
                    label: 'Mod下载功能',
                    bottomHelpMessage: '是否启用Mod下载功能（不影响搜索和版本查询）',
                    component: 'Switch',
                    defaultValue: true
                },
                {
                    field: 'mod.defaultSource',
                    label: '默认Mod源',
                    bottomHelpMessage: '选择默认的Mod搜索源',
                    component: 'Select',
                    componentProps: {
                        options: [
                            { label: 'CurseForge', value: 'curseforge' },
                            { label: 'Modrinth', value: 'modrinth' }
                        ],
                        placeholder: '请选择默认Mod源'
                    },
                    required: true,
                    defaultValue: 'curseforge'
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
                                logger.info(`[MCTool] ${field}字段格式错误：${part}，使用默认值`)
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
                                    logger.info(`[MCTool] ${field}字段值超出范围：${part}，使用默认值`)
                                    parts[i] = defaultParts[i]
                                }
                            }
                        }

                        // 保存标准化后的表达式
                        data['schedule.cron'] = parts.join(' ')
                        logger.info(`[MCTool] 处理后的cron表达式: ${data['schedule.cron']}`)
                    }

                    // 获取当前配置
                    const currentConfig = config.getConfig()

                    // 处理皮肤渲染配置
                    if (data.skin) {
                        // 获取当前配置中的皮肤配置
                        const currentSkin = {
                            use3D: data.skin.use3D ?? false,  // 是否使用3D渲染
                            renderType: data.skin.renderType ?? 1,  // 渲染方案选择
                            render1: {
                                server: data.skin.render1?.server || 'https://skin2.ixiaojiu.love',
                                endpoint: data.skin.render1?.endpoint || '/render',
                                width: data.skin.render1?.width || 300,
                                height: data.skin.render1?.height || 600
                            },
                            render2: {
                                server: data.skin.render2?.server || 'https://skin2.ixiaojiu.love',
                                definition: data.skin.render2?.definition || 1.5,
                                transparent: data.skin.render2?.transparent ?? true
                            }
                        }

                        // 更新到主配置
                        currentConfig.skin = currentSkin

                        // 删除data.skin，因为我们已经手动处理了
                        delete data.skin
                    }

                    // 更新配置
                    for (const key in data) {
                        const keys = key.split('.')
                        let target = currentConfig
                        
                        // 处理嵌套配置
                        for (let i = 0; i < keys.length - 1; i++) {
                            if (!target[keys[i]]) {
                                target[keys[i]] = {}
                            }
                            target = target[keys[i]]
                        }
                        target[keys[keys.length - 1]] = data[key]
                    }

                    // 保存配置
                    try {
                        // 生成配置文件内容
                        const content = `# 不知道的不要乱改

# API配置
apis:
  - name: ${currentConfig.apis[0].name}
    url: ${currentConfig.apis[0].url}
    timeout: ${currentConfig.apis[0].timeout}  # 超时时间（秒）
    maxRetries: ${currentConfig.apis[0].maxRetries}  # 最大重试次数
    retryDelay: ${currentConfig.apis[0].retryDelay}  # 重试延迟（毫秒）
    parser:  # 解析配置
      online: ${currentConfig.apis[0].parser.online}  # 在线状态字段
      players:  # 玩家相关字段
        online: ${currentConfig.apis[0].parser.players.online}  # 在线人数字段
        max: ${currentConfig.apis[0].parser.players.max}  # 最大人数字段
        list: ${currentConfig.apis[0].parser.players.list}  # 玩家列表字段
      version: ${currentConfig.apis[0].parser.version}  # 版本字段
      motd: ${currentConfig.apis[0].parser.motd}  # MOTD字段

# 定时任务配置
schedule:
  cron: "${currentConfig.schedule.cron}"  # 每分钟的第30秒执行
  startupNotify: ${currentConfig.schedule.startupNotify}   # 是否在机器人启动时发送服务器状态推送
  retryDelay: ${currentConfig.schedule.retryDelay}      # 重试等待时间（毫秒）

# 数据存储路径
dataPath: ${currentConfig.dataPath}

# 默认群组推送配置
defaultGroup:
  enabled: ${currentConfig.defaultGroup.enabled}          # 是否默认开启功能
  serverStatusPush: ${currentConfig.defaultGroup.serverStatusPush} # 是否默认开启服务器状态推送
  newPlayerAlert: ${currentConfig.defaultGroup.newPlayerAlert}   # 是否默认开启新玩家提醒

# 验证配置
verification:
  enabled: ${currentConfig.verification.enabled}         # 是否默认开启验证
  expireTime: ${currentConfig.verification.expireTime}     # 验证请求过期时间（秒）
  maxRequests: ${currentConfig.verification.maxRequests}        # 最大验证请求数

# 皮肤渲染配置
skin:
  use3D: ${currentConfig.skin.use3D}  # 是否使用3D渲染
  renderType: ${currentConfig.skin.renderType}  # 渲染方案选择 (1: 前后视图, 2: 整体视图)
  # 渲染方案一配置（前后视图）
  render1:
    server: '${currentConfig.skin.render1.server}'  # 渲染服务器地址
    endpoint: '${currentConfig.skin.render1.endpoint}'  # 渲染接口路径
    width: ${currentConfig.skin.render1.width}   # 渲染宽度
    height: ${currentConfig.skin.render1.height}  # 渲染高度
  # 渲染方案二配置（整体视图）
  render2:
    server: '${currentConfig.skin.render2.server}'  # 渲染服务器地址
    definition: ${currentConfig.skin.render2.definition}  # 图片清晰度
    transparent: ${currentConfig.skin.render2.transparent}  # 是否透明背景

# Mod功能配置
mod:
  enableDownload: ${currentConfig.mod?.enableDownload ?? true}  # 是否启用mod下载功能
  defaultSource: '${currentConfig.mod?.defaultSource || 'curseforge'}'  # 默认mod源（modrinth或curseforge）`

                        // 写入文件
                        fs.writeFileSync(CONFIG_FILE, content)
                        return Result.ok({}, '保存成功~')
                    } catch (err) {
                        logger.error(`[MCTool] 保存配置失败: ${err.message}`)
                        return Result.error(`保存失败：${err.message}`)
                    }
                } catch (err) {
                    logger.error(`[MCTool] 保存配置失败: ${err.message}`)
                    return Result.error(`保存失败：${err.message}`)
                }
            }
        }
    }
}

