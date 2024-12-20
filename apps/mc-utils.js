import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import YAML from 'yaml';
import HttpsProxyAgent from 'https-proxy-agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录和文件路径
const YUNZAI_DIR = path.join(__dirname, '..', '..', '..');  // Yunzai-Bot 根目录
const PLUGIN_DIR = path.join(YUNZAI_DIR, 'plugins', 'mctool-plugin');  // 插件根目录
const DATA_DIR = path.join(YUNZAI_DIR, 'data', 'mctool');   // 数据存储目录（在 Yunzai 的 data 目录下）
const CONFIG_DIR = path.join(PLUGIN_DIR, 'config');  // 配置目录（在插件目录下）
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

// 数据文件路径
export const PATHS = {
    servers: path.join(DATA_DIR, 'servers.json'),         // 群组��务器列表
    current: path.join(DATA_DIR, 'currentPlayers.json'),  // 当前在线玩家
    changes: path.join(DATA_DIR, 'playerChanges.json'),   // 玩家变动记录
    subscriptions: path.join(DATA_DIR, 'groupSubscriptions.json'), // 群组推送订阅配置
    historical: path.join(DATA_DIR, 'historicalPlayers.json'),  // 历史玩家记录
    auth_config: path.join(DATA_DIR, 'auth_config.json'),  // 验证配置
    verified_users: path.join(DATA_DIR, 'verified_users.json')  // 已验证用户
};

// 获取配置
export function getConfig(key) {
    try {
        const config = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return key ? config[key] : config;
    } catch (error) {
        console.error('[MCTool-Plugin] 读取配置文件失败:', error);
        return key ? null : {};
    }
}

// 保存配置
export function saveConfig(config) {
    try {
        const yaml = YAML.stringify(config);
        fs.writeFileSync(CONFIG_FILE, yaml, 'utf8');
        return true;
    } catch (error) {
        console.error('[MCTool-Plugin] 保存配置文件失败:', error);
        return false;
    }
}

// 初始化数据目录和文件
export function initDataFiles() {
    ensureDirectories();

    // 初始化所有数据文件
    for (const filePath of Object.values(PATHS)) {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '{}', 'utf8');
        }
    }
}

// 数据操作工具
export const Data = {
    read(type) {
        try {
            if (!PATHS[type]) {
                throw new Error(`未知的数据类型: ${type}`);
            }
            return JSON.parse(fs.readFileSync(PATHS[type], 'utf8'));
        } catch (error) {
            return {};
        }
    },

    write(type, data) {
        try {
            if (!PATHS[type]) {
                throw new Error(`未知的数据类型: ${type}`);
            }
            fs.writeFileSync(PATHS[type], JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            return false;
        }
    },

    // 获取群组的服务器配置
    getGroupServerConfig(groupId, serverId) {
        const subscriptions = this.read('subscriptions');
        if (!subscriptions[groupId]?.servers?.[serverId]) {
            return {
                enabled: false,
                newPlayerAlert: false,
                players: []
            };
        }
        return subscriptions[groupId].servers[serverId];
    },

    // 更新群组的服务器配置
    updateGroupServerConfig(groupId, serverId, config) {
        const subscriptions = this.read('subscriptions');
        if (!subscriptions[groupId]) {
            subscriptions[groupId] = {
                enabled: false,
                servers: {}
            };
        }
        if (!subscriptions[groupId].servers[serverId]) {
            subscriptions[groupId].servers[serverId] = {
                enabled: false,
                newPlayerAlert: false,
                players: []
            };
        }
        Object.assign(subscriptions[groupId].servers[serverId], config);
        return this.write('subscriptions', subscriptions);
    }
};

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

// 添加延时函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 服务器状态查询
export async function queryServerStatus(address) {
    try {
        const config = getConfig();
        const timeout = (config.apiTimeout || 30) * 1000;
        const maxRetries = config.maxRetries || 3;
        const retryDelay = config.retryDelay || 1000;

        // 构建请求选项
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: timeout
        };

        if (process.env.https_proxy) {
            options.agent = new HttpsProxyAgent(process.env.https_proxy);
        }

        let [host, port] = address.split(':');
        port = port || '25565';

        const apis = [
            `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(`${host}:${port}`)}`,
            `https://api.mcsrvstat.us/3/${encodeURIComponent(host)}${port === '25565' ? '' : ':' + port}`
        ];

        if (config.customApi) {
            apis.unshift(config.customApi.replace('{address}', encodeURIComponent(`${host}:${port}`)));
        }

        let lastError = null;
        for (const api of apis) {
            for (let retry = 0; retry < maxRetries; retry++) {
                try {
                    if (retry > 0) {
                        await sleep(retryDelay);
                    }
                    
                    const response = await fetch(api, options);
                    
                    if (!response.ok) {
                        continue;
                    }

                    const data = await response.json();
                    
                    if (api.includes('mcstatus.io')) {
                        if (!data.online) continue;

                        const playerList = data.players?.list?.filter(p => 
                            p && p.name_raw && !p.name_raw.includes('§')
                        ).map(p => p.name_clean) || [];
                        
                        let queueInfo = '';
                        const queueMatch = data.players?.list?.find(p => 
                            p && p.name_raw && p.name_raw.includes('排队')
                        );
                        if (queueMatch) {
                            queueInfo = `\n${queueMatch.name_clean}`;
                        }
                        
                        return {
                            online: true,
                            players: {
                                online: data.players?.online || 0,
                                max: data.players?.max || 0,
                                list: playerList
                            },
                            motd: (data.motd?.clean || '') + queueInfo,
                            version: data.version?.name_clean || '',
                            software: data.software || ''
                        };
                    } else if (api.includes('mcsrvstat.us')) {
                        if (!data.online) continue;

                        let queueInfo = '';
                        if (Array.isArray(data.info?.clean)) {
                            const queueMatch = data.info.clean.find(line => 
                                line && line.includes('排队')
                            );
                            if (queueMatch) {
                                queueInfo = `\n${queueMatch}`;
                            }
                        }

                        let motd = '';
                        if (Array.isArray(data.motd?.clean)) {
                            motd = data.motd.clean.filter(line => line).join('\n');
                        } else if (data.motd?.clean) {
                            motd = data.motd.clean;
                        }
                        
                        return {
                            online: true,
                            players: {
                                online: data.players?.online || 0,
                                max: data.players?.max || 0,
                                list: Array.isArray(data.players?.list) ? data.players.list : []
                            },
                            motd: motd + queueInfo,
                            version: data.version || '',
                            software: data.software || ''
                        };
                    }
                    break;
                } catch (error) {
                    lastError = error;
                    if (error.name === 'AbortError' || error.message === 'Timeout') {
                    } else {
                    }
                    
                    if (retry === maxRetries - 1) continue;
                }
            }
        }

        return { online: false, players: null };
    } catch (error) {
        return { online: false, players: null };
    }
}

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