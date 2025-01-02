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

            // 处理每个绑定账号
            const accounts = await Promise.all(userBindings.map(async (binding) => {
                try {
                    let skinUrl;
                    if (use3D) {
                        // 使用API渲染3D皮肤
                        skinUrl = `http://127.0.0.1:3006/render?uuid=${binding.raw_uuid}&width=300&height=600&angle=135&angleY=45`;
                    } else {
                        skinUrl = `https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`;
                    }
                    const avatarUrl = `https://api.mineatar.io/face/${binding.raw_uuid}`;
                    return {
                        ...binding,
                        skinUrl,
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
                    logger.error(`[MCTool] 处理账号 ${binding.username} 失败: ${error.message}`);
                    return {
                        ...binding,
                        skinUrl: `https://api.mineatar.io/body/full/${binding.raw_uuid}?scale=8`,
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
                            <img src="${account.skinUrl}" alt="Skin" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
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
} 