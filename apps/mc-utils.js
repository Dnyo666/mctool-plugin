import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fetch from 'node-fetch'
import HttpsProxyAgent from 'https-proxy-agent'
import logger from '../models/logger.js'
import YAML from 'yaml'
import lodash from 'lodash'
import { CloudAPI } from '../lib/cloud-api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 基础路径
const YUNZAI_DIR = path.join(__dirname, '..', '..', '..')  // Yunzai-Bot 根目录
const PLUGIN_DIR = path.join(YUNZAI_DIR, 'plugins', 'mctool-plugin')  // 插件根目录
const CONFIG_FILE = path.join(PLUGIN_DIR, 'config', 'config.yaml')  // 配置文件路径
const DEFAULT_CONFIG_FILE = path.join(PLUGIN_DIR, 'config', 'default_config.yaml')  // 默认配置文件路径

// 配置管理
let configCache = null

// 使用单例模式管理cloudAPI
let cloudAPIInstance = null;
let cloudAPIInitialized = false;

/**
 * 初始化云端API
 * @param {import('icqq').Client} Bot 机器人实例
 * @returns {Promise<{api: CloudAPI, available: boolean}>} 云API实例和可用状态
 */
async function initCloudAPI(Bot) {
    if (cloudAPIInitialized) {
        return {
            api: cloudAPIInstance,
            available: cloudAPIInstance && cloudAPIInstance.available
        };
    }

    if (!Bot?.uin) {
        logger.error('[MCTool] 初始化云端API失败: Bot实例未定义或缺少uin');
        cloudAPIInitialized = true;
        cloudAPIAvailable = false;
        return {
            api: null,
            available: false
        };
    }

    try {
        cloudAPIInstance = new CloudAPI();
        await cloudAPIInstance.init();

        if (!cloudAPIInstance.available) {
            const botId = Bot.uin.toString();
            logger.info(`[MCTool] 未找到有效的Token，尝试使用QQ号(${botId})进行注册...`);
            await cloudAPIInstance.register(botId);
            logger.info('[MCTool] 云端API注册/恢复成功');
        }

        cloudAPIInitialized = true;
        cloudAPIAvailable = cloudAPIInstance.available;
        
        return {
            api: cloudAPIInstance,
            available: cloudAPIInstance.available
        };
    } catch (err) {
        logger.error(`[MCTool] 云端API初始化失败: ${err.message}`);
        cloudAPIInitialized = true;
        cloudAPIAvailable = false;
        return {
            api: null,
            available: false
        };
    }
}

// 导出一个标志来表示云API是否可用
let cloudAPIAvailable = false;

/**
 * 初始化配置文件
 */
function initConfig() {
    try {
        // 确保配置目录存在
        const configDir = path.dirname(CONFIG_FILE)
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
        }

        // 如果配置文件不存在，从默认配置创建
        if (!fs.existsSync(CONFIG_FILE)) {
            if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
                // 直接复制默认配置文件，保持完全一致的格式和内容
                fs.copyFileSync(DEFAULT_CONFIG_FILE, CONFIG_FILE)
                logger.info('[MCTool] 已从默认配置创建配置文件')
            } else {
                logger.error('[MCTool] 默认配置文件不存在')
                return false
            }
        }
        return true
    } catch (error) {
        logger.error('[MCTool] 初始化配置文件失败:', error)
        return false
    }
}

/**
 * 获取配置
 * @returns {object} 配置对象
 */
function getConfig() {
    try {
        // 初始化配置文件
        if (!initConfig()) {
            return getDefaultConfig()
        }

        // 读取配置文件
        const config = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
        
        // 确保 apis 是数组
        if (!Array.isArray(config.apis)) {
            config.apis = []
        }

        // 合并默认配置，确保所有必需的字段都存在
        const defaultConfig = getDefaultConfig()
        return lodash.merge({}, defaultConfig, config)
    } catch (error) {
        logger.error('[MCTool] 读取配置文件失败:', error)
        return getDefaultConfig()
    }
}

/**
 * 获取默认配置
 * @returns {object} 默认配置对象
 */
