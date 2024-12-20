import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fetch from 'node-fetch'
import HttpsProxyAgent from 'https-proxy-agent'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 基础路径
const YUNZAI_DIR = path.join(__dirname, '..', '..', '..')  // Yunzai-Bot 根目录
const PLUGIN_DIR = path.join(YUNZAI_DIR, 'plugins', 'mctool-plugin')  // 插件根目录
const CONFIG_FILE = path.join(PLUGIN_DIR, 'config', 'config.yaml')  // 配置文件路径
const DATA_DIR = path.join(PLUGIN_DIR, 'data')  // 数据目录路径

// 导入Yunzai-Bot的logger
const { logger } = await import('../../../lib/plugins/logger.js')

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
                    primaryAPI: {
                        url: 'https://api.mcstatus.io/v2/status/java/{host}:{port}',
                        timeout: 30,
                        maxRetries: 3,
                        retryDelay: 1000
                    },
                    fallbackAPI: {
                        url: 'https://api.mcsrvstat.us/2/{host}:{port}',
                        timeout: 30,
                        maxRetries: 2,
                        retryDelay: 1000
                    },

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
        // 确保数据目录存在
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true })
        }
    }

    // 获取数据文件路径
    getFilePath(name) {
        return path.join(DATA_DIR, `${name}.json`)
    }

    // 读取数据
    read(name) {
        try {
            const filePath = this.getFilePath(name)
            if (!fs.existsSync(filePath)) {
                return {}
            }
            const data = fs.readFileSync(filePath, 'utf8')
            return JSON.parse(data) || {}
        } catch (error) {
            logger.error(`读取数据失败 [${name}]: ${error.message}`)
            return {}
        }
    }

    // 写入数据
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
        if (!data[groupId]) {
            data[groupId] = {}
            this.write(name, data)
        }
        return data[groupId]
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

// 导出 Data 实例
export const Data = new DataManager()

// 检查群管理员权限
export async function checkGroupAdmin(e) {
    if (!e.group_id) {
        e.reply('请在群聊中使用该命令')
        return false
    }

    if (!e.member?.is_admin && !e.member?.is_owner && !e.isMaster) {
        e.reply('只有管理员才能使用该命令')
        return false
    }

    return true
}

// 查询服务器状态
export async function queryServerStatus(address) {
    try {
        const [host, port = '25565'] = address.split(':')
        const config = getConfig()
        
        // 尝试使用主要 API
        const primaryAPI = config.primaryAPI
        const primaryUrl = primaryAPI.url.replace('{host}', host).replace('{port}', port)
        
        try {
            const response = await fetch(primaryUrl, {
                timeout: primaryAPI.timeout * 1000
            })
            
            if (response.ok) {
                const data = await response.json()
                return {
                    online: data.online || false,
                    players: {
                        online: data.players?.online || 0,
                        max: data.players?.max || 0,
                        list: data.players?.list || []
                    },
                    version: data.version?.name_clean || data.version || 'Unknown',
                    motd: data.motd?.clean || data.motd || ''
                }
            }
        } catch (error) {
            logger.error('主要 API 请求失败:', error)
        }

        // 如果主要 API 失败，尝试使用备用 API
        const fallbackAPI = config.fallbackAPI
        const fallbackUrl = fallbackAPI.url.replace('{host}', host).replace('{port}', port)
        
        const response = await fetch(fallbackUrl, {
            timeout: fallbackAPI.timeout * 1000
        })

        if (!response.ok) {
            throw new Error(`备用 API 请求失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        return {
            online: data.online || false,
            players: {
                online: data.players?.online || 0,
                max: data.players?.max || 0,
                list: data.players?.list || []
            },
            version: data.version || 'Unknown',
            motd: data.motd || ''
        }
    } catch (error) {
        logger.error('查询服务器状态失败:', error)
        return {
            online: false,
            players: {
                online: 0,
                max: 0,
                list: []
            },
            version: 'Unknown',
            motd: ''
        }
    }
} 