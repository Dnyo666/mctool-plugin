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

            let use2DFallback = false;  // 标记是否需要切换到2D渲染
            let renderError = '';  // 记录渲染错误信息

            // 如果启用了3D渲染，先检查服务是否在线
            if (use3D) {
                const server = config.skin?.server || 'http://127.0.0.1:3006';
                try {
                    const healthResponse = await fetch(`${server}/health`);
                    const healthData = await healthResponse.json();
                    
                    if (!healthResponse.ok || healthData?.status !== 'ok') {
                        use2DFallback = true;
                        renderError = '渲染服务状态异常';
                    } else {
                        // 只在服务正常时发送一次渲染提示
                        await e.reply('正在生成3D渲染图像，请耐心等待...');
                    }
                } catch (error) {
                    use2DFallback = true;
                    renderError = error.message;
                }

                // 如果需要切换到2D渲染，发送一次提示
                if (use2DFallback) {
                    await e.reply(`3D渲染服务异常: ${renderError}，已切换至2D渲染`);
                }
            }

            // 处理每个绑定账号
            const accounts = await Promise.all(userBindings.map(async (binding) => {
                try {
                    let skinUrl;
                    if (use3D && !use2DFallback) {
                        // 使用API渲染3D皮肤，并应用配置中的参数
                        const server = config.skin?.server || 'http://127.0.0.1:3006';
                        const endpoint = config.skin?.endpoint || '/render';
                        const width = config.skin?.width || 300;
                        const height = config.skin?.height || 600;
                        
                        try {
                            // 第一个角度的渲染URL（正面135度）
                            const render3DUrl1 = `${server}${endpoint}?uuid=${binding.raw_uuid}&width=${width}&height=${height}&angle=135&angleY=38`;
                            // 第二个角度的渲染URL（背面315度）
                            const render3DUrl2 = `${server}${endpoint}?uuid=${binding.raw_uuid}&width=${width}&height=${height}&angle=315&angleY=38`;

                            // 并行请求两个渲染
                            const [response1, response2] = await Promise.race([
                                Promise.all([
                                    fetch(render3DUrl1),
                                    fetch(render3DUrl2)
                                ]),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('3D渲染超时，可能是皮肤过多')), 30000)
                                )
                            ]);
                            
                            if (response1.ok && response2.ok) {
                                skinUrl = [render3DUrl1, render3DUrl2];
                            } else {
                                throw new Error('3D渲染失败');
                            }
                        } catch (error) {
                            logger.info(`[MCTool] 3D渲染失败，使用2D渲染: ${error.message}`);
                            skinUrl = [`https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`];
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

            // 计算合适的视口高度
            const headerHeight = 60;   // 头部高度
            const accountHeight = 220;  // 账号卡片高度
            const footerHeight = 40;   // 底部高度
            const spacing = 10;        // 间距
            const rowCount = Math.ceil(accounts.length / 2);  // 计算行数
            const totalHeight = headerHeight + (rowCount * (accountHeight + spacing)) + footerHeight;

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
                width: 800,
                height: totalHeight
            });

            // 读取HTML模板并替换内容
            let template = fs.readFileSync(htmlPath, 'utf8');

            // 替换模板中的变量
            template = template
                .replace('{{nickname}}', data.nickname)
                .replace('{{qq}}', data.qq)
                .replace(/{{each[\s\S]*?}}[\s\S]*?{{\/each}}/, accounts.map(account => `
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
                        <div class="skin-preview">
                            ${account.skinUrl.map(url => `
                                <img src="${url}" alt="Skin" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
                            `).join('')}
                        </div>
                    </div>
                `).join(''));

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
            
            // 检查3D渲染状态
            let render3DStatus = '未启用';
            let render3DServer = '';
            if (skin.use3D) {
                try {
                    const server = skin.render3D?.server || 'http://127.0.0.1:3006';
                    render3DServer = server;
                    const healthResponse = await fetch(`${server}/health`);
                    const healthData = await healthResponse.json();
                    
                    if (!healthResponse.ok || healthData?.status !== 'ok') {
                        render3DStatus = '状态异常';
                    } else {
                        render3DStatus = '运行正常';
                    }
                } catch (error) {
                    logger.error('[MCTool] 检查3D渲染状态失败:', error);
                    render3DStatus = '连接失败';
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

            // 检查公用3D渲染API状态
            let publicRender3DStatus = '异常';
            try {
                const response = await fetch('http://skin.qxml.ltd/health');
                const data = await response.json();
                
                if (response.ok && data?.status === 'ok') {
                    publicRender3DStatus = '运行正常';
                }
            } catch (error) {
                logger.error('[MCTool] 检查公用3D渲染API状态失败:', error);
                publicRender3DStatus = '连接失败';
            }
            
            // 发送状态信息
            const message = [
                '服务状态检查结果：\n',
                `3D渲染服务：${render3DStatus}${render3DServer ? ` (${render3DServer})` : ''}\n`,
                `公用头像服务：${avatarStatus}\n`,
                `公用3D渲染：${publicRender3DStatus} (http://skin.qxml.ltd)`
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
} 