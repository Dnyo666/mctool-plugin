import { Data, getPlayerUUID, getConfig, initCloudAPI } from './mc-utils.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fs from 'fs'
import logger from '../models/logger.js'
import path from 'path'

export class MCUser extends plugin {
    constructor() {
        super({
            name: 'MCTool-用户',
            dsc: 'Minecraft用户管理',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc]绑定\\s+mojang\\s+(.+)$',
                    fnc: 'bindUser',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]解绑\\s+(mojang|littleskin)\\s+(.+)$',
                    fnc: 'unbindUser',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]信息$',
                    fnc: 'getUserInfo',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]查询绑定\\s+(mojang|littleskin)\\s+(.+)$',
                    fnc: 'queryBinding',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]头像\\s*(全身|半身|头部)?\\s*(.+)?$',
                    fnc: 'generateAvatar',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc](?:uuid|uid|id)(?:\\s+(.+))?$',
                    fnc: 'queryUUID',
                    permission: 'all'
                },
                {
                    reg: '^#mc皮肤渲染$',
                    fnc: 'renderSkin',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]绑定\\s+littleskin$',
                    fnc: 'bindLittleSkin',
                    permission: 'all'
                }
            ]
        })

        // 初始化云端API状态
        this.cloudAPI = null;
        this.cloudAvailable = false;

        // 异步初始化数据存储
        this.init();
    }

    /**
     * 异步初始化
     */
    async init() {
        await this.initDataStorage();
    }

    /**
     * 初始化数据存储
     */
    async initDataStorage() {
        // 初始化数据结构
        const mojangBindings = Data.read('mojang_bindings') || {};
        const littleSkinBindings = Data.read('littleskin_bindings') || {};
        const mojangIndex = Data.read('mojang_username_index') || {};
        const littleSkinIndex = Data.read('littleskin_username_index') || {};

        Data.write('mojang_bindings', mojangBindings);
        Data.write('littleskin_bindings', littleSkinBindings);
        Data.write('mojang_username_index', mojangIndex);
        Data.write('littleskin_username_index', littleSkinIndex);
    }

    /**
     * 初始化云端API
     * @returns {Promise<boolean>} 云端API是否可用
     */
    async initCloud() {
        try {
            const { api, available } = await initCloudAPI(this.e.bot);
            this.cloudAPI = api;
            this.cloudAvailable = available;
            logger.info(`[MCTool] 云端API状态: ${available ? '可用' : '不可用'}`);
            return this.cloudAvailable;
        } catch (err) {
            logger.error(`[MCTool] 云端API初始化失败: ${err.message}`);
            this.cloudAPI = null;
            this.cloudAvailable = false;
            return false;
        }
    }

    /**
     * 同步本地数据到云端
     */
    async syncLocalToCloud() {
        if (!this.cloudAvailable || !this.cloudAPI) return;

        try {
            // 获取本地数据
            const mojangBindings = Data.read('mojang_bindings') || {};
            const littleSkinBindings = Data.read('littleskin_bindings') || {};

            // 同步 Mojang 绑定
            for (const [qqNumber, userBindings] of Object.entries(mojangBindings)) {
                for (const binding of userBindings) {
                    try {
                        // 先查询云端状态
                        const response = await this.cloudAPI.request(`/api/binding/query?username=${binding.username}&bindType=mojang`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        });
                        const data = Array.isArray(response) ? response : (response.data || []);
                        const cloudBinding = data[0];

                        // 如果云端没有这条记录，或者本地更新时间更新，则同步到云端
                        if (!cloudBinding || 
                            (binding.updateTime && new Date(binding.updateTime) > new Date(cloudBinding.updateTime))) {
                            if (binding.isBound) {
                                // 本地是绑定状态，同步绑定
                                await this.cloudAPI.request('/api/binding/bind', {
                                    method: 'POST',
                                    headers: {
                                        'X-Bot-Token': this.cloudAPI.token,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        qqNumber: qqNumber,
                                        bindType: 'mojang',
                                        uuid: binding.raw_uuid,
                                        username: binding.username
                                    })
                                });
                                logger.info(`[MCTool] 成功同步绑定到云端: ${binding.username}`);
                            } else if (cloudBinding && cloudBinding.isBound) {
                                // 本地是解绑状态且更新时间更新，同步解绑
                                await this.cloudAPI.request('/api/binding/unbind', {
                                    method: 'POST',
                                    headers: {
                                        'X-Bot-Token': this.cloudAPI.token,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        qqNumber: qqNumber,
                                        bindType: 'mojang',
                                        username: binding.username
                                    })
                                });
                                logger.info(`[MCTool] 成功同步解绑到云端: ${binding.username}`);
                            }
                        }
                    } catch (err) {
                        // 如果是已绑定错误，跳过
                        if (!err.message.includes('已被绑定')) {
                            logger.error(`[MCTool] 同步绑定到云端失败: ${err.message}`);
                        }
                    }
                }
            }

            // 只有当 littleSkinBindings 有数据时才进行同步
            if (Object.keys(littleSkinBindings).length > 0) {
                // 同步 LittleSkin 绑定
                for (const [qqNumber, userBindings] of Object.entries(littleSkinBindings)) {
                    for (const binding of userBindings) {
                        try {
                            // 先查询云端状态
                            const response = await this.cloudAPI.request(`/api/binding/query?username=${binding.username}&bindType=littleskin`, {
                                headers: {
                                    'X-Bot-Token': this.cloudAPI.token
                                }
                            });
                            const data = Array.isArray(response) ? response : (response.data || []);
                            const cloudBinding = data[0];

                            // 如果云端没有这条记录，或者本地更新时间更新，则同步到云端
                            if (!cloudBinding || 
                                (binding.updateTime && new Date(binding.updateTime) > new Date(cloudBinding.updateTime))) {
                                // 本地存在记录，同步绑定
                                await this.cloudAPI.request('/api/binding/bind', {
                                    method: 'POST',
                                    headers: {
                                        'X-Bot-Token': this.cloudAPI.token,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        qqNumber: qqNumber,
                                        bindType: 'littleskin',
                                        uuid: binding.uuid,
                                        username: binding.username,
                                        skinData: binding.skinData
                                    })
                                });
                                logger.info(`[MCTool] 成功同步绑定到云端: ${binding.username}`);
                            } else if (cloudBinding && cloudBinding.isBound) {
                                // 本地是解绑状态且更新时间更新，同步解绑
                                await this.cloudAPI.request('/api/binding/unbind', {
                                    method: 'POST',
                                    headers: {
                                        'X-Bot-Token': this.cloudAPI.token,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        qqNumber: qqNumber,
                                        bindType: 'littleskin',
                                        username: binding.username
                                    })
                                });
                                logger.info(`[MCTool] 成功同步解绑到云端: ${binding.username}`);
                            }
                        } catch (err) {
                            // 如果是已绑定错误，跳过
                            if (!err.message.includes('已被绑定')) {
                                logger.error(`[MCTool] 同步绑定到云端失败: ${err.message}`);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            logger.error(`[MCTool] 同步本地数据到云端失败: ${err.message}`);
        }
    }

    /**
     * 同步云端数据到本地
     */
    async syncCloudToLocal() {
        if (!this.cloudAvailable || !this.cloudAPI) return;

        try {
            // 获取所有本地绑定的QQ号
            const mojangBindings = Data.read('mojang_bindings') || {};
            const littleSkinBindings = Data.read('littleskin_bindings') || {};
            const mojangIndex = {};
            const littleSkinIndex = {};

            // 处理每个本地绑定
            for (const [qqNumber, bindings] of Object.entries(mojangBindings)) {
                try {
                    // 获取该QQ号的云端绑定
                    const response = await this.cloudAPI.request(`/api/binding/query?qqNumber=${qqNumber}&bindType=mojang`, {
                        headers: {
                            'X-Bot-Token': this.cloudAPI.token
                        }
                    });
                    const cloudData = Array.isArray(response) ? response : (response.data || []);

                    // 更新本地绑定状态
                    const updatedBindings = [];
                    for (const localBinding of bindings) {
                        const cloudBinding = cloudData.find(cb => cb.username.toLowerCase() === localBinding.username.toLowerCase());
                        if (cloudBinding) {
                            // 如果云端有对应记录，使用云端数据
                            updatedBindings.push({
                                username: cloudBinding.username,
                                uuid: cloudBinding.uuid,
                                raw_uuid: cloudBinding.uuid.replace(/-/g, ''),
                                createTime: cloudBinding.createTime,
                                updateTime: cloudBinding.updateTime,
                                isBound: cloudBinding.isBound,
                                type: 'mojang'
                            });
                            // 如果是绑定状态，添加到索引
                            if (cloudBinding.isBound) {
                                mojangIndex[cloudBinding.username.toLowerCase()] = qqNumber;
                            }
                        } else {
                            // 如果云端没有记录，且本地记录比较新，保留本地记录
                            if (localBinding.updateTime) {
                                updatedBindings.push(localBinding);
                                if (localBinding.isBound) {
                                    mojangIndex[localBinding.username.toLowerCase()] = qqNumber;
                                }
                            }
                        }
                    }

                    // 添加本地没有但云端有的绑定
                    for (const cloudBinding of cloudData) {
                        if (!bindings.some(lb => lb.username.toLowerCase() === cloudBinding.username.toLowerCase())) {
                            updatedBindings.push({
                                username: cloudBinding.username,
                                uuid: cloudBinding.uuid,
                                raw_uuid: cloudBinding.uuid.replace(/-/g, ''),
                                createTime: cloudBinding.createTime,
                                updateTime: cloudBinding.updateTime,
                                isBound: cloudBinding.isBound,
                                type: 'mojang'
                            });
                            if (cloudBinding.isBound) {
                                mojangIndex[cloudBinding.username.toLowerCase()] = qqNumber;
                            }
                        }
                    }

                    mojangBindings[qqNumber] = updatedBindings;
                } catch (err) {
                    logger.error(`[MCTool] 同步云端数据到本地失败: ${err.message}`);
                }
            }

            // 处理 LittleSkin 绑定
            for (const [qqNumber, bindings] of Object.entries(littleSkinBindings)) {
                try {
                    // 获取该QQ号的云端绑定
                    const response = await this.cloudAPI.request(`/api/binding/query?qqNumber=${qqNumber}&bindType=littleskin`, {
                        headers: {
                            'X-Bot-Token': this.cloudAPI.token
                        }
                    });
                    const cloudData = Array.isArray(response) ? response : (response.data || []);

                    // 更新本地绑定状态
                    const updatedBindings = [];
                    for (const localBinding of bindings) {
                        const cloudBinding = cloudData.find(cb => cb.username.toLowerCase() === localBinding.username.toLowerCase());
                        if (cloudBinding) {
                            // 如果云端有对应记录，使用云端数据
                            updatedBindings.push({
                                username: cloudBinding.username,
                                uuid: cloudBinding.uuid,
                                createTime: cloudBinding.createTime,
                                updateTime: cloudBinding.updateTime,
                                isBound: cloudBinding.isBound,
                                type: 'littleskin',
                                skinData: cloudBinding.skinData
                            });
                            // 如果是绑定状态，添加到索引
                            if (cloudBinding.isBound) {
                                littleSkinIndex[cloudBinding.username.toLowerCase()] = qqNumber;
                            }
                        } else {
                            // 如果云端没有记录，且本地记录比较新，保留本地记录
                            if (localBinding.updateTime) {
                                updatedBindings.push(localBinding);
                                if (localBinding.isBound) {
                                    littleSkinIndex[localBinding.username.toLowerCase()] = qqNumber;
                                }
                            }
                        }
                    }

                    // 添加本地没有但云端有的绑定
                    for (const cloudBinding of cloudData) {
                        if (!bindings.some(lb => lb.username.toLowerCase() === cloudBinding.username.toLowerCase())) {
                            updatedBindings.push({
                                username: cloudBinding.username,
                                uuid: cloudBinding.uuid,
                                createTime: cloudBinding.createTime,
                                updateTime: cloudBinding.updateTime,
                                isBound: cloudBinding.isBound,
                                type: 'littleskin',
                                skinData: cloudBinding.skinData
                            });
                            if (cloudBinding.isBound) {
                                littleSkinIndex[cloudBinding.username.toLowerCase()] = qqNumber;
                            }
                        }
                    }

                    littleSkinBindings[qqNumber] = updatedBindings;
                } catch (err) {
                    logger.error(`[MCTool] 同步云端数据到本地失败: ${err.message}`);
                }
            }

            // 保存更新后的数据
            Data.write('mojang_bindings', mojangBindings);
            Data.write('littleskin_bindings', littleSkinBindings);
            Data.write('mojang_username_index', mojangIndex);
            Data.write('littleskin_username_index', littleSkinIndex);
        } catch (err) {
            logger.error(`[MCTool] 同步云端数据到本地失败: ${err.message}`);
        }
    }

    /**
     * 绑定用户
     * @param {*} e 消息事件
     */
    async bindUser(e) {
        logger.info(`[MCTool] 触发绑定命令: ${e.msg}`);
        const match = e.msg.match(/^#?[Mm][Cc]绑定\s+mojang\s+(.+)$/);
        const username = match[1].trim();

        if (!username) {
            e.reply('请提供要绑定的用户名');
            return false;
        }

        try {
            // 1. 初始化云端API
            await this.initCloud();
            if (!this.cloudAvailable) {
                e.reply('云端服务不可用，暂时无法进行绑定操作');
                return false;
            }

            // 2. 检查用户名是否已被绑定
            try {
                const checkResponse = await this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=mojang`, {
                    headers: {
                        'X-Bot-Token': this.cloudAPI.token
                    }
                });
                const data = Array.isArray(checkResponse) ? checkResponse : (checkResponse.data || []);
                if (data && data.length > 0) {
                    const binding = data[0];
                    if (binding.isBound === true) {
                        if (binding.qqNumber === e.user_id.toString()) {
                            // 如果是同步到云端的情况，返回不同的消息
                            if (binding.botId === this.cloudAPI.botId) {
                                e.reply('成功同步绑定信息到云端');
                            } else {
                                e.reply('该用户名已经绑定到你的账号了');
                            }
                        } else {
                            e.reply('该用户名已被其他QQ号绑定');
                        }
                        return false;
                    }
                }
            } catch (err) {
                // 查询失败不阻止绑定流程
                logger.error(`[MCTool] 检查用户名绑定状态失败: ${err.message}`);
            }

            // 3. 获取UUID（根据不同类型使用不同的API）
            let uuid, raw_id;
            const result = await getPlayerUUID(username);
            uuid = result.uuid;
            raw_id = result.raw_id;

            if (!uuid) {
                e.reply(`未找到该用户名，请确认是否为有效的正版用户名`);
                return false;
            }

            // 4. 云端绑定
            try {
                const bindResponse = await this.cloudAPI.request('/api/binding/bind', {
                    method: 'POST',
                    headers: {
                        'X-Bot-Token': this.cloudAPI.token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        qqNumber: e.user_id.toString(),
                        bindType: 'mojang',
                        uuid: raw_id,
                        username: username
                    })
                });
                const responseData = bindResponse.data || {};

                // 5. 同步到本地作为备份
                const bindings = Data.read('mojang_bindings') || {};
                const userIndex = Data.read('mojang_username_index') || {};

                if (!bindings[e.user_id]) {
                    bindings[e.user_id] = [];
                }

                // 检查是否已存在该用户名的绑定
                const existingBindingIndex = bindings[e.user_id].findIndex(
                    b => b.username.toLowerCase() === username.toLowerCase()
                );

                const now = new Date().toISOString();
                const bindingData = {
                    username: username,
                    uuid: uuid,
                    raw_uuid: raw_id,
                    createTime: responseData.createTime || now,
                    updateTime: responseData.updateTime || now,
                    isBound: true,
                    type: 'mojang'
                };

                if (existingBindingIndex !== -1) {
                    // 更新现有绑定
                    bindings[e.user_id][existingBindingIndex] = bindingData;
                } else {
                    // 添加新绑定
                    bindings[e.user_id].push(bindingData);
                }

                userIndex[username.toLowerCase()] = e.user_id;

                Data.write(`mojang_bindings`, bindings);
                Data.write(`mojang_username_index`, userIndex);

                e.reply(`绑定成功\n类型：mojang\n用户名：${username}\nUUID：${uuid}`);
                return true;
            } catch (err) {
                if (err.message.includes('已被绑定')) {
                    e.reply('该用户名已被其他QQ号绑定');
                    return false;
                }
                throw err;
            }
        } catch (error) {
            logger.error(`[MCTool] 绑定失败: ${error.message}`);
            e.reply(`绑定失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 解绑用户
     * @param {*} e 消息事件
     */
    async unbindUser(e) {
        const match = e.msg.match(/^#?[Mm][Cc]解绑\s+(mojang|littleskin)\s+(.+)$/);
        const bindType = match[1].toLowerCase();
        const username = match[2].trim();

        logger.info(`[MCTool] 触发解绑命令: #mc解绑 ${bindType} ${username}`);
        logger.info(`[MCTool] 云端API状态: ${this.cloudAvailable ? '可用' : '不可用'}`);

        // 1. 获取本地数据
        const bindings = Data.read(`${bindType}_bindings`) || {};
        const userIndex = Data.read(`${bindType}_username_index`) || {};
        const boundQQ = userIndex[username.toLowerCase()];

        // 2. 验证本地绑定状态
        if (!boundQQ) {
            e.reply('该用户名未绑定到任何QQ号');
            return false;
        }

        const userBindings = bindings[boundQQ];
        if (!userBindings) {
            e.reply('该用户名未绑定到任何QQ号');
            return false;
        }

        // 查找绑定记录，确保只查找isBound为true或未设置isBound的记录
        const bindingIndex = userBindings.findIndex(b => 
            b.username.toLowerCase() === username.toLowerCase() && 
            (b.isBound === true || b.isBound === undefined)
        );

        if (bindingIndex === -1) {
            e.reply('该用户名未绑定到任何QQ号');
            return false;
        }

        if (boundQQ !== e.user_id.toString()) {
            e.reply('该用户名未绑定到你的账号');
            return false;
        }

        // 3. 更新本地数据
        const now = new Date().toISOString();
        userBindings[bindingIndex].isBound = false;
        userBindings[bindingIndex].updateTime = now;
        delete userIndex[username.toLowerCase()];

        // 保存更新后的数据
        Data.write(`${bindType}_bindings`, bindings);
        Data.write(`${bindType}_username_index`, userIndex);

        // 4. 如果云端可用,执行云端解绑
        if (this.cloudAvailable) {
            try {
                await this.cloudAPI.request('/api/binding/unbind', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        qqNumber: e.user_id.toString(),
                        bindType: bindType,
                        username: username
                    })
                });
                logger.info(`[MCTool] 云端解绑成功: ${username}`);
                e.reply(`解绑成功\n用户名：${username}`);
            } catch (err) {
                logger.error(`[MCTool] 云端解绑失败: ${err.message}`);
                e.reply(`解绑成功，但云端同步失败，将在云端恢复后自动同步\n用户名：${username}`);
            }
        } else {
            e.reply(`解绑成功\n用户名：${username}`);
        }

        return true;
    }

    /**
     * 获取用户信息
     * @param {*} e 消息事件
     */
    async getUserInfo(e) {
        logger.info(`[MCTool] 触发用户信息命令: ${e.msg}`);
        try {
            // 1. 初始化云端API
            await this.initCloud();
            
            let userBindings = [];
            let isCloudData = false;

            // 2. 尝试从云端获取数据
            if (this.cloudAvailable) {
                try {
                    logger.info(`[MCTool] 发送用户绑定查询请求: qqNumber=${e.user_id}, bindType=mojang`);
                    // 获取 Mojang 绑定（目前只支持 Mojang）
                    const response = await this.cloudAPI.request(`/api/binding/query?qqNumber=${e.user_id}&bindType=mojang`, {
                        headers: {
                            'X-Bot-Token': this.cloudAPI.token
                        }
                    });
                    logger.info(`[MCTool] 收到查询响应: ${JSON.stringify(response)}`);

                    // 处理直接返回数组的情况
                    const data = Array.isArray(response) ? response : (response.data || []);
                    // 过滤掉已解绑的数据
                    userBindings = data.filter(binding => binding.isBound === true);
                    isCloudData = true;
                    logger.info(`[MCTool] 获取到 ${userBindings.length} 个有效绑定`);
                } catch (err) {
                    logger.error(`[MCTool] 云端查询失败: ${err.message}`);
                    e.reply('云端服务暂时不可用，将使用本地备份数据');
                }
            }

            // 3. 如果云端不可用，使用本地备份
            if (!isCloudData) {
                const bindings = Data.read('mojang_bindings') || {};
                userBindings = bindings[e.user_id] || [];
            }

            if (!userBindings || userBindings.length === 0) {
                e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 mojang <正版用户名> 进行绑定');
                return false;
            }

            // 获取配置
            const config = getConfig();
            const use3D = config.skin?.use3D ?? false;
            const renderType = config.skin?.renderType ?? 1;

            let use2DFallback = false;  // 标记是否需要切换到2D渲染
            let renderError = '';  // 记录渲染错误信息
            let render3DServer = ''; // 存储实际使用的3D渲染服务器

            // 如果启用了3D渲染，先检查服务是否在线
            if (use3D) {
                if (renderType === 1) {
                    // 渲染方案一：行走视图
                    await e.reply('正在生成3D渲染图像，请耐心等待...');
                } else {
                    // 渲染方案二：站立视图
                    const server = config.skin?.render2?.server || 'http://skin.qxml.ltd';
                    const endpoint = config.skin?.render2?.endpoint || '/render';
                    render3DServer = server;
                    logger.info(`[MCTool] 检查3D渲染服务状态: ${server}`);
                    
                    try {
                        // 检查渲染服务是否在线
                        const healthResponse = await fetch(`${server}/health`);
                        const healthData = await healthResponse.json();
                        
                        if (!healthResponse.ok || healthData?.status !== 'ok') {
                            use2DFallback = true;
                            renderError = '渲染服务状态异常';
                            logger.info(`[MCTool] 3D渲染服务状态异常: ${JSON.stringify(healthData)}`);
                        } else {
                            // 只在服务正常时发送一次渲染提示
                            await e.reply('正在生成3D渲染图像，请耐心等待...');
                            logger.info(`[MCTool] 3D渲染服务正常，使用服务器: ${server}`);
                        }
                    } catch (error) {
                        use2DFallback = true;
                        renderError = error.message;
                        logger.error(`[MCTool] 3D渲染服务检查失败: ${error.message}`);
                    }

                    // 如果需要切换到2D渲染，发送一次提示
                    if (use2DFallback) {
                        await e.reply(`3D渲染服务异常: ${renderError}，已切换至2D渲染`);
                    }
                }
            }

            // 处理每个绑定账号
            const accounts = await Promise.all(userBindings.map(async (binding) => {
                try {
                    let skinUrl;
                    // 确保有正确格式的 UUID
                    const formattedUUID = binding.uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

                    if (use3D && !use2DFallback) {
                        if (renderType === 1) {
                            // 渲染方案一：行走视图
                            const server = config.skin?.render1?.server || 'https://skin2.qxml.ltd';
                            const definition = config.skin?.render1?.definition || 1.5;
                            const transparent = config.skin?.render1?.transparent ?? true;
                            
                            const render3DUrl = `${server}/mojang/image/both?name=${binding.username}&definition=${definition}&transparent=${transparent}`;
                            logger.info(`[MCTool] 尝试3D渲染，URL: ${render3DUrl}`);
                            
                            try {
                                // 添加60秒超时
                                const response = await Promise.race([
                                    fetch(render3DUrl),
                                    new Promise((_, reject) => 
                                        setTimeout(() => reject(new Error('3D渲染超时（60秒）')), 60000)
                                    )
                                ]);
                                
                                if (response.ok) {
                                    logger.info(`[MCTool] 3D渲染成功: ${binding.username}`);
                                    skinUrl = [render3DUrl];
                                } else {
                                    throw new Error(`3D渲染服务返回错误: ${response.status}`);
                                }
                            } catch (error) {
                                logger.info(`[MCTool] 3D渲染失败，使用2D渲染: ${error.message}`);
                                skinUrl = [`https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`];
                            }
                        } else {
                            // 渲染方案二：站立视图
                            const server = render3DServer;  // 使用之前检查过的服务器
                            const endpoint = config.skin?.render2?.endpoint || '/render';
                            const width = config.skin?.render2?.width || 300;
                            const height = config.skin?.render2?.height || 600;
                            
                            try {
                                // 第一个角度的渲染URL（正面135度）
                                const render3DUrl1 = `${server}${endpoint}?uuid=${binding.raw_uuid}&width=${width}&height=${height}&angle=135&angleY=38`;
                                // 第二个角度的渲染URL（背面315度）
                                const render3DUrl2 = `${server}${endpoint}?uuid=${binding.raw_uuid}&width=${width}&height=${height}&angle=315&angleY=38`;

                                logger.info(`[MCTool] 尝试3D渲染，URL1: ${render3DUrl1}`);
                                logger.info(`[MCTool] 尝试3D渲染，URL2: ${render3DUrl2}`);

                                // 并行请求两个渲染
                                const [response1, response2] = await Promise.race([
                                    Promise.all([
                                        fetch(render3DUrl1),
                                        fetch(render3DUrl2)
                                    ]),
                                    new Promise((_, reject) => 
                                        setTimeout(() => reject(new Error('3D渲染超时，可能是皮肤过多')), 60000)
                                    )
                                ]);
                                
                                if (response1.ok && response2.ok) {
                                    logger.info(`[MCTool] 3D渲染成功: ${binding.username}`);
                                    skinUrl = [render3DUrl1, render3DUrl2];
                                } else {
                                    throw new Error(`3D渲染服务返回错误: ${response1.status}, ${response2.status}`);
                                }
                            } catch (error) {
                                logger.info(`[MCTool] 3D渲染失败，使用2D渲染: ${error.message}`);
                                skinUrl = [`https://api.mineatar.io/body/full/${formattedUUID}?scale=8`];
                            }
                        }
                    } else {
                        skinUrl = [`https://api.mineatar.io/body/full/${formattedUUID}?scale=8`];
                    }
                    const avatarUrl = `https://api.mineatar.io/face/${formattedUUID}`;
                    return {
                        ...binding,
                        skinUrl: Array.isArray(skinUrl) ? skinUrl : [skinUrl],
                        avatarUrl,
                        bindTime: new Date(binding.createTime).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        })
                    };
                } catch (error) {
                    logger.info(`[MCTool] 处理账号 ${binding.username} 失败: ${error.message}`);
                    return {
                        ...binding,
                        skinUrl: [`https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`],
                        avatarUrl: `https://api.mineatar.io/face/${binding.raw_uuid}`,
                        bindTime: new Date(binding.createTime).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        })
                    };
                }
            }));

            // 计算合适的视口高度和宽度
            const headerHeight = 60;   // 头部高度
            const accountHeight = 180;  // 账号卡片高度（减小）
            const footerHeight = 30;   // 底部高度（减小）
            const spacing = 10;        // 间距
            const rowCount = Math.ceil(accounts.length / 2);  // 计算行数
            const totalHeight = headerHeight + (rowCount * (accountHeight + spacing)) + footerHeight;
            
            // 根据账号数量动态设置宽度
            const viewportWidth = accounts.length === 1 ? 430 : 800;  // 单账号使用较窄的宽度

            // 渲染HTML
            const data = {
                qq: e.user_id,
                nickname: e.sender.card || e.sender.nickname,
                accounts: accounts
            };

            // 使用puppeteer渲染HTML
            const htmlPath = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'resources', 'html', 'mc-info.html');
            const browser = await puppeteer.browserInit();
            const page = await browser.newPage();
            
            // 设置视口大小
            await page.setViewport({
                width: viewportWidth,
                height: totalHeight
            });

            // 读取HTML模板并替换内容
            let template = fs.readFileSync(htmlPath, 'utf8');

            // 替换模板中的变量
            template = template
                .replace(/{{nickname}}/g, data.nickname)
                .replace(/{{qq}}/g, data.qq)
                .replace(/{{each accounts account}}[\s\S]*{{\/each}}/g, accounts.map(account => `
                    <div class="account">
                        <div class="account-header">
                            <img class="account-avatar" src="${account.avatarUrl}" alt="Avatar" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
                            <div class="account-info">
                                <div class="account-username">${account.username}</div>
                                <div class="account-details">
                                    <div>UUID: ${account.uuid}</div>
                                    <div>绑定时间: ${account.createTime}</div>
                                </div>
                            </div>
                        </div>
                        <div class="skin-preview ${Array.isArray(account.skinUrl) && account.skinUrl.length === 1 ? 'single-view' : ''}">
                            ${Array.isArray(account.skinUrl) ? account.skinUrl.map(url => `<img src="${url}" alt="Skin" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">`).join('') : `<img src="${account.skinUrl}" alt="Skin" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">`}
                        </div>
                    </div>
                `).join(''))
                .replace(/{{accounts\.length === 1 \? 'single-account' : ''}}/g, accounts.length === 1 ? 'single-account' : '');

            await page.setContent(template);

            // 确保临时目录存在
            const tempDir = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // 截图
            const screenshotPath = path.join(tempDir, `${e.user_id}_mc_info.png`);
            try {
                await page.screenshot({
                    path: screenshotPath,
                    fullPage: true
                });
            } catch (error) {
                logger.error(`[MCTool] 截图失败: ${error.message}`);
                throw error;
            } finally {
                await browser.close();
            }

            // 发送图片
            try {
                await e.reply(segment.image(`file:///${screenshotPath}`));
            } finally {
                // 删除临时文件
                if (fs.existsSync(screenshotPath)) {
                    fs.unlinkSync(screenshotPath);
                }
                // 清理3D渲染的临时文件
                if (this._tempFiles) {
                    for (const file of this._tempFiles) {
                        if (fs.existsSync(file)) {
                            try {
                                fs.unlinkSync(file);
                            } catch (error) {
                                logger.error(`[MCTool] 删除临时文件失败: ${error.message}`);
                            }
                        }
                    }
                    this._tempFiles.clear();
                }
            }

            // 在发送结果时添加数据来源提示
            if (isCloudData) {
                e.reply('数据来源：云端同步');
            } else {
                e.reply('数据来源：本地存储');
            }

            return true;
        } catch (error) {
            logger.error(`[MCTool] 获取用户信息失败: ${error.message}`);
            e.reply(`获取用户信息失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 查询用户的UUID
     * @param {*} e 消息事件
     */
    async queryUUID(e) {
        const username = e.msg.match(/^#?[Mm][Cc](?:uuid|uid|id)(?:\s+(.+))?$/)[1]?.trim();

        try {
            // 1. 初始化云端API
            await this.initCloud();
            
            // 2. 如果没有指定用户名，查询用户自己的绑定账号
            if (!username) {
                if (!this.cloudAvailable) {
                    // 从本地读取数据
                    const localBindings = Data.read('mojang_bindings', {});
                    const littleSkinBindings = Data.read('littleskin_bindings', {});
                    
                    const userMojangBindings = localBindings[e.user_id] || [];
                    const userLittleSkinBindings = littleSkinBindings[e.user_id] || [];

                    if (userMojangBindings.length === 0 && userLittleSkinBindings.length === 0) {
                        e.reply('你还没有绑定任何Minecraft账号');
                        return false;
                    }

                    // 返回所有绑定账号的信息
                    const msg = ['你的绑定账号UUID如下：'];

                    if (userMojangBindings.length > 0) {
                        msg.push('\n== Mojang正版账号 ==');
                        for (const binding of userMojangBindings) {
                            msg.push(`用户名：${binding.username}`, `UUID：${binding.uuid}`);
                        }
                    }

                    if (userLittleSkinBindings.length > 0) {
                        msg.push('\n== LittleSkin账号 ==');
                        for (const binding of userLittleSkinBindings) {
                            msg.push(`用户名：${binding.username}`, `UUID：${binding.uuid}`);
                        }
                    }

                    e.reply(msg.join('\n'));
                    return true;
                }

                try {
                    logger.info(`[MCTool] 查询用户绑定的UUID: ${e.user_id}`);
                    // 查询Mojang和LittleSkin的绑定
                    const [mojangResponse, littleSkinResponse] = await Promise.all([
                        this.cloudAPI.request(`/api/binding/query?qqNumber=${e.user_id}&bindType=mojang`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        }),
                        this.cloudAPI.request(`/api/binding/query?qqNumber=${e.user_id}&bindType=littleskin`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        })
                    ]);

                    const mojangData = Array.isArray(mojangResponse) ? mojangResponse : (mojangResponse.data || []);
                    const littleSkinData = Array.isArray(littleSkinResponse) ? littleSkinResponse : (littleSkinResponse.data || []);
                    
                    const mojangBindings = mojangData.filter(b => b.isBound === true);
                    const littleSkinBindings = littleSkinData.filter(b => b.isBound === true);

                    if (mojangBindings.length === 0 && littleSkinBindings.length === 0) {
                        e.reply('你还没有绑定任何Minecraft账号');
                        return false;
                    }

                    // 返回所有绑定账号的信息
                    const msg = ['你的绑定账号UUID如下：'];

                    if (mojangBindings.length > 0) {
                        msg.push('\n== Mojang正版账号 ==');
                        for (const binding of mojangBindings) {
                            msg.push(`用户名：${binding.username}`, `UUID：${binding.uuid}`);
                        }
                    }

                    if (littleSkinBindings.length > 0) {
                        msg.push('\n== LittleSkin账号 ==');
                        for (const binding of littleSkinBindings) {
                            msg.push(`用户名：${binding.username}`, `UUID：${binding.uuid}`);
                        }
                    }

                    e.reply(msg.join('\n'));
                    return true;
                } catch (err) {
                    logger.error(`[MCTool] 查询绑定UUID失败: ${err.message}`);
                    e.reply('查询绑定UUID失败，请稍后重试');
                    return false;
                }
            }

            // 3. 如果指定了用户名，优先从云端获取，云端不可用时从本地获取
            let uuid = null;
            let source = '';
            let bindType = '';

            if (this.cloudAvailable) {
                try {
                    logger.info(`[MCTool] 从云端查询UUID: ${username}`);
                    // 同时查询Mojang和LittleSkin绑定
                    const [mojangResponse, littleSkinResponse] = await Promise.all([
                        this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=mojang`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        }),
                        this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=littleskin`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        })
                    ]);

                    const mojangData = Array.isArray(mojangResponse) ? mojangResponse : (mojangResponse.data || []);
                    const littleSkinData = Array.isArray(littleSkinResponse) ? littleSkinResponse : (littleSkinResponse.data || []);
                    
                    const mojangBinding = mojangData.find(b => b.isBound === true);
                    const littleSkinBinding = littleSkinData.find(b => b.isBound === true);
                    
                    if (mojangBinding) {
                        uuid = mojangBinding.uuid;
                        source = '云端数据 (Mojang)';
                        bindType = 'mojang';
                        logger.info(`[MCTool] 从云端获取到Mojang UUID: ${uuid}`);
                    } else if (littleSkinBinding) {
                        uuid = littleSkinBinding.uuid;
                        source = '云端数据 (LittleSkin)';
                        bindType = 'littleskin';
                        logger.info(`[MCTool] 从云端获取到LittleSkin UUID: ${uuid}`);
                    }
                } catch (err) {
                    logger.error(`[MCTool] 云端查询失败: ${err.message}`);
                }
            }

            // 4. 如果云端没有找到，从本地查找
            if (!uuid) {
                logger.info(`[MCTool] 从本地查询UUID: ${username}`);
                const mojangIndex = Data.read('mojang_username_index', {});
                const littleSkinIndex = Data.read('littleskin_username_index', {});
                
                const lowerUsername = username.toLowerCase();
                let qqNumber = mojangIndex[lowerUsername] || littleSkinIndex[lowerUsername];
                
                if (qqNumber) {
                    const mojangBindings = Data.read('mojang_bindings', {});
                    const littleSkinBindings = Data.read('littleskin_bindings', {});
                    
                    const mojangBinding = mojangBindings[qqNumber]?.find(b => b.username.toLowerCase() === lowerUsername);
                    const littleSkinBinding = littleSkinBindings[qqNumber]?.find(b => b.username.toLowerCase() === lowerUsername);
                    
                    if (mojangBinding) {
                        uuid = mojangBinding.uuid;
                        source = '本地数据 (Mojang)';
                        bindType = 'mojang';
                        logger.info(`[MCTool] 从本地获取到Mojang UUID: ${uuid}`);
                    } else if (littleSkinBinding) {
                        uuid = littleSkinBinding.uuid;
                        source = '本地数据 (LittleSkin)';
                        bindType = 'littleskin';
                        logger.info(`[MCTool] 从本地获取到LittleSkin UUID: ${uuid}`);
                    }
                }
            }

            // 5. 返回结果
            if (uuid) {
                const msg = [
                    `用户名：${username}`,
                    `UUID：${uuid}`,
                    `类型：${bindType === 'mojang' ? 'Mojang正版' : 'LittleSkin'}`,
                    `数据来源：${source}`
                ];
                
                e.reply(msg.join('\n'));
                return true;
            } else {
                if (!this.cloudAvailable) {
                    e.reply('云端连接失败，本机器人无该账号数据');
                } else {
                    e.reply('未找到该用户名的UUID');
                }
                return false;
            }

        } catch (error) {
            logger.error(`[MCTool] 查询UUID失败: ${error.message}`);
            e.reply(`查询UUID失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 渲染皮肤
     * @param {*} e 消息事件
     */
    async renderSkin(e) {
        try {
            // 读取渲染时间记录
            const renderTimeData = Data.read('render_limits') || {};
            const now = Date.now();
            const lastTime = renderTimeData[e.user_id] || 0;
            const cooldown = 60 * 60 * 1000; // 1小时的冷却时间（毫秒）

            // 检查是否在冷却时间内
            if (now - lastTime < cooldown) {
                const remainingTime = Math.ceil((cooldown - (now - lastTime)) / 1000 / 60); // 剩余分钟
                e.reply(`因服务器负载过高，该功能每小时只能使用一次，请在${remainingTime}分钟后再试`);
                return false;
            }

            // 1. 初始化云端API
            await this.initCloud();

            // 2. 获取用户绑定数据
            let userBindings = [];
            if (this.cloudAvailable) {
                try {
                    const response = await this.cloudAPI.request(`/api/binding/query?qqNumber=${e.user_id}&bindType=mojang`, {
                        headers: {
                            'X-Bot-Token': this.cloudAPI.token
                        }
                    });
                    const data = Array.isArray(response) ? response : (response.data || []);
                    userBindings = data.filter(b => b.isBound === true);
                } catch (err) {
                    logger.error(`[MCTool] 云端查询失败: ${err.message}`);
                    // 如果云端查询失败，使用本地数据
                    const bindings = Data.read('mojang_bindings') || {};
                    userBindings = bindings[e.user_id] || [];
                }
            } else {
                // 如果云端不可用，使用本地数据
                const bindings = Data.read('mojang_bindings') || {};
                userBindings = bindings[e.user_id] || [];
            }

            if (!userBindings || userBindings.length === 0) {
                e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 mojang <正版用户名> 进行绑定');
                return false;
            }

            // 立即更新并保存渲染时间记录，防止用户在渲染过程中重复发送命令
            renderTimeData[e.user_id] = now;
            Data.write('render_limits', renderTimeData);

            // 获取配置
            const config = getConfig();
            const server = config.skin?.render1?.server || 'https://skin2.qxml.ltd';
            const definition = 3.5;
            const transparent = true;

            await e.reply('正在生成皮肤渲染图像，请耐心等待...');

            // 处理每个绑定账号
            const renderPromises = userBindings.map(async (binding) => {
                try {
                    const render3DUrl = `${server}/mojang/image/both?name=${binding.username}&definition=${definition}&transparent=${transparent}`;
                    logger.info(`[MCTool] 尝试渲染皮肤，URL: ${render3DUrl}`);
                    
                    const response = await fetch(render3DUrl);
                    if (!response.ok) {
                        throw new Error(`渲染服务返回错误: ${response.status}`);
                    }

                    // 发送渲染结果
                    await e.reply(segment.image(render3DUrl));
                    logger.info(`[MCTool] 皮肤渲染成功: ${binding.username}`);
                } catch (error) {
                    logger.error(`[MCTool] 皮肤渲染失败: ${error.message}`);
                    await e.reply(`皮肤渲染失败: ${error.message}`);
                    return false;
                }
            });

            // 等待所有渲染完成
            await Promise.all(renderPromises);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 皮肤渲染失败: ${error.message}`);
            e.reply('皮肤渲染失败，请稍后重试');
            return false;
        }
    }

    /**
     * 查询用户名的绑定信息
     * @param {*} e 消息事件
     */
    async queryBinding(e) {
        logger.info(`[MCTool] 触发查询绑定命令: ${e.msg}`);
        const match = e.msg.match(/^#?[Mm][Cc]查询绑定\s+(mojang|littleskin)\s+(.+)$/);
        const bindType = match[1].toLowerCase();
        const username = match[2].trim();

        if (!username) {
            e.reply('请提供要查询的用户名');
            return false;
        }

        try {
            // 1. 初始化云端API
            await this.initCloud();
            if (!this.cloudAvailable) {
                e.reply('云端服务不可用，暂时无法进行查询');
                return false;
            }

            // 2. 查询绑定信息
            try {
                logger.info(`[MCTool] 发送查询请求: username=${username}, bindType=${bindType}`);
                const response = await this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=${bindType}`, {
                    headers: {
                        'X-Bot-Token': this.cloudAPI.token
                    }
                });
                logger.info(`[MCTool] 收到查询响应: ${JSON.stringify(response)}`);

                // 处理直接返回数组的情况
                const data = Array.isArray(response) ? response : (response.data || []);

                if (!data || data.length === 0) {
                    e.reply(`未找到该用户名的 ${bindType === 'mojang' ? 'Mojang 正版' : 'LittleSkin'} 绑定信息`);
                    return false;
                }

                const binding = data[0];
                if (binding.isBound !== true) {
                    e.reply(`该用户名曾经绑定过但已被解绑`);
                    return false;
                }

                // 处理QQ号显示格式（保留前3位和最后2位）
                const formatQQ = (qq) => {
                    if (qq.length <= 5) return qq;
                    return `${qq.slice(0, 3)}****${qq.slice(-2)}`;
                };

                // 生成回复消息
                let msg = [
                    `用户名 ${username} 的绑定信息：`,
                    '',
                    `== ${bindType === 'mojang' ? 'Mojang 正版' : 'LittleSkin'} 绑定 ==`,
                    `绑定QQ：${formatQQ(binding.qqNumber)}`,
                    `UUID：${binding.uuid}`,
                    `Bot ID：${binding.botId}`,
                    `绑定时间：${new Date(binding.createTime).toLocaleString('zh-CN')}`
                ];

                e.reply(msg.join('\n'));
                return true;
            } catch (err) {
                logger.error(`[MCTool] 查询绑定信息失败: ${err.message}`);
                throw err;
            }
        } catch (error) {
            logger.error(`[MCTool] 查询失败: ${error.message}`);
            e.reply(`查询失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 生成玩家头像
     * @param {*} e 消息事件
     */
    async generateAvatar(e) {
        try {
            const type = e.msg.match(/^#?[Mm][Cc]头像\s*(全身|半身|头部)?/)[1] || '头部';
            const username = e.msg.match(/^#?[Mm][Cc]头像\s*(全身|半身|头部)?\s*(.+)?$/)?.[2]?.trim();

            // 获取要处理的用户列表
            let users = [];
            if (username) {
                // 如果指定了用户名，直接使用
                users.push({ username });
            } else {
                // 初始化云端API
                await this.initCloud();
                
                // 优先使用云端数据
                if (this.cloudAvailable) {
                    try {
                        const response = await this.cloudAPI.request(`/api/binding/query?qqNumber=${e.user_id}&bindType=mojang`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        });
                        const data = Array.isArray(response) ? response : (response.data || []);
                        users = data.filter(b => b.isBound === true);
                    } catch (err) {
                        logger.error(`[MCTool] 云端查询失败: ${err.message}`);
                        // 云端查询失败时，使用本地数据
                        const bindings = Data.read('mojang_bindings') || {};
                        users = bindings[e.user_id] || [];
                    }
                } else {
                    // 云端不可用时，使用本地数据
                    const bindings = Data.read('mojang_bindings') || {};
                    users = bindings[e.user_id] || [];
                }

                if (!users || users.length === 0) {
                    e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 mojang <正版用户名> 进行绑定');
                    return false;
                }
            }

            // 转换类型为API参数
            const avatarType = {
                '全身': 'full',
                '头部': 'head',
                '半身': 'big_head'
            }[type];

            let hasError = false;
            // 处理每个用户
            for (const user of users) {
                try {
                    logger.info(`[MCTool] 正在生成 ${user.username} 的${type}图像...`);
                    
                    // 构建请求URL
                    const url = `https://mcacg.qxml.ltd/generate/account?player=${encodeURIComponent(user.username)}&avatar_type=${encodeURIComponent(avatarType)}`;
                    logger.info(`[MCTool] 发送请求: ${url}`);

                    // 发送生成请求
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });

                    // 记录响应状态
                    logger.info(`[MCTool] API响应状态: ${response.status} ${response.statusText}`);

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => '无法获取错误详情');
                        logger.error(`[MCTool] API错误响应: ${errorText}`);
                        throw new Error(`生成失败: ${response.status} ${response.statusText}`);
                    }

                    const result = await response.json();
                    logger.info(`[MCTool] API响应数据: ${JSON.stringify(result)}`);

                    if (!result.success) {
                        throw new Error(result.message || '生成失败: API返回失败状态');
                    }

                    if (!result.data?.image) {
                        throw new Error('生成失败: API返回数据缺少图片信息');
                    }

                    // 将Base64转换为图片并发送
                    const base64Data = result.data.image;
                    // 检查base64数据是否有效
                    if (!base64Data.match(/^[A-Za-z0-9+/=]+$/)) {
                        throw new Error('生成失败: 无效的图片数据');
                    }

                    const imageData = Buffer.from(base64Data, 'base64');
                    if (imageData.length === 0) {
                        throw new Error('生成失败: 图片数据为空');
                    }

                    // 确保临时目录存在
                    const tempDir = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'temp');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }

                    // 保存为临时文件
                    const tempFile = path.join(tempDir, `${user.username}_${type}_${Date.now()}.png`);
                    fs.writeFileSync(tempFile, imageData);

                    // 检查生成的文件
                    const fileStats = fs.statSync(tempFile);
                    if (fileStats.size === 0) {
                        throw new Error('生成失败: 生成的图片文件为空');
                    }

                    logger.info(`[MCTool] 成功生成图片: ${tempFile} (${fileStats.size} 字节)`);

                    // 发送图片
                    await e.reply([
                        `${user.username} 的${type}图像：\n`,
                        segment.image(`file:///${tempFile}`)
                    ]);

                    // 删除临时文件
                    fs.unlinkSync(tempFile);
                } catch (error) {
                    hasError = true;
                    logger.error(`[MCTool] 生成 ${user.username} 的头像失败:`, error);
                    // 不再立即发送错误消息，而是继续处理其他用户
                    continue;
                }
            }

            // 如果所有用户都处理失败，才发送一次错误消息
            if (hasError && users.length === 1) {
                e.reply('获取头像失败，请稍后重试');
            }

            return true;
        } catch (error) {
            logger.error('[MCTool] 生成头像失败:', error);
            e.reply('生成头像失败，请稍后重试');
            return false;
        }
    }

    /**
     * 绑定LittleSkin账号
     * @param {*} e 消息事件
     */
    async bindLittleSkin(e) {
        logger.info(`[MCTool] 触发LittleSkin绑定命令: ${e.msg}`);
        
        try {
            // 1. 初始化云端API
            await this.initCloud();
            logger.info(`[MCTool] 云端API状态: ${this.cloudAvailable ? '可用' : '不可用'}`);

            // 2. 请求设备代码
            const deviceCodeResponse = await fetch('https://open.littleskin.cn/oauth/device_code', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: '940',
                    scope: 'openid offline_access User.Read Player.Read Closet.Read PremiumVerification.Read Yggdrasil.PlayerProfiles.Read'
                })
            });

            if (!deviceCodeResponse.ok) {
                const error = await deviceCodeResponse.json();
                throw new Error(`设备代码请求失败: ${error.error_description || error.message || '未知错误'}`);
            }

            const deviceData = await deviceCodeResponse.json();
            const { user_code, device_code, verification_uri_complete } = deviceData;

            // 3. 向用户发送授权链接
            let authMsg;
            try {
                const msgContent = [
                    segment.at(e.user_id),
                    '\n请在2分钟内完成LittleSkin账号授权：\n',
                    '1. 确认当前浏览器中已登陆LittleSkin账号\n',
                    `2. 点击链接: ${verification_uri_complete}\n`,
                    '3. 请在页面中点击确认授权\n',
                    '\n',
                    '授权码：' + user_code + '\n',
                    '\n',
                    '机器人承诺不本地保存token，请勿点击他人授权链接'
                ];

                authMsg = await e.reply(msgContent);

                // 保存消息ID用于后续撤回
                if (authMsg && authMsg.message_id) {
                    logger.debug(`[MCTool] 授权消息ID: ${authMsg.message_id}`);
                }
            } catch (err) {
                logger.error(`[MCTool] 发送授权消息失败: ${err.message}`);
                throw new Error('发送授权消息失败，请重试');
            }

            // 设置30秒后自动撤回的定时器
            let autoRecallTimer;
            if (authMsg && authMsg.message_id && e.group) {
                autoRecallTimer = setTimeout(async () => {
                    try {
                        await e.group.recallMsg(authMsg.message_id);
                        logger.debug(`[MCTool] 自动撤回授权消息成功`);
                    } catch (err) {
                        logger.error(`[MCTool] 自动撤回授权消息失败: ${err.message}`);
                    }
                }, 30000);
            }

            // 4. 轮询授权结果
            let token = null;
            const startTime = Date.now();
            const timeout = 2 * 60 * 1000; // 2分钟超时

            while (Date.now() - startTime < timeout) {
                try {
                    const tokenResponse = await fetch('https://open.littleskin.cn/oauth/token', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams({
                            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                            client_id: '940',
                            device_code: device_code
                        })
                    });

                    const responseData = await tokenResponse.json();
                    
                    if (responseData.access_token) {
                        token = responseData;
                        // 授权成功，清除定时器
                        if (autoRecallTimer) {
                            clearTimeout(autoRecallTimer);
                        }
                        // 立即尝试撤回授权消息
                        if (authMsg && authMsg.message_id && e.group) {
                            try {
                                await e.group.recallMsg(authMsg.message_id);
                                logger.debug(`[MCTool] 授权成功后撤回消息成功`);
                            } catch (err) {
                                logger.error(`[MCTool] 授权成功后撤回消息失败: ${err.message}`);
                            }
                        }
                        // 添加授权成功的即时提示
                        await e.reply([
                            segment.at(e.user_id),
                            'LittleSkin 授权成功！正在获取角色信息...'
                        ]);
                        break;
                    }

                    if (responseData.error === 'authorization_pending' || responseData.error === 'slow_down') {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }

                    if (responseData.error === 'expired_token') {
                        throw new Error('授权已过期，请重新尝试绑定操作');
                    }

                    if (responseData.error === 'access_denied') {
                        throw new Error('授权被拒绝');
                    }

                    throw new Error(responseData.error_description || responseData.message || '授权失败');
                } catch (error) {
                    if (error.message.includes('authorization_pending') || error.message.includes('slow_down')) {
                        continue;
                    }
                    throw error;
                }
            }

            if (!token) {
                throw new Error('授权超时，请重新尝试绑定操作');
            }

            // 5. 获取用户角色信息
            logger.info(`[MCTool] 开始获取用户角色信息...`);
            let profiles;
            try {
                const profileResponse = await fetch('https://littleskin.cn/api/players', {
                    headers: {
                        'Authorization': `Bearer ${token.access_token}`,
                        'Accept': 'application/json'
                    }
                });

                if (!profileResponse.ok) {
                    if (profileResponse.status === 401) {
                        throw new Error('访问令牌无效');
                    }
                    throw new Error('获取角色信息失败');
                }

                const profileData = await profileResponse.json();
                logger.info(`[MCTool] 成功获取角色信息`);

                if (!Array.isArray(profileData) || profileData.length === 0) {
                    throw new Error('未找到任何角色信息');
                }

                profiles = profileData.map(player => ({
                    id: player.pid.toString(),  // 使用 pid 作为 UUID
                    name: player.name,
                    properties: [{
                        name: 'textures',
                        value: JSON.stringify({
                            tid_skin: player.tid_skin,
                            tid_cape: player.tid_cape,
                            last_modified: player.last_modified,
                            uid: player.uid
                        })
                    }]
                }));

                logger.info(`[MCTool] 成功获取角色信息: ${JSON.stringify(profiles)}`);
            } catch (err) {
                logger.error(`[MCTool] 获取角色信息失败: ${err.message}`);
                throw err;
            }

            // 6. 初始化角色列表
            const newProfiles = [];
            const selfBoundProfiles = [];
            const otherBoundProfiles = [];
            const errorProfiles = [];

            // 7. 检查每个角色的绑定状态
            for (const profile of profiles) {
                try {
                    if (this.cloudAvailable) {
                        // 查询绑定状态
                        const queryResponse = await this.cloudAPI.request(`/api/binding/query?username=${profile.name}&bindType=littleskin`, {
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token
                            }
                        });

                        // 正确处理返回结果
                        if (queryResponse.code === 200 && queryResponse.data && queryResponse.data.length > 0) {
                            const binding = queryResponse.data[0];
                            if (binding.isBound) {
                                if (binding.qqNumber === e.user_id.toString()) {
                                    // 已绑定到当前QQ，跳过处理
                                    selfBoundProfiles.push(profile);
                                } else {
                                    // 已绑定到其他QQ，需要解绑后重新绑定
                                    otherBoundProfiles.push({ profile, currentQQ: binding.qqNumber });
                                }
                                continue;
                            }
                        }
                        // 未找到绑定信息或未绑定状态，可以直接绑定
                        newProfiles.push(profile);
                    } else {
                        // 云端不可用时，只检查本地数据
                        const localBindings = Data.read('littleskin_bindings') || {};
                        const localIndex = Data.read('littleskin_username_index') || {};
                        
                        const boundQQ = localIndex[profile.name.toLowerCase()];
                        if (boundQQ) {
                            const userBindings = localBindings[boundQQ] || [];
                            const binding = userBindings.find(b => b.username.toLowerCase() === profile.name.toLowerCase());
                            
                            if (binding && binding.isBound) {
                                if (boundQQ === e.user_id) {
                                    selfBoundProfiles.push(profile);
                                } else {
                                    otherBoundProfiles.push({ profile, currentQQ: boundQQ });
                                }
                                continue;
                            }
                        }
                        newProfiles.push(profile);
                    }
                } catch (err) {
                    // 如果是未找到绑定信息，这是正常情况，直接加入待绑定列表
                    if (err.message.includes('未找到绑定信息')) {
                        logger.info(`[MCTool] 角色 ${profile.name} 未找到绑定信息，将进行新绑定`);
                        newProfiles.push(profile);
                    } else if (err.message.includes('云端服务暂时不可用')) {
                        // 云端不可用时，检查本地数据
                        logger.warn(`[MCTool] 云端不可用，将使用本地数据检查角色 ${profile.name}`);
                        const localBindings = Data.read('littleskin_bindings') || {};
                        const localIndex = Data.read('littleskin_username_index') || {};
                        
                        const boundQQ = localIndex[profile.name.toLowerCase()];
                        if (boundQQ) {
                            const userBindings = localBindings[boundQQ] || [];
                            const binding = userBindings.find(b => b.username.toLowerCase() === profile.name.toLowerCase());
                            
                            if (binding && binding.isBound) {
                                if (boundQQ === e.user_id) {
                                    selfBoundProfiles.push(profile);
                                } else {
                                    otherBoundProfiles.push({ profile, currentQQ: boundQQ });
                                }
                            } else {
                                newProfiles.push(profile);
                            }
                        } else {
                            newProfiles.push(profile);
                        }
                    } else {
                        logger.error(`[MCTool] 检查角色 ${profile.name} 失败: ${err.message}`);
                        errorProfiles.push({ profile, error: err.message });
                    }
                }
            }

            // 8. 处理需要解绑的角色
            for (const { profile, currentQQ } of otherBoundProfiles) {
                try {
                    if (this.cloudAvailable) {
                        await this.cloudAPI.request('/api/binding/unbind', {
                            method: 'POST',
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                qqNumber: currentQQ,
                                bindType: 'littleskin',
                                username: profile.name
                            })
                        });
                        logger.info(`[MCTool] 角色 ${profile.name} 已从QQ ${currentQQ} 解绑`);
                        // 解绑成功后，加入待绑定列表
                        newProfiles.push(profile);
                    }
                } catch (err) {
                    logger.error(`[MCTool] 解绑角色 ${profile.name} 失败: ${err.message}`);
                    errorProfiles.push({ profile, error: `解绑失败: ${err.message}` });
                }
            }

            // 9. 处理新的绑定
            let resultMessage = `LittleSkin绑定完成\n\n`;

            // 显示已绑定的角色
            if (selfBoundProfiles.length > 0) {
                resultMessage += `已绑定到当前QQ的角色:\n`;
                selfBoundProfiles.forEach(profile => {
                    resultMessage += `${profile.name} (UUID: ${profile.id})\n`;
                });
                resultMessage += '\n';
            }

            // 处理新的绑定
            if (newProfiles.length > 0) {
                const bindResults = [];
                const now = new Date().toISOString();

                for (const profile of newProfiles) {
                    try {
                        // 先更新本地数据
                        const localBindings = Data.read('littleskin_bindings') || {};
                        const localIndex = Data.read('littleskin_username_index') || {};

                        if (!localBindings[e.user_id]) {
                            localBindings[e.user_id] = [];
                        }

                        const bindData = {
                            username: profile.name,
                            uuid: profile.id,
                            createTime: now,
                            updateTime: now,
                            type: 'littleskin',
                            skinData: profile.properties?.[0]?.value,
                            isBound: true
                        };

                        const existingIndex = localBindings[e.user_id].findIndex(
                            b => b.username.toLowerCase() === profile.name.toLowerCase()
                        );

                        if (existingIndex !== -1) {
                            localBindings[e.user_id][existingIndex] = bindData;
                        } else {
                            localBindings[e.user_id].push(bindData);
                        }

                        localIndex[profile.name.toLowerCase()] = e.user_id;

                        Data.write('littleskin_bindings', localBindings);
                        Data.write('littleskin_username_index', localIndex);

                        // 然后尝试云端绑定
                        if (this.cloudAvailable) {
                            // 先查询云端状态以确保不会覆盖更新的数据
                            const queryResponse = await this.cloudAPI.request(`/api/binding/query?username=${profile.name}&bindType=littleskin`, {
                                headers: {
                                    'X-Bot-Token': this.cloudAPI.token
                                }
                            });
                            
                            const data = Array.isArray(queryResponse) ? queryResponse : (queryResponse.data || []);
                            const cloudBinding = data[0];
                            
                            // 只有当云端没有数据，或者本地数据更新时，才进行云端绑定
                            if (!cloudBinding || 
                                (bindData.updateTime && (!cloudBinding.updateTime || new Date(bindData.updateTime) > new Date(cloudBinding.updateTime)))) {
                                const response = await this.cloudAPI.request('/api/binding/bind', {
                                    method: 'POST',
                                    headers: {
                                        'X-Bot-Token': this.cloudAPI.token,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        qqNumber: e.user_id.toString(),
                                        bindType: 'littleskin',
                                        uuid: profile.id,
                                        username: profile.name,
                                        skinData: profile.properties?.[0]?.value
                                    })
                                });

                                if (response && response.id) {
                                    logger.info(`[MCTool] 角色 ${profile.name} 绑定成功`);
                                    bindResults.push({
                                        profile,
                                        success: true,
                                        message: '绑定成功'
                                    });
                                }
                            } else {
                                // 如果云端数据更新，使用云端数据
                                bindData.updateTime = cloudBinding.updateTime;
                                bindData.skinData = cloudBinding.skinData;
                                bindResults.push({
                                    profile,
                                    success: true,
                                    message: '使用云端现有数据'
                                });
                            }
                        } else {
                            // 确保本地绑定时也设置 isBound 状态
                            bindData.isBound = true;
                            bindResults.push({
                                profile,
                                success: true,
                                message: '本地绑定成功，云端同步将在恢复后自动进行'
                            });
                        }
                    } catch (err) {
                        logger.error(`[MCTool] 绑定角色 ${profile.name} 失败: ${err.message}`);
                        bindResults.push({
                            profile,
                            success: false,
                            message: `绑定失败: ${err.message}`
                        });
                    }
                }

                // 显示绑定结果
                if (bindResults.length > 0) {
                    resultMessage += `新绑定的角色:\n`;
                    bindResults.forEach(result => {
                        if (result.success) {
                            resultMessage += `${result.profile.name} (UUID: ${result.profile.id}) - ${result.message}\n`;
                        } else {
                            resultMessage += `${result.profile.name} (UUID: ${result.profile.id}) - ${result.message}\n`;
                        }
                    });
                }

                // 保存 token 到云端
                if (this.cloudAvailable) {
                    try {
                        const saveTokenResponse = await this.cloudAPI.request('/api/littleskin/token/save', {
                            method: 'POST',
                            headers: {
                                'X-Bot-Token': this.cloudAPI.token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                botQq: this.e.bot.uin.toString(),
                                userQq: e.user_id.toString(),
                                token: token.access_token
                            })
                        });

                        if (saveTokenResponse && saveTokenResponse.id) {
                            logger.info(`[MCTool] Token保存成功，ID: ${saveTokenResponse.id}`);
                        } else {
                            logger.error(`[MCTool] Token保存失败: 响应格式不正确`);
                        }
                    } catch (err) {
                        logger.error(`[MCTool] Token保存失败: ${err.message}`);
                    }
                }
            } else {
                resultMessage += `没有需要绑定的新角色`;
            }

            // 如果云端不可用,添加提示
            if (!this.cloudAvailable) {
                resultMessage += `\n\n注意：云端服务暂时不可用，已完成本地绑定。云端同步将在服务恢复后自动进行。`;
            }

            e.reply(resultMessage);
            return true;
        } catch (error) {
            logger.error(`[MCTool] LittleSkin绑定失败: ${error.message}`);
            e.reply(`绑定失败: ${error.message}`);
            return false;
        }
    }
} 