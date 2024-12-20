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
const PLUGIN_DIR = path.join(__dirname, '..');  // 插件根目录
const DATA_DIR = path.join(YUNZAI_DIR, 'data', 'mctool');   // 数据存储目录（在 Yunzai 的 data 目录下）
const CONFIG_DIR = path.join(PLUGIN_DIR, 'config');  // 配置目录（在插件目录下）

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// 数据文件路径（全部存储在 Yunzai 的 data 目录下）
export const PATHS = {
    servers: path.join(DATA_DIR, 'servers.json'),         // 群组服务器列表
    current: path.join(DATA_DIR, 'currentPlayers.json'),  // 当前在线玩家
    changes: path.join(DATA_DIR, 'playerChanges.json'),   // 玩家变动记录
    subscriptions: path.join(DATA_DIR, 'groupSubscriptions.json'), // 群组推送订阅配置
    historical: path.join(DATA_DIR, 'historicalPlayers.json'),  // 历史玩家记录
    auth_config: path.join(DATA_DIR, 'auth_config.json'),  // 验证配置
    verified_users: path.join(DATA_DIR, 'verified_users.json')  // 已验证用户
};

// 默认配置
const DEFAULT_CONFIG = {
    checkInterval: 5,
    maxServers: 10,
    apiTimeout: 30,        // 增加默认超时时间到 30 秒
    maxRetries: 3,         // 添加最大重试次数
    retryDelay: 1000,      // 重试间隔（毫秒）
    pushFormat: {
        join: '玩家 {player} 加入了 {server} 服务器',
        leave: '玩家 {player} 离开了 {server} 服务器',
        newPlayer: '欢迎新玩家 {player} 首次加入 {server} 服务器！',
        serverOnline: '{server} 服务器已上线',
        serverOffline: '{server} 服务器已离线'
    },
    auth: {
        apiUrl: 'https://api.mojang.com',
        requestTimeout: 5000,
        maxUsernameLength: 16,
        debug: false
    }
};

// 获取配置
export function getConfig(key) {
    try {
        const configFile = path.join(CONFIG_DIR, 'config.yaml');
        // 如果配置文件不存在，创建默认配置
        if (!fs.existsSync(configFile)) {
            fs.writeFileSync(configFile, YAML.stringify(DEFAULT_CONFIG), 'utf8');
        }

        // 读取配置
        const config = YAML.parse(fs.readFileSync(configFile, 'utf8'));
        return key ? config[key] : config;
    } catch (error) {
        console.error('读取配置文件失败:', error);
        return key ? DEFAULT_CONFIG[key] : DEFAULT_CONFIG;
    }
}

// 保存配置
export function saveConfig(config) {
    try {
        const configFile = path.join(CONFIG_DIR, 'config.yaml');
        const yaml = YAML.stringify(config);
        fs.writeFileSync(configFile, yaml, 'utf8');
        return true;
    } catch (error) {
        console.error('保存配置文件失败:', error);
        return false;
    }
}

// 初始化数据目录和文件
export function initDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

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
            console.error(`读取${type}数据失败:`, error);
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
            console.error(`写入${type}数据失败:`, error);
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

    const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
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
        const timeout = (config.apiTimeout || 30) * 1000;  // 使用更长的超时时间
        const maxRetries = config.maxRetries || 3;
        const retryDelay = config.retryDelay || 1000;

        // 构建请求选项
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        // 如果配置了代理，添加代理
        if (process.env.https_proxy) {
            options.agent = new HttpsProxyAgent(process.env.https_proxy);
        }

        // 处理地址格式
        let [host, port] = address.split(':');
        port = port || '25565';  // 如果没有指定端口，使用默认端口

        // 获取配置的 API 和备用 API
        const apis = [];
        // 如果配置了自定义 API，优先使用
        if (config.customApi) {
            apis.push(config.customApi.replace('{address}', encodeURIComponent(`${host}:${port}`)));
        }
        // 添加备用 API，使用不同的地址格式
        apis.push(
            `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(host)}${port === '25565' ? '' : ':' + port}`,
            `https://api.mcsrvstat.us/3/${encodeURIComponent(host)}${port === '25565' ? '' : ':' + port}`
        );

        let lastError = null;
        for (const api of apis) {
            // 为每个 API 添加重试机制
            for (let retry = 0; retry < maxRetries; retry++) {
                try {
                    if (retry > 0) {
                        logger.info(`[MCTool] 正在重试 API (${retry}/${maxRetries}): ${api}`);
                        await sleep(retryDelay);  // 重试前等待
                    } else {
                        logger.info(`[MCTool] 正在查询 API: ${api}`);
                    }
                    
                    // 使用 Promise.race 和超时控制
                    const fetchPromise = fetch(api, options);
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Timeout')), timeout);
                    });

                    const response = await Promise.race([fetchPromise, timeoutPromise]);

                    if (!response.ok) {
                        logger.warn(`[MCTool] API ${api} 返回状态码: ${response.status}`);
                        continue;
                    }

                    const data = await response.json();
                    
                    // 处理不同 API 的返回格式
                    if (api.includes('mcstatus.io')) {
                        // 确保数据存在
                        if (!data.online) {
                            continue;  // 如果这个 API 返回离线，尝试下一个重试或 API
                        }

                        // 安全地获取玩家列表
                        const playerList = data.players?.list?.filter(p => 
                            p && p.name_raw && !p.name_raw.includes('§')
                        ).map(p => p.name_clean) || [];
                        
                        // 安全地获取排队信息
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
                        // 确保数据存在
                        if (!data.online) {
                            continue;  // 如果这个 API 返回离线，尝试下一个重试或 API
                        }

                        // 安全地获取排队信息
                        let queueInfo = '';
                        if (Array.isArray(data.info?.clean)) {
                            const queueMatch = data.info.clean.find(line => 
                                line && line.includes('排队')
                            );
                            if (queueMatch) {
                                queueInfo = `\n${queueMatch}`;
                            }
                        }

                        // 安全地处理 MOTD
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

                    // 如果成功获取数据，跳出重试循环
                    break;
                } catch (error) {
                    lastError = error;
                    if (error.message === 'Timeout') {
                        logger.warn(`[MCTool] API ${api} 请求超时 (${retry + 1}/${maxRetries})`);
                    } else {
                        logger.error(`[MCTool] API ${api} 查询失败 (${retry + 1}/${maxRetries}):`, error.message);
                    }
                    
                    // 如果是最后一次重试，继续尝试下一个 API
                    if (retry === maxRetries - 1) {
                        continue;
                    }
                }
            }
        }

        // 所有 API 和重试都失败了
        logger.error(`[MCTool] 所有 API 查询失败: ${lastError?.message || '未知错误'}`);
        return { online: false, players: null };
    } catch (error) {
        logger.error(`[MCTool] 查询服务器状态失败: ${address}`, error);
        return { online: false, players: null };
    }
}