function getDefaultConfig() {
    try {
        // 如果默认配置文件存在，从文件读取
        if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
            return YAML.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf8'))
        }
    } catch (error) {
        logger.error('[MCTool] 读取默认配置文件失败:', error)
    }

    // 返回硬编码的默认配置
    return {
        apis: [],  // 确保返回空数组而不是 undefined
        schedule: {
            cron: '30 * * * * *',
            startupNotify: true,
            retryDelay: 5000
        },
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
            render3D: {
                server: 'http://127.0.0.1:3006',
                endpoint: '/render',
                width: 300,
                height: 600
            }
        }
    }
}

// 数据管理类
class DataManager {
    constructor() {
        const config = getConfig();
        this.dataPath = path.join(YUNZAI_DIR, config.dataPath || 'data/mctool');
        this.ensureDirectories();
        
        // 执行数据迁移
        this.migrateData();
        
        // 初始化默认数据文件
        const defaultFiles = ['servers', 'current', 'historical', 'changes', 'subscriptions', 'verification', 'verification_requests'];
        for (const file of defaultFiles) {
            const filePath = this.getFilePath(file);
            if (!fs.existsSync(filePath)) {
                // 为验证相关文件设置特殊的初始数据结构
                let initialData = {};
                if (file === 'verification') {
                    initialData = {
                        groups: {},  // 群组配置
                        global: {    // 全局配置
                            enabled: false,
                            allowDuplicateNames: false,
                            autoReject: true
                        }
                    };
                } else if (file === 'verification_requests') {
                    initialData = {
                        requests: {},  // 请求记录
                        stats: {       // 统计数据
                            total: 0,
                            approved: 0,
                            rejected: 0,
                            pending: 0
                        }
                    };
                }
                this.write(file, initialData);
                logger.info(`[MCTool] 创建数据文件: ${file}.json`);
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

    /**
     * 获取群组验证配置
     * @param {string} groupId 群号
     * @returns {object} 验证配置
     */
    getGroupVerification(groupId) {
        const verification = this.read('verification');
        const config = getConfig();
        
        // 确保基础数据结构存在
        if (!verification.groups) {
            verification.groups = {};
        }
        if (!verification.global) {
            verification.global = {
                enabled: config.verification?.enabled ?? false,
                allowDuplicateNames: false,
                autoReject: true,
                expireTime: config.verification?.expireTime ?? 86400,
                maxRequests: config.verification?.maxRequests ?? 5
            };
            this.write('verification', verification);
        } else {
            // 更新全局配置
            verification.global = {
                ...verification.global,
                enabled: config.verification?.enabled ?? verification.global.enabled ?? false,
                expireTime: config.verification?.expireTime ?? verification.global.expireTime ?? 86400,
                maxRequests: config.verification?.maxRequests ?? verification.global.maxRequests ?? 5
            };
            this.write('verification', verification);
        }
        
        // 初始化群组配置
        if (!verification.groups[groupId]) {
            verification.groups[groupId] = {
                enabled: verification.global.enabled,
                allowDuplicateNames: verification.global.allowDuplicateNames,
                autoReject: verification.global.autoReject,
                expireTime: verification.global.expireTime,
                maxRequests: verification.global.maxRequests,
                users: {}
            };
            this.write('verification', verification);
        } else {
            // 更新群组配置
            verification.groups[groupId] = {
                ...verification.groups[groupId],
                expireTime: verification.global.expireTime,
                maxRequests: verification.global.maxRequests,
                users: verification.groups[groupId].users || {}
            };
            this.write('verification', verification);
        }
        
        return verification.groups[groupId];
    }

    /**
     * 保存群组验证配置
     * @param {string} groupId 群号
     * @param {object} config 验证配置
     */
    saveGroupVerification(groupId, config) {
        const verification = this.read('verification');
        verification.groups[groupId] = config;
        return this.write('verification', verification);
    }

    /**
     * 记录验证请求
     * @param {string} groupId 群号
     * @param {string} userId QQ号
     * @param {object} request 请求信息
     */
    addVerificationRequest(groupId, userId, request) {
        const requests = this.read('verification_requests');
        
        // 初始化数据结构
        if (!requests.requests) {
            requests.requests = {};
        }
        if (!requests.stats) {
            requests.stats = {
                total: 0,
                approved: 0,
                rejected: 0,
                pending: 0
            };
        }
        if (!requests.requests[groupId]) {
            requests.requests[groupId] = {};
        }
        
        requests.requests[groupId][userId] = {
            ...request,
            timestamp: Date.now()
        };
        requests.stats.total++;
        requests.stats.pending++;
        
        return this.write('verification_requests', requests);
    }

    /**
     * 更新验证请求状态
     * @param {string} groupId 群号
     * @param {string} userId QQ号
     * @param {boolean} approved 是否通过
     */
    updateVerificationRequest(groupId, userId, approved) {
        const requests = this.read('verification_requests');
        
        // 初始化数据结构
        if (!requests.requests) {
            requests.requests = {};
        }
        if (!requests.stats) {
            requests.stats = {
                total: 0,
                approved: 0,
                rejected: 0,
                pending: 0
            };
        }
        if (!requests.requests[groupId]) {
            requests.requests[groupId] = {};
        }
        
        // 如果存在请求记录，更新状态
        if (requests.requests[groupId][userId]) {
            const request = requests.requests[groupId][userId];
            const oldStatus = request.status;
            
            // 如果之前是 pending 状态，更新统计数据
            if (oldStatus === 'pending') {
                requests.stats.pending--;
                requests.stats[approved ? 'approved' : 'rejected']++;
            }
            
            request.status = approved ? 'approved' : 'rejected';
            request.updateTime = Date.now();
            
            this.write('verification_requests', requests);
        }
    }

    /**
     * 执行数据迁移
     */
    migrateData() {
        logger.info('[MCTool] 开始检查数据迁移状态...');
        
        // 检查旧版数据文件是否存在
        const oldBindingsPath = path.join(this.dataPath, 'user_bindings.json');
        const oldIndexPath = path.join(this.dataPath, 'username_index.json');
        
        // 如果旧版文件都不存在，标记为已迁移并返回
        if (!fs.existsSync(oldBindingsPath) && !fs.existsSync(oldIndexPath)) {
            logger.info('[MCTool] 未检测到旧版数据文件，无需迁移');
            this.write('migration_status', { completed: true, timestamp: new Date().toISOString() });
            return;
        }

        // 检查迁移状态
        const migrationStatus = this.read('migration_status');
        if (migrationStatus && migrationStatus.completed) {
            logger.info('[MCTool] 数据已经完成迁移，跳过迁移步骤');
            return;
        }

        logger.info('[MCTool] 开始执行数据迁移...');

        // 确保分类数据存在
        const mojangBindings = this.read('mojang_bindings') || {};
        const mojangIndex = this.read('mojang_username_index') || {};
        
        let oldBindings = {};
        
        // 读取旧数据文件
        if (fs.existsSync(oldBindingsPath)) {
            try {
                const content = fs.readFileSync(oldBindingsPath, 'utf8');
                oldBindings = JSON.parse(content) || {};
                logger.info(`[MCTool] 成功读取旧版绑定数据，包含 ${Object.keys(oldBindings).length} 个用户记录`);
            } catch (err) {
                logger.error(`[MCTool] 读取旧版绑定数据失败: ${err.message}`);
                return;
            }
        }
        
        // 只有当旧数据存在且不为空时才进行迁移
        if (Object.keys(oldBindings).length > 0) {
            logger.info('[MCTool] 开始迁移用户数据...');
            const now = new Date().toISOString();
            let migratedCount = 0;
            
            // 迁移旧数据到新格式
            for (const [qqNumber, bindings] of Object.entries(oldBindings)) {
                if (!mojangBindings[qqNumber]) {
                    mojangBindings[qqNumber] = [];
                }
                
                for (const binding of bindings) {
                    // 转换时间格式
                    const createTime = binding.bindTime ? new Date(binding.bindTime).toISOString() : now;
                    
                    // 添加新格式的绑定数据
                    mojangBindings[qqNumber].push({
                        username: binding.username,
                        uuid: binding.uuid,
                        raw_uuid: binding.raw_uuid,
                        createTime: createTime,
                        updateTime: createTime,
                        isBound: true,
                        type: 'mojang'
                    });
                    
                    // 更新索引
                    mojangIndex[binding.username.toLowerCase()] = qqNumber;
                    migratedCount++;
                }
            }
            
            // 保存迁移后的数据
            logger.info(`[MCTool] 成功迁移 ${migratedCount} 条绑定记录`);
            this.write('mojang_bindings', mojangBindings);
            this.write('mojang_username_index', mojangIndex);
            
            // 删除旧数据文件
            try {
                if (fs.existsSync(oldBindingsPath)) {
                    fs.unlinkSync(oldBindingsPath);
                    logger.info('[MCTool] 已删除旧版绑定数据文件');
                }
                
                if (fs.existsSync(oldIndexPath)) {
                    fs.unlinkSync(oldIndexPath);
                    logger.info('[MCTool] 已删除旧版索引文件');
                }
            } catch (err) {
                logger.error(`[MCTool] 删除旧数据文件失败: ${err.message}`);
            }
        }

        // 修正现有数据的时间字段格式
        let hasChanges = false;
        for (const [qqNumber, bindings] of Object.entries(mojangBindings)) {
            for (const binding of bindings) {
                if (binding.bindTime) {
                    binding.createTime = new Date(binding.bindTime).toISOString();
                    delete binding.bindTime;
                    hasChanges = true;
                }
                if (binding.unbindTime) {
                    binding.updateTime = new Date(binding.unbindTime).toISOString();
                    delete binding.unbindTime;
                    hasChanges = true;
                }
            }
        }

        // 如果有修改，保存更新后的数据
        if (hasChanges) {
            this.write('mojang_bindings', mojangBindings);
            logger.info('[MCTool] 已更新绑定数据的时间字段格式');
        }

        // 标记迁移完成
        this.write('migration_status', {
            completed: true,
            timestamp: new Date().toISOString()
        });
        logger.info('[MCTool] 数据迁移完成');
    }
}

// 权限检查
async function checkGroupAdmin(e) {
    if (!e.isGroup) {
        e.reply('该功能仅群聊使用')
        return false
    }

    try {
        const memberInfo = await e.group.getMemberMap()
        const userInfo = memberInfo.get(e.user_id)
        if (!(['owner', 'admin'].includes(userInfo.role) || e.isMaster)) {
            e.reply('该功能需要群管理员权限')
            return false
        }
        return true
    } catch (err) {
        logger.error('[MCTool] 检查管理员权限失败:', err)
        return false
    }
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
        // 检查数据是否有效
        if (!data || typeof data !== 'object') {
            return null;
        }

        // 检查在线状态
        const online = getNestedValue(data, parser.online);
        if (online === undefined || online === null) {
            return null;
        }

        // 获取玩家信息
        const playerData = {
            online: getNestedValue(data, parser.players.online) || 0,
            max: getNestedValue(data, parser.players.max) || 0,
            list: []
        };

        // 处理玩家列表
        const playerList = getNestedValue(data, parser.players.list);
        if (Array.isArray(playerList)) {
            playerData.list = playerList.map(player => {
                if (typeof player === 'string') {
                    return { name: player, uuid: '' };
                } else if (typeof player === 'object' && player !== null) {
                    return {
                        name: player.name || player.name_clean || '',
                        uuid: player.uuid || player.id || ''
                    };
                }
                return null;
            }).filter(p => p !== null && p.name);
        }

        return {
            online: online,
            players: playerData,
            version: getNestedValue(data, parser.version) || 'Unknown',
            motd: getNestedValue(data, parser.motd) || ''
        };
    } catch (error) {
        logger.error('[MCTool] 解析 API 响应失败:', error);
        return null;
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

/**
 * 解析服务器状态数据
 * @param {Object} data API返回的原始数据
 * @param {Object} parser 解析器配置
 * @returns {Object} 解析后的服务器状态
 */
function parseServerStatus(data, parser) {
    try {
        if (!data || typeof data !== 'object') {
            return null;
        }

        // 基础状态
        const status = {
            online: data.online || false,
            players: {
                online: data.players?.online || 0,
                max: data.players?.max || 0,
                list: []
            },
            version: '',
            description: '',
            timestamp: Date.now()
        };

        // 处理玩家列表
        if (data.players?.list && Array.isArray(data.players.list)) {
            status.players.list = data.players.list.map(player => {
                if (typeof player === 'string') {
                    return { name: player, uuid: '' };
                } else if (typeof player === 'object' && player !== null) {
                    return {
                        name: player.name || '',
                        uuid: player.uuid || player.id || ''
                    };
                }
                return null;
            }).filter(p => p !== null && p.name);
        }

        // 处理版本信息
        if (data.version) {
            if (typeof data.version === 'object') {
                status.version = data.version.name_clean || data.version.name || data.protocol?.name || data.version;
            } else {
                status.version = data.version;
            }
        } else if (data.protocol?.name) {
            status.version = data.protocol.name;
        }

        // 处理服务器描述（MOTD）
        if (data.motd) {
            if (Array.isArray(data.motd.clean)) {
                status.description = data.motd.clean.join('\n');
            } else if (Array.isArray(data.motd.raw)) {
                status.description = data.motd.raw.join('\n');
            } else if (typeof data.motd.clean === 'string') {
                status.description = data.motd.clean;
            } else if (typeof data.motd.raw === 'string') {
                status.description = data.motd.raw;
            }
        }

        return status;
    } catch (error) {
        logger.error('[MCTool] 解析服务器状态失败:', error);
        return null;
    }
}

/**
 * 查询服务器状态
 * @param {string} address 服务器地址
 * @param {Object} api API配置
 * @param {number} retryCount 重试次数
 * @returns {Promise<Object>} 服务器状态
 */
async function queryServerStatus(address, api, retryCount = 0) {
    try {
        if (!address || !api) {
            throw new Error('Invalid parameters');
        }

        const [host, port = '25565'] = address.split(':');
        let url = api.url.replace('{host}', host).replace('{port}', port);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), (api.timeout || 30) * 1000);

        const options = {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        if (process.env.https_proxy) {
            options.agent = new HttpsProxyAgent(process.env.https_proxy);
        }

        const response = await fetch(url, options);
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const status = parseServerStatus(data, api.parser);

        if (!status) {
            throw new Error('Failed to parse server status');
        }

        // 添加API信息
        status.api = {
            name: api.name,
            success: true,
            error: null
        };

        return status;
    } catch (error) {
        logger.error(`[MCTool] API ${api.name} 查询失败:`, error.message);

        if (retryCount < (api.maxRetries || 3)) {
            logger.debug(`[MCTool] API ${api.name} 重试第 ${retryCount + 1} 次`);
            await new Promise(resolve => setTimeout(resolve, api.retryDelay || 1000));
            return queryServerStatus(address, api, retryCount + 1);
        }

        // 返回错误状态
        return {
            online: false,
            players: {
                online: 0,
                max: 0,
                list: []
            },
            version: '',
            description: '',
            timestamp: Date.now(),
            api: {
                name: api.name,
                success: false,
                error: error.message
            }
        };
    }
}

/**
 * 从对象中获取嵌套属性值
 * @param {Object} obj 对象
 * @param {string} path 属性路径
 * @returns {any} 属性值
 */
function getValue(obj, path) {
    if (!path || typeof path !== 'string') {
        return undefined;
    }
    return path.split('.').reduce((o, i) => (o === null || o === undefined) ? undefined : o[i], obj);
}

/**
 * 从对象中获取数组值
 * @param {Object} obj 对象
 * @param {string} path 属性路径
 * @returns {Array} 数组值
 */
function getArrayValue(obj, path) {
    if (!path || typeof path !== 'string') {
        return [];
    }
    const arrayPath = path.endsWith('[]') ? path.slice(0, -2) : path;
    const value = getValue(obj, arrayPath);
    if (!Array.isArray(value)) return [];
    
    const fieldPath = path.match(/\[\]\.(.+)$/)?.[1];
    if (fieldPath) {
        return value.map(item => getValue(item, fieldPath)).filter(Boolean);
    }
    return value;
}

/**
 * 从 PlayerDB API 获取玩家 UUID
 * @param {string} username 玩家名
 * @returns {Promise<{uuid: string|null, raw_id: string|null}>} UUID 信息
 */
async function getPlayerUUID(username) {
    try {
        const response = await fetch(`https://playerdb.co/api/player/minecraft/${username}`);
        if (!response.ok) {
            return { uuid: null, raw_id: null };
        }
        
        const data = await response.json();
        if (data.success && data.data?.player?.id) {
            return {
                uuid: data.data.player.id,           // 带横线的 UUID
                raw_id: data.data.player.raw_id      // 不带横线的 UUID
            };
        }
        return { uuid: null, raw_id: null };
    } catch (error) {
        logger.error(`[MCTool] 从 PlayerDB 获取玩家 ${username} 的UUID失败:`, error);
        return { uuid: null, raw_id: null };
    }
}

// 创建实例
const Data = new DataManager();

// 导出实例和函数
export {
    Data,
    getConfig,
    getPlayerUUID,
    cloudAPIAvailable,
    checkGroupAdmin,
    queryServerStatus,
    initCloudAPI
} 