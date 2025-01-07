import { Data, getPlayerUUID, getConfig } from './mc-utils.js'
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
                    reg: '^#?[Mm][Cc]绑定\\s+(.+)$',
                    fnc: 'bindUser',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]解绑\\s+(.+)$',
                    fnc: 'unbindUser',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]信息$',
                    fnc: 'getUserInfo',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]头像\\s*(全身|半身|头部)?\\s*(.+)?$',
                    fnc: 'generateAvatar',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]服务状态$',
                    fnc: 'checkServiceStatus',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc](?:uuid|uid|id)(?:\\s+(.+))?$',
                    fnc: 'queryUUID',
                    permission: 'all'
                },
                {
                    reg: '^#mc皮肤渲染$',
                    fnc: 'renderSkin'
                }
            ]
        });
    }

    /**
     * 绑定用户
     * @param {*} e 消息事件
     */
    async bindUser(e) {
        const username = e.msg.match(/^#?[Mm][Cc]绑定\s+(.+)$/)[1].trim();
        if (!username) {
            e.reply('请提供要绑定的用户名');
            return false;
        }

        // 读取绑定数据
        const bindings = Data.read('user_bindings') || {};
        const userIndex = Data.read('username_index') || {};

        // 检查用户名是否已被绑定
        if (userIndex[username.toLowerCase()]) {
            if (userIndex[username.toLowerCase()] === e.user_id) {
                e.reply('该用户名已经绑定到你的账号了');
            } else {
                e.reply('该用户名已被其他QQ号绑定');
            }
            return false;
        }

        // 验证用户名是否存在
        const { uuid, raw_id } = await getPlayerUUID(username);
        if (!uuid) {
            e.reply('未找到该用户名，请确认是否为正版用户名');
            return false;
        }

        // 添加绑定
        if (!bindings[e.user_id]) {
            bindings[e.user_id] = [];
        }

        bindings[e.user_id].push({
            username: username,
            uuid: uuid,
            raw_uuid: raw_id,
            bindTime: Date.now()
        });

        // 更新用户名索引
        userIndex[username.toLowerCase()] = e.user_id;

        // 保存数据
        Data.write('user_bindings', bindings);
        Data.write('username_index', userIndex);

        e.reply(`绑定成功\n用户名：${username}\nUUID：${uuid}`);
        return true;
    }

    /**
     * 解绑用户
     * @param {*} e 消息事件
     */
    async unbindUser(e) {
        const username = e.msg.match(/^#?[Mm][Cc]解绑\s+(.+)$/)[1].trim();
        if (!username) {
            e.reply('请提供要解绑的用户名');
            return false;
        }

        // 读取绑定数据
        const bindings = Data.read('user_bindings') || {};
        const userIndex = Data.read('username_index') || {};

        // 检查用户名是否已被绑定
        if (!userIndex[username.toLowerCase()] || userIndex[username.toLowerCase()] !== e.user_id) {
            e.reply('该用户名未绑定到你的账号');
            return false;
        }

        // 移除绑定
        if (bindings[e.user_id]) {
            bindings[e.user_id] = bindings[e.user_id].filter(
                bind => bind.username.toLowerCase() !== username.toLowerCase()
            );
            if (bindings[e.user_id].length === 0) {
                delete bindings[e.user_id];
            }
        }

        // 移除用户名索引
        delete userIndex[username.toLowerCase()];

        // 保存数据
        Data.write('user_bindings', bindings);
        Data.write('username_index', userIndex);

        e.reply(`已解绑用户名：${username}`);
        return true;
    }

    /**
     * 获取玩家皮肤数据
     * @param {string} uuid 玩家UUID
     * @returns {Promise<string>} 皮肤URL
     */
    async getSkinData(uuid) {
        try {
            // 获取玩家profile
            const profileUrl = `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`;
            const profileResponse = await fetch(profileUrl);
            const profileData = await profileResponse.json();

            if (!profileData.properties || !profileData.properties[0]) {
                throw new Error('无法获取玩家皮肤数据');
            }

            // 解码皮肤数据
            const textureData = JSON.parse(Buffer.from(profileData.properties[0].value, 'base64').toString());
            return textureData.textures.SKIN.url;
        } catch (error) {
            logger.error(`[MCTool] 获取玩家皮肤数据失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取用户信息
     * @param {*} e 消息事件
     */
    async getUserInfo(e) {
        try {
            // 读取绑定数据
            const bindings = Data.read('user_bindings') || {};
            const userBindings = bindings[e.user_id];

            if (!userBindings || userBindings.length === 0) {
                e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 <用户名> 进行绑定');
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
                                skinUrl = [`https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`];
                            }
                        }
                    } else {
                        skinUrl = [`https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`];
                    }
                    const avatarUrl = `https://api.mineatar.io/face/${binding.raw_uuid}`;
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

            return true;
        } catch (error) {
            logger.error(`[MCTool] 生成用户信息失败: ${error.message}`);
            e.reply('生成用户信息失败，请稍后重试');
            return false;
        }
    }

    /**
     * 检查服务状态
     * @param {*} e 消息事件
     */
    async checkServiceStatus(e) {
        try {
            logger.info('[MCTool] 正在检查服务状态...');

            // 获取配置
            const config = getConfig();
            const skin = config?.skin || {};
            
            // 检查行走视图渲染状态
            let walkingViewStatus = '未启用';
            let walkingViewServer = '';
            if (skin.use3D && skin.renderType === 1) {
                try {
                    const server = skin.render1?.server || 'https://skin2.qxml.ltd';
                    walkingViewServer = server;
                    const response = await fetch('https://skin2.qxml.ltd/docs#/');
                    
                    if (response.ok) {
                        walkingViewStatus = '运行正常';
                    } else {
                        walkingViewStatus = '状态异常';
                    }
                } catch (error) {
                    logger.error('[MCTool] 检查行走视图渲染状态失败:', error);
                    walkingViewStatus = '连接失败';
                }
            }

            // 检查站立视图渲染状态
            let standingViewStatus = '未启用';
            let standingViewServer = '';
            if (skin.use3D && (skin.renderType === 2 || skin.renderType === 1)) {
                try {
                    const server = skin.render2?.server || 'http://skin.qxml.ltd';
                    standingViewServer = server;
                    const healthResponse = await fetch(`${server}/health`);
                    const healthData = await healthResponse.json();
                    
                    if (!healthResponse.ok || healthData?.status !== 'ok') {
                        standingViewStatus = '状态异常';
                    } else {
                        standingViewStatus = '运行正常';
                    }
                } catch (error) {
                    logger.error('[MCTool] 检查站立视图渲染状态失败:', error);
                    standingViewStatus = '连接失败';
                }
            }
            
            // 检查公用头像API状态
            let avatarStatus = '异常';
            try {
                const response = await fetch('https://mcacg.qxml.ltd/docs#/', {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html'
                    }
                });
                
                if (response.ok) {
                    avatarStatus = '运行正常';
                }
            } catch (error) {
                logger.error('[MCTool] 检查头像服务状态失败:', error);
                avatarStatus = '连接失败';
            }
            
            // 发送状态信息
            const message = [
                '服务状态检查结果：\n',
                `行走视图渲染：${walkingViewStatus}${walkingViewServer ? ` (${walkingViewServer})` : ''}\n`,
                `站立视图渲染：${standingViewStatus}${standingViewServer ? ` (${standingViewServer})` : ''}\n`,
                `公用头像服务：${avatarStatus}`
            ].join('');
            
            e.reply(message);
            
            return true;
        } catch (error) {
            logger.error('[MCTool] 检查服务状态失败:', error);
            e.reply('检查服务状态失败，请稍后重试');
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
                // 否则获取所有绑定的用户
                const bindings = Data.read('user_bindings') || {};
                const userBindings = bindings[e.user_id];
                if (!userBindings || userBindings.length === 0) {
                    e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 <用户名> 进行绑定');
                    return false;
                }
                users = userBindings;
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
     * 查询UUID
     * @param {*} e 消息事件
     */
    async queryUUID(e) {
        try {
            const username = e.msg.match(/^#?[Mm][Cc](?:uuid|uid|id)(?:\s+(.+))?$/)?.[1]?.trim();

            if (username) {
                // 查询指定用户名的UUID
                logger.info(`[MCTool] 查询用户 ${username} 的UUID`);
                const { uuid, raw_id } = await getPlayerUUID(username);
                if (!uuid) {
                    e.reply('未找到该用户名，请确认是否为正版用户名');
                    return false;
                }
                e.reply(`用户名：${username}\nUUID：${uuid}`);
                return true;
            }

            // 查询已绑定用户的UUID
            const bindings = Data.read('user_bindings') || {};
            const userBindings = bindings[e.user_id];

            if (!userBindings || userBindings.length === 0) {
                e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 <用户名> 进行绑定');
                return false;
            }

            const uuidList = userBindings.map(binding => 
                `用户名：${binding.username}\nUUID：${binding.uuid}`
            ).join('\n\n');

            e.reply(`你的绑定用户UUID如下：\n${uuidList}`);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 查询UUID失败: ${error.message}`);
            e.reply('查询UUID失败，请稍后重试');
            return false;
        }
    }

    /**
     * 渲染皮肤
     * @param {*} e 消息事件
     */
    async renderSkin(e) {
        try {
            // 读取绑定数据
            const bindings = Data.read('user_bindings') || {};
            const userBindings = bindings[e.user_id];

            if (!userBindings || userBindings.length === 0) {
                e.reply('你还没有绑定任何Minecraft账号，请使用 #mc绑定 <用户名> 进行绑定');
                return false;
            }

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
                }
            });

            await Promise.all(renderPromises);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 皮肤渲染失败: ${error.message}`);
            e.reply('皮肤渲染失败，请稍后重试');
            return false;
        }
    }
} 