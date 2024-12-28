import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import lodash from 'lodash'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class Config {
    constructor() {
        this.configPath = path.join(__dirname, 'config/config.yaml')
    }

    getConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return {}
            }
            return YAML.parse(fs.readFileSync(this.configPath, 'utf8')) || {}
        } catch (err) {
            return {}
        }
    }

    setConfig(config) {
        try {
            const dirPath = path.dirname(this.configPath)
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true })
            }
            fs.writeFileSync(this.configPath, YAML.stringify(config), 'utf8')
            return true
        } catch (err) {
            return false
        }
    }
}

const config = new Config()

/**
 * 支持锅巴配置
 */
export function supportGuoba() {
    return {
        // 插件信息
        pluginInfo: {
            name: 'mctool-plugin',
            title: 'MC工具箱',
            author: '@Dnyo666',
            authorLink: 'https://github.com/Dnyo666',
            link: 'https://github.com/Dnyo666/mctool-plugin',
            isV3: true,
            isV2: false,
            description: 'Minecraft服务器状态查询、玩家绑定、进群验证等功能',
            icon: 'minecraft:grass_block'
        },

        // 配置项信息
        configInfo: {
            schemas: [
                {
                    field: 'schedule.cron',
                    label: '定时任务',
                    bottomHelpMessage: '定时检查服务器状态的cron表达式',
                    component: 'EasyCron',
                    required: true,
                    componentProps: {
                        placeholder: '请输入或选择Cron表达式'
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
                        step: 1000
                    }
                },
                {
                    field: 'apis',
                    label: 'API配置',
                    bottomHelpMessage: '服务器状态查询API配置',
                    component: 'GTags',
                    defaultValue: [
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
                    ]
                }
            ],

            // 获取配置数据
            getConfigData() {
                return config.getConfig()
            },

            // 设置配置数据
            setConfigData(data, { Result }) {
                try {
                    let currentConfig = config.getConfig()
                    let newConfig = {}
                    
                    // 使用 lodash 合并配置
                    for (let [keyPath, value] of Object.entries(data)) {
                        lodash.set(newConfig, keyPath, value)
                    }
                    newConfig = lodash.merge({}, currentConfig, newConfig)
                    
                    if (config.setConfig(newConfig)) {
                        return Result.ok({}, '保存成功~')
                    } else {
                        return Result.error('保存失败')
                    }
                } catch (err) {
                    return Result.error(`保存失败：${err.message}`)
                }
            }
        }
    }
}
