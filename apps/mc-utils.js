import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录和文件路径
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'MCServer');
const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');
const DEFAULT_CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'default_config');

// 确保配置目录存在
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
    fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
}

// 默认配置
const DEFAULT_CONFIG = {
    checkInterval: 1,
    maxServers: 10,
    pushFormat: '【MC服务器推送】{player} 已{action} {server}',
    apiTimeout: 5
};

// 获取配置
export function getConfig(key) {
    try {
        const configPath = path.join(CONFIG_DIR, 'mctool.yaml');
        const defaultConfigPath = path.join(DEFAULT_CONFIG_DIR, 'mctool.yaml');

        // 如果配置文件不存在，创建默认配置
        if (!fs.existsSync(defaultConfigPath)) {
            fs.writeFileSync(defaultConfigPath, 
                Object.entries(DEFAULT_CONFIG)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n')
            );
        }
        if (!fs.existsSync(configPath)) {
            fs.copyFileSync(defaultConfigPath, configPath);
        }

        // 读取配置
        const config = fs.readFileSync(configPath, 'utf8')
            .split('\n')
            .reduce((acc, line) => {
                const [key, value] = line.split(':').map(s => s.trim());
                if (key && value) {
                    acc[key] = isNaN(value) ? value : Number(value);
                }
                return acc;
            }, {});

        return key ? config[key] : config;
    } catch (error) {
        console.error('读取配置文件失败:', error);
        return key ? DEFAULT_CONFIG[key] : DEFAULT_CONFIG;
    }
}

// 初始化数据目录和文件
export function initDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

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
            return JSON.parse(fs.readFileSync(PATHS[type], 'utf8'));
        } catch (error) {
            console.error(`读取${type}数据失败:`, error);
            return {};
        }
    },

    write(type, data) {
        try {
            fs.writeFileSync(PATHS[type], JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error(`写入${type}数据失败:`, error);
            return false;
        }
    }
};

// 权限检查
export async function checkGroupAdmin(e) {
    if (!e.isGroup) {
        e.reply('该功能仅限群聊使用');
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
        console.error(`查询服务器状态失败: ${address}`, error);
        return { online: false, players: null };
    }
}

// 格式化推送消息
export function formatPushMessage(player, action, server) {
    const format = getConfig('pushFormat');
    return format
        .replace('{player}', player)
        .replace('{action}', action)
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