import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录和文件路径
const PLUGIN_DIR = path.join(__dirname, '..');  // 插件根目录
const PLUGIN_NAME = 'mctool-plugin';
const DATA_DIR = path.join(PLUGIN_DIR, 'data');   // 数据存储目录
const CONFIG_DIR = path.join(PLUGIN_DIR, 'config');  // 配置目录

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// 数据文件路径
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
    apiTimeout: 10,
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
        e.reply('该功能仅��群聊使用');
        return false;
    }

    const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
    if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
        e.reply('该功能需要群管理员权限');
        return false;
    }

    return true;
}

// 服务器状态查询
export async function queryServerStatus(address) {
    try {
        const timeout = getConfig('apiTimeout') * 1000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(
            `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(address)}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        const data = await response.json();
        return {
            online: data.online,
            players: data.online ? {
                online: data.players.online,
                max: data.players.max,
                list: data.players.list?.map(p => p.name_clean) || []
            } : null
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`查询服务器超时: ${address}`);
            return { online: false, players: null, timeout: true };
        }
        console.error(`查询服务器��态失败: ${address}`, error);
        return { online: false, players: null };
    }
}

// 格式化推送消息
export function formatPushMessage(player, action, server) {
    const format = getConfig('pushFormat');
    const template = action === 'join' ? format.join : 
                    action === 'leave' ? format.leave : 
                    format.newPlayer;
    return template
        .replace('{player}', player)
        .replace('{server}', server);
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
    pluginName: 'MCTool',
    /** 插件描述 */
    pluginDesc: 'Minecraft服务器管理插件'
}; 