import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import YAML from 'yaml';
import HttpsProxyAgent from 'https-proxy-agent';
import logger from '../../../lib/logger/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录和文件路径
const YUNZAI_DIR = path.join(__dirname, '..', '..', '..');  // Yunzai-Bot 根目录
const PLUGIN_DIR = path.join(YUNZAI_DIR, 'plugins', 'mctool-plugin');  // 插件根目录
const DATA_DIR = path.join(YUNZAI_DIR, 'data', 'mctool');   // 数据存储目录
const CONFIG_DIR = path.join(PLUGIN_DIR, 'config');  // 配置目录
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');  // 配置文件路径

// 确保目录存在
function ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

// 数据管理类
class DataManager {
    constructor() {
        this.dataPath = DATA_DIR;
        ensureDirectories();
    }

    getFilePath(name) {
        return path.join(this.dataPath, `${name}.yaml`);
    }

    read(name) {
        try {
            const filePath = this.getFilePath(name);
            if (!fs.existsSync(filePath)) {
                return {};
            }
            const content = fs.readFileSync(filePath, 'utf8');
            return YAML.parse(content) || {};
        } catch (error) {
            logger.error(`[MCTool] 读取数据失败: ${error.message}`);
            return {};
        }
    }

    write(name, data) {
        try {
            const filePath = this.getFilePath(name);
            fs.writeFileSync(filePath, YAML.stringify(data));
            return true;
        } catch (error) {
            logger.error(`[MCTool] 写入数据失败: ${error.message}`);
            return false;
        }
    }
}

// 配置管理
let configCache = null;

export function getConfig(key) {
    try {
        if (!configCache) {
            if (!fs.existsSync(CONFIG_FILE)) {
                configCache = {};
            } else {
                configCache = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
            }
        }
        return key ? (configCache[key] || null) : configCache;
    } catch (error) {
        logger.error('[MCTool] 获取配置失败:', error);
        return key ? null : {};
    }
}

export function saveConfig(config) {
    try {
        const yaml = YAML.stringify(config);
        fs.writeFileSync(CONFIG_FILE, yaml, 'utf8');
        configCache = config;
        return true;
    } catch (error) {
        logger.error('[MCTool] 保存配置失败:', error);
        return false;
    }
}

// 权限检查
export async function checkGroupAdmin(e) {
    if (!e.isGroup) {
        e.reply('该功能仅群聊使用');
        return false;
    }

    const memberInfo = await global.Bot.getGroupMemberInfo(e.group_id, e.user_id);
    if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
        e.reply('该功能需要群管理员权限');
        return false;
    }

    return true;
}

// 服务器状态查询
export async function queryServerStatus(address) {
    try {
        const config = getConfig();
        const timeout = (config.apiTimeout || 30) * 1000;
        const maxRetries = config.maxRetries || 3;
        const retryDelay = config.retryDelay || 1000;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: timeout
        };

        if (process.env.https_proxy) {
            options.agent = new HttpsProxyAgent(process.env.https_proxy);
        }

        const [host, port = '25565'] = address.split(':');
        const url = `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(`${host}:${port}`)}`;

        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    logger.debug(`[MCTool] API返回状态码: ${response.status}`);
                    continue;
                }

                const data = await response.json();
                return {
                    online: data.online,
                    players: {
                        online: data.players?.online || 0,
                        max: data.players?.max || 0,
                        list: data.players?.list?.map(p => p.name_clean || p.name) || []
                    },
                    version: data.version?.name_clean || data.version?.name,
                    description: data.motd?.clean || data.motd?.raw
                };
            } catch (error) {
                if (retry < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        throw new Error('服务器状态查询失败');
    } catch (error) {
        logger.error(`[MCTool] 查询服务器状态失败: ${error.message}`);
        return {
            online: false,
            players: {
                online: 0,
                max: 0,
                list: []
            }
        };
    }
}

// 导出实例
export const Data = new DataManager();

// 常量配置
export const CONFIG = {
    /** 命令前缀 */
    commandPrefix: '#mc',
    /** 插件版本 */
    version: '1.0.0',
    /** 插件作者 */
    author: '浅巷墨黎',
    /** 项目地址 */
    github: 'https://github.com/Dnyo666/mctool-plugin',
    /** 交流群号 */
    qqGroup: '303104111',
    /** 插件名称 */
    pluginName: 'mctool-plugin',
    /** 插件描述 */
    pluginDesc: 'Minecraft服务器管理插件'
}; 