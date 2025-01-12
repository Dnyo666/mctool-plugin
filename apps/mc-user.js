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
                    reg: '^#?[Mm][Cc]绑定\\s+(mojang|littleskin)\\s+(.+)$',
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
                }
            ]
        })

        // 初始化云端API状态
        this.cloudAPI = null;
        this.cloudAvailable = false;

        // 初始化数据存储
        this.initDataStorage();
    }

    /**
     * 初始化数据存储
     */
    initDataStorage() {
        // 确保分类数据存在
        const mojangBindings = Data.read('mojang_bindings') || {};
        const littleSkinBindings = Data.read('littleskin_bindings') || {};
        const mojangIndex = Data.read('mojang_username_index') || {};
        const littleSkinIndex = Data.read('littleskin_username_index') || {};

        // 保存初始化的数据
        Data.write('mojang_bindings', mojangBindings);
        Data.write('littleskin_bindings', littleSkinBindings);
        Data.write('mojang_username_index', mojangIndex);
        Data.write('littleskin_username_index', littleSkinIndex);

        // 删除旧数据文件
        Data.write('user_bindings', null);
        Data.write('username_index', null);
    }

    /**
     * 初始化云端API
     * @returns {Promise<boolean>} 云端API是否可用
     */
    async initCloud() {
        try {
            const { api, available } = await initCloudAPI();
            this.cloudAPI = api;
            this.cloudAvailable = available;
            
            // 如果云端可用，尝试同步本地数据到云端
            if (available) {
                await this.syncLocalToCloud();
            }
            
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
            // 同步 Mojang 绑定数据
            const mojangBindings = Data.read('mojang_bindings') || {};
            
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
            const mojangIndex = {};

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
                    logger.info(`[MCTool] 获取到云端绑定数据: ${JSON.stringify(cloudData)}`);

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

                    // 如果更新后没有任何绑定记录，删除该QQ号的记录
                    if (updatedBindings.length === 0 || updatedBindings.every(b => !b.isBound)) {
                        delete mojangBindings[qqNumber];
                    } else {
                        mojangBindings[qqNumber] = updatedBindings;
                    }
                } catch (err) {
                    logger.error(`[MCTool] 同步QQ ${qqNumber}的云端数据失败: ${err.message}`);
                }
            }

            // 保存更新后的数据
            Data.write('mojang_bindings', mojangBindings);
            Data.write('mojang_username_index', mojangIndex);

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
        const match = e.msg.match(/^#?[Mm][Cc]绑定\s+(mojang|littleskin)\s+(.+)$/);
        const bindType = match[1].toLowerCase();
        const username = match[2].trim();

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
                const checkResponse = await this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=${bindType}`, {
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
            if (bindType === 'mojang') {
                const result = await getPlayerUUID(username);
                uuid = result.uuid;
                raw_id = result.raw_id;
            } else {
                // TODO: 实现 LittleSkin 的 UUID 获取
                e.reply('LittleSkin 绑定功能正在开发中');
                return false;
            }

            if (!uuid) {
                e.reply(`未找到该用户名，请确认是否为有效的${bindType === 'mojang' ? '正版' : 'LittleSkin'}用户名`);
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
                        bindType: bindType,
                        uuid: raw_id,
                        username: username
                    })
                });
                const responseData = bindResponse.data || {};

                // 5. 同步到本地作为备份
                const bindings = Data.read(`${bindType}_bindings`) || {};
                const userIndex = Data.read(`${bindType}_username_index`) || {};

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
                    type: bindType
                };

                if (existingBindingIndex !== -1) {
                    // 更新现有绑定
                    bindings[e.user_id][existingBindingIndex] = bindingData;
                } else {
                    // 添加新绑定
                    bindings[e.user_id].push(bindingData);
                }

                userIndex[username.toLowerCase()] = e.user_id;

                Data.write(`${bindType}_bindings`, bindings);
                Data.write(`${bindType}_username_index`, userIndex);

                e.reply(`绑定成功\n类型：${bindType}\n用户名：${username}\nUUID：${uuid}`);
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
        logger.info(`[MCTool] 触发解绑命令: ${e.msg}`);
        const match = e.msg.match(/^#?[Mm][Cc]解绑\s+(mojang|littleskin)\s+(.+)$/);
        const bindType = match[1].toLowerCase();
        const username = match[2].trim();

        if (!username) {
            e.reply('请提供要解绑的用户名');
            return false;
        }

        try {
            // 1. 初始化云端API
            await this.initCloud();
            if (!this.cloudAvailable) {
                e.reply('云端服务不可用，暂时无法进行解绑操作');
                return false;
            }

            // 2. 查询云端绑定状态
            let cloudBinding;
            try {
                const response = await this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=${bindType}`, {
                    headers: {
                        'X-Bot-Token': this.cloudAPI.token
                    }
                });
                const data = Array.isArray(response) ? response : (response.data || []);
                logger.info(`[MCTool] 收到查询响应: ${JSON.stringify(data)}`);

                if (!data || data.length === 0) {
                    e.reply('该用户名未绑定到任何QQ号');
                    return false;
                }

                cloudBinding = data[0];
                if (!cloudBinding.isBound) {
                    e.reply('该用户已处于解绑状态，如需使用请重新绑定');
                    return false;
                }

                if (cloudBinding.qqNumber !== e.user_id.toString()) {
                    e.reply('该用户名未绑定到你的账号');
                    return false;
                }
            } catch (err) {
                logger.error(`[MCTool] 查询云端绑定状态失败: ${err.message}`);
                throw err;
            }

            // 3. 执行云端解绑
            try {
                const unbindResponse = await this.cloudAPI.request('/api/binding/unbind', {
                    method: 'POST',
                    headers: {
                        'X-Bot-Token': this.cloudAPI.token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        qqNumber: e.user_id.toString(),
                        bindType: bindType,
                        username: username
                    })
                });

                if (unbindResponse.code !== 200) {
                    throw new Error(unbindResponse.message || '解绑失败');
                }

                const responseData = unbindResponse.data;
                logger.info(`[MCTool] 收到解绑响应: ${JSON.stringify(responseData)}`);

                // 4. 更新本地数据
                const bindings = Data.read(`${bindType}_bindings`) || {};
                const userIndex = Data.read(`${bindType}_username_index`) || {};

                if (bindings[e.user_id]) {
                    const bindingIndex = bindings[e.user_id].findIndex(
                        b => b.username.toLowerCase() === username.toLowerCase()
                    );

                    if (bindingIndex !== -1) {
                        // 更新绑定状态
                        bindings[e.user_id][bindingIndex] = {
                            ...bindings[e.user_id][bindingIndex],
                            isBound: false,
                            createTime: responseData.createTime,
                            updateTime: responseData.updateTime
                        };

                        // 如果所有绑定都已解绑，删除整个QQ号的记录
                        if (bindings[e.user_id].every(b => !b.isBound)) {
                            delete bindings[e.user_id];
                        }
                    }
                }

                // 从索引中删除
                delete userIndex[username.toLowerCase()];

                // 保存更新后的数据
                Data.write(`${bindType}_bindings`, bindings);
                Data.write(`${bindType}_username_index`, userIndex);

                e.reply(`解绑成功\n用户名：${username}`);
                return true;
            } catch (err) {
                if (err.message.includes('未找到绑定信息')) {
                    e.reply('该用户名未绑定到你的账号');
                    return false;
                }
                if (err.message.includes('该用户已处于解绑状态')) {
                    e.reply('该用户已处于解绑状态，如需使用请重新绑定');
                    return false;
                }
                throw err;
            }
        } catch (error) {
            logger.error(`[MCTool] 解绑失败: ${error.message}`);
            e.reply(`解绑失败: ${error.message}`);
            return false;
        }
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
                                const response = await fetch(render3DUrl);
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
                        bindTime: new Date(binding.bindTime).toLocaleString('zh-CN', {
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
                        bindTime: new Date(binding.bindTime).toLocaleString('zh-CN', {
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
                                    <div>绑定时间: ${account.bindTime}</div>
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
        const username = e.msg.match(/^#?[Mm][Cc](?:uuid|uid|id)(?:\\s+(.+))?$/)[1]?.trim();

        try {
            // 1. 初始化云端API
            await this.initCloud();
            
            // 2. 如果没有指定用户名，查询用户自己的绑定账号
            if (!username) {
                if (!this.cloudAvailable) {
                    e.reply('云端服务不可用，暂时无法查询');
                    return false;
                }

                try {
                    logger.info(`[MCTool] 查询用户绑定的UUID: ${e.user_id}`);
                    const response = await this.cloudAPI.request(`/api/binding/query?qqNumber=${e.user_id}&bindType=mojang`, {
                        headers: {
                            'X-Bot-Token': this.cloudAPI.token
                        }
                    });
                    const data = Array.isArray(response) ? response : (response.data || []);
                    const bindings = data.filter(b => b.isBound === true);

                    if (bindings.length === 0) {
                        e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 mojang <正版用户名> 进行绑定');
                        return false;
                    }

                    // 返回所有绑定账号的信息
                    const msg = ['你的绑定账号UUID如下：'];
                    for (const binding of bindings) {
                        msg.push('', `用户名：${binding.username}`, `UUID：${binding.uuid}`);
                    }
                    e.reply(msg.join('\n'));
                    return true;
                } catch (err) {
                    logger.error(`[MCTool] 查询绑定UUID失败: ${err.message}`);
                    e.reply('查询绑定UUID失败，请稍后重试');
                return false;
                }
            }

            // 3. 如果指定了用户名，优先从云端获取
            let uuid = null;
            let source = '';

            if (this.cloudAvailable) {
                try {
                    logger.info(`[MCTool] 从云端查询UUID: ${username}`);
                    const response = await this.cloudAPI.request(`/api/binding/query?username=${username}&bindType=mojang`, {
                        headers: {
                            'X-Bot-Token': this.cloudAPI.token
                        }
                    });
                    const data = Array.isArray(response) ? response : (response.data || []);
                    const binding = data.find(b => b.isBound === true);
                    
                    if (binding) {
                        uuid = binding.uuid;
                        source = '云端数据';
                        logger.info(`[MCTool] 从云端获取到UUID: ${uuid}`);
                    }
                } catch (err) {
                    logger.error(`[MCTool] 云端查询失败: ${err.message}`);
                }
            }

            // 4. 如果云端没有找到，尝试从 PlayerDB 获取
            if (!uuid) {
                logger.info(`[MCTool] 从 PlayerDB 查询UUID: ${username}`);
                const result = await getPlayerUUID(username);
                if (result.uuid) {
                    uuid = result.uuid;
                    source = 'PlayerDB API';
                    logger.info(`[MCTool] 从 PlayerDB 获取到UUID: ${uuid}`);
                }
            }

            // 5. 返回结果
            if (uuid) {
                e.reply([
                    `用户名：${username}`,
                    `UUID：${uuid}`,
                    `数据来源：${source}`
                ].join('\n'));
            return true;
            } else {
                e.reply('未找到该用户名的UUID，请确认是否为正版用户名');
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
} 