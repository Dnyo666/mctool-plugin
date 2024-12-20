import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fetch from 'node-fetch'
import HttpsProxyAgent from 'https-proxy-agent'
import logger from '../models/logger.js'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 基础路径
const YUNZAI_DIR = path.join(__dirname, '..', '..', '..')  // Yunzai-Bot 根目录
const PLUGIN_DIR = path.join(YUNZAI_DIR, 'plugins', 'mctool-plugin')  // 插件根目录
const CONFIG_FILE = path.join(PLUGIN_DIR, 'config', 'config.yaml')  // 配置文件路径

// 配置管理
let configCache = null

export function getConfig(key) {
    try {
        if (!configCache) {
            if (!fs.existsSync(CONFIG_FILE)) {
                // 如果配置文件不存在，创建默认配置
                const defaultConfig = {
                    // 基础配置
                    checkInterval: '*/1 * * * *',
                    maxServers: 10,

                    // API 配置
                    apis: [
                        {
                            name: 'mcstatus.io',
                            url: 'https://api.mcstatus.io/v2/status/java/{host}:{port}',
                            timeout: 30,
                            maxRetries: 3,
                            retryDelay: 1000,
                            parser: {
                                online: 'online',
                                players: {
                                    online: 'players.online',
                                    max: 'players.max',
                                    list: 'players.list'
                                },
                                version: 'version.name_clean',
                                motd: 'motd.clean'
                            }
                        },
                        {
                            name: 'mcsrvstat.us',
                            url: 'https://api.mcsrvstat.us/2/{host}:{port}',
                            timeout: 30,
                            maxRetries: 2,
                            retryDelay: 1000,
                            parser: {
                                online: 'online',
                                players: {
                                    online: 'players.online',
                                    max: 'players.max',
                                    list: 'players.list'
                                },
                                version: 'version',
                                motd: 'motd'
                            }
                        }
                    ],

                    // 推送消息格式
                    pushFormat: {
                        join: '{player} 加入了服务器 {server}',
                        leave: '{player} 离开了服务器 {server}',
                        newPlayer: '新玩家 {player} 加入了服务器 {server}',
                        serverOnline: '服务器 {server} 已上线',
                        serverOffline: '服务器 {server} 已离线'
                    },

                    // 数据存储配置
                    dataPath: 'data/mctool',

                    // 默认群组配置
                    defaultGroup: {
                        enabled: false,
                        serverStatusPush: false,
                        newPlayerAlert: false
                    },

                    // 验证功能配置
                    verification: {
                        enabled: false,
                        expireTime: 86400,
                        maxRequests: 5
                    }
                }
                fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
                fs.writeFileSync(CONFIG_FILE, YAML.stringify(defaultConfig), 'utf8')
                configCache = defaultConfig
            } else {
                configCache = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {}
            }
        }

        if (key) {
            const keys = key.split('.')
            let value = configCache
            for (const k of keys) {
                if (value === undefined || value === null) return null
                value = value[k]
            }
            return value
        }
        return configCache
    } catch (error) {
        logger.error('获取配置失败:', error)
        return key ? null : {}
    }
}

// 数据管理类
class DataManager {
    constructor() {
        this.dataPath = path.join(YUNZAI_DIR, getConfig('dataPath') || 'data/mctool')
        this.ensureDirectories()
        
        // 初始化默认数据文件
        const defaultFiles = ['servers', 'current', 'historical', 'changes', 'subscriptions', 'verification', 'verification_requests']
        for (const file of defaultFiles) {
            const filePath = this.getFilePath(file)
            if (!fs.existsSync(filePath)) {
                this.write(file, {})
            }
        }
    }

    ensureDirectories() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true })
            logger.info(`创建数据目录: ${this.dataPath}`)
        }
    }

    getFilePath(name) {
        return path.join(this.dataPath, `${name}.json`)  // 改用 JSON 格式
    }

    read(name) {
        try {
            const filePath = this.getFilePath(name)
            if (!fs.existsSync(filePath)) {
                return {}
            }
            const content = fs.readFileSync(filePath, 'utf8')
            return JSON.parse(content) || {}
        } catch (error) {
            logger.error(`读取数据失败 [${name}]: ${error.message}`)
            return {}
        }
    }

    write(name, data) {
        try {
            const filePath = this.getFilePath(name)
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
            return true
        } catch (error) {
            logger.error(`写入数据失败 [${name}]: ${error.message}`)
            return false
        }
    }

    // 获取群组数据
    getGroupData(name, groupId) {
        const data = this.read(name)
        return data[groupId] || {}
    }

    // 保存群组数据
    saveGroupData(name, groupId, groupData) {
        const data = this.read(name)
        data[groupId] = groupData
        return this.write(name, data)
    }

    // 获取群组的服务器配置
    getGroupServer(groupId, serverId) {
        const servers = this.getGroupData('servers', groupId)
        return servers[serverId] || null
    }

    // 保存群组的服务器配置
    saveGroupServer(groupId, serverId, serverData) {
        const servers = this.getGroupData('servers', groupId)
        servers[serverId] = serverData
        return this.saveGroupData('servers', groupId, servers)
    }
}

// 权限检查
export async function checkGroupAdmin(e) {
    if (!e.isGroup) {
        e.reply('该功能仅群聊使用')
        return false
    }

    const memberInfo = await global.Bot.getGroupMemberInfo(e.group_id, e.user_id)
    if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
        e.reply('该功能需要群管理员权限')
        return false
    }

    return true
}

// 从对象中获取嵌套属性值
function getNestedValue(obj, path) {
    const keys = path.replace(/\[\]$/, '').split('.')
    let value = obj
    
    for (const key of keys) {
        if (value === undefined || value === null) return undefined
        value = value[key]
    }

    // 处理数组路径
    if (path.endsWith('[]')) {
        return Array.isArray(value) ? value : []
    }
    
    return value
}

// 解析 API 响应
function parseAPIResponse(data, parser) {
    try {
        return {
            online: getNestedValue(data, parser.online) || false,
            players: {
                online: getNestedValue(data, parser.players.online) || 0,
                max: getNestedValue(data, parser.players.max) || 0,
                list: getNestedValue(data, parser.players.list) || []
            },
            version: getNestedValue(data, parser.version) || '',
            description: getNestedValue(data, parser.motd) || ''
        }
    } catch (error) {
        logger.error('解析 API 响应失败:', error)
        return null
    }
}

// 服务器状态查询
async function queryAPI(apiConfig, host, port) {
    const timeout = (apiConfig.timeout || 30) * 1000
    const maxRetries = apiConfig.maxRetries || 3
    const retryDelay = apiConfig.retryDelay || 1000
    const url = apiConfig.url.replace('{host}', host).replace('{port}', port)

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: timeout
    }

    if (process.env.https_proxy) {
        options.agent = new HttpsProxyAgent(process.env.https_proxy)
    }

    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            const response = await fetch(url, options)
            if (!response.ok) {
                logger.debug(`[${apiConfig.name}] API返回状态码: ${response.status}`)
                if (retry === maxRetries - 1) {
                    return null
                }
                await new Promise(resolve => setTimeout(resolve, retryDelay))
                continue
            }

            const data = await response.json()
            const result = parseAPIResponse(data, apiConfig.parser)
            if (result) {
                logger.debug(`[${apiConfig.name}] 查询成功`)
                return result
            }
        } catch (error) {
            logger.error(`[${apiConfig.name}] 查询失败:`, error)
            if (retry < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay))
            }
        }
    }
    return null
}

export async function queryServerStatus(address) {
    try {
        const [host, port = '25565'] = address.split(':')
        const apis = getConfig('apis')

        // 依次尝试所有配置的 API
        for (const api of apis) {
            const result = await queryAPI(api, host, port)
            if (result) {
                return result
            }
            logger.debug(`[${api.name}] API 查询失败，尝试下一个`)
        }

        throw new Error('所有 API 查询失败')
    } catch (error) {
        logger.error(`查询服务器状态失败: ${error.message}`)
        return {
            online: false,
            players: {
                online: 0,
                max: 0,
                list: []
            }
        }
    }
}

// 导出实例
export const Data = new DataManager() 