// 格式化推送消息
export function formatPushMessage(type, data, server) {
    const format = getConfig('pushFormat');
    
    switch (type) {
        case 'join':
            return format.join.replace('{player}', data).replace('{server}', server);
        case 'leave':
            return format.leave.replace('{player}', data).replace('{server}', server);
        case 'new':
            return format.newPlayer.replace('{player}', data).replace('{server}', server);
        case 'online':
            return format.serverOnline.replace('{server}', server);
        case 'offline':
            return format.serverOffline.replace('{server}', server);
        default:
            return '';
    }
}

// 比较玩家列表变化
export function comparePlayerLists(oldList = [], newList = []) {
    const joined = newList.filter(player => !oldList.includes(player));
    const left = oldList.filter(player => !newList.includes(player));
    return { joined, left };
}

// 检查是否为新玩家
export function isNewPlayer(player, historicalPlayers) {
    return !historicalPlayers.includes(player);
}

// 更新历史玩家记录
export function updateHistoricalPlayers(serverId, players) {
    const historical = Data.read('historical');
    if (!historical[serverId]) {
        historical[serverId] = [];
    }
    
    const newPlayers = players.filter(player => !historical[serverId].includes(player));
    if (newPlayers.length > 0) {
        historical[serverId].push(...newPlayers);
        Data.write('historical', historical);
    }
    
    return newPlayers;
}

// 处理服务器状态变化
export function handleServerStatusChange(serverId, oldStatus, newStatus) {
    // 获取订阅了该服务器的群组
    const subscriptions = Data.read('subscriptions');
    const servers = Data.read('servers');
    const serverName = servers[serverId]?.name || serverId;
    
    // 遍历所有群组
    for (const [groupId, groupConfig] of Object.entries(subscriptions)) {
        if (!groupConfig?.servers?.[serverId]?.enabled) continue;
        
        // 检查服务器状态变化
        if (oldStatus?.online !== newStatus?.online) {
            const message = formatPushMessage(
                newStatus.online ? 'online' : 'offline',
                null,
                serverName
            );
            Bot.pickGroup(groupId).sendMsg(message);
        }
        
        // 如果服务器在线，检查玩家变化
        if (newStatus?.online && newStatus?.players?.list) {
            const oldPlayers = oldStatus?.players?.list || [];
            const newPlayers = newStatus.players.list;
            
            const { joined, left } = comparePlayerLists(oldPlayers, newPlayers);
            
            // 处理新加入的玩家
            for (const player of joined) {
                // 检查是否为新玩家
                const historical = Data.read('historical');
                const isNew = !historical[serverId]?.includes(player);
                
                // 发送消息
                const message = formatPushMessage(
                    isNew ? 'new' : 'join',
                    player,
                    serverName
                );
                Bot.pickGroup(groupId).sendMsg(message);
            }
            
            // 处理离开的玩家
            for (const player of left) {
                const message = formatPushMessage('leave', player, serverName);
                Bot.pickGroup(groupId).sendMsg(message);
            }
            
            // 更新历史玩家记录
            updateHistoricalPlayers(serverId, newPlayers);
        }
    }
    
    // 更新当前状态
    const current = Data.read('current');
    current[serverId] = newStatus;
    Data.write('current', current);
    
    // 记录变动
    const changes = Data.read('changes');
    if (!changes[serverId]) {
        changes[serverId] = [];
    }
    changes[serverId].push({
        time: Date.now(),
        status: newStatus
    });
    // 只保留最近 100 条记录
    if (changes[serverId].length > 100) {
        changes[serverId] = changes[serverId].slice(-100);
    }
    Data.write('changes', changes);
}

// 常量配置
export const CONFIG = {
    /** 命令前缀 */
    commandPrefix: '#mc',
    /** 插件版本 */
    version: '1.0.0',
    /** 插件作者 */
    author: '浅巷墨黎',
    /** 目地址 */
    github: 'https://github.com/Dnyo666/mctool-plugin',
    /** 交流群号 */
    qqGroup: '303104111',
    /** 插件名称 */
    pluginName: 'mctool-plugin',
    /** 插件描述 */
    pluginDesc: 'Minecraft服务器管理插件'
}; 