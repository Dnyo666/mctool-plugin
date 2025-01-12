import { getConfig, initCloudAPI } from './mc-utils.js'
import logger from '../models/logger.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 基础路径
const YUNZAI_DIR = path.join(__dirname, '..', '..', '..')  // Yunzai-Bot 根目录
const PLUGIN_DIR = path.join(YUNZAI_DIR, 'plugins', 'mctool-plugin')  // 插件根目录

// API配置
const API_CONFIG = {
    modrinth: {
        token: 'uDI95zNmiyqyT3QkvsoCQiO7xweL8va8',
        baseUrl: 'https://api.modrinth.com/v2'
    },
    curseforge: {
        token: '$2a$10$xu641HxxR5O9Z8sdQmSI8ury/SeTI9tDx3uW1jTOGaxnCmZ1bGbe.',
        baseUrl: 'https://api.curseforge.com/v1',
        gameId: 432  // Minecraft的游戏ID
    }
};

export class MCTool extends plugin {
    constructor() {
        super({
            name: 'MCTool-工具',
            dsc: 'Minecraft工具集',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc]服务状态$',
                    fnc: 'checkServiceStatus',
                    permission: 'all'
                }
            ]
        })

        // 初始化云端API状态
        this.cloudAPI = null;
        this.cloudAvailable = false;
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
            return this.cloudAvailable;
        } catch (err) {
            logger.error(`[MCTool] 云端API初始化失败: ${err.message}`);
            this.cloudAPI = null;
            this.cloudAvailable = false;
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

            // 检查Modrinth API状态
            let modrinthStatus = '异常';
            try {
                const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/search`, {
                    method: 'GET',
                    headers: {
                        'Authorization': API_CONFIG.modrinth.token
                    }
                });
                
                if (response.ok) {
                    modrinthStatus = '运行正常';
                } else {
                    modrinthStatus = `状态异常 (${response.status})`;
                }
            } catch (error) {
                logger.error('[MCTool] 检查Modrinth API状态失败:', error);
                modrinthStatus = '连接失败';
            }

            // 检查CurseForge API状态
            let curseforgeStatus = '异常';
            try {
                const response = await fetch(`${API_CONFIG.curseforge.baseUrl}/games`, {
                    method: 'GET',
                    headers: {
                        'x-api-key': API_CONFIG.curseforge.token
                    }
                });
                
                if (response.ok) {
                    curseforgeStatus = '运行正常';
                } else {
                    curseforgeStatus = `状态异常 (${response.status})`;
                }
            } catch (error) {
                logger.error('[MCTool] 检查CurseForge API状态失败:', error);
                curseforgeStatus = '连接失败';
            }

            // 检查云端API状态
            let cloudStatus = '未知';
            let tokenStatus = '未知';
            let botId = '未知';
            
            try {
                // 初始化云端API
                await this.initCloud();
                
                if (this.cloudAvailable && this.cloudAPI) {
                    try {
                        const data = await this.cloudAPI.request('/api/bot/validate');
                        logger.info('[MCTool] 云端API响应:', JSON.stringify(data));
                        
                        cloudStatus = '运行正常';
                        tokenStatus = '验证通过';
                        botId = data.botId;
                    } catch (error) {
                        if (error.message.includes('Token未初始化')) {
                            cloudStatus = '运行正常';
                            tokenStatus = '未验证';
                        } else {
                            cloudStatus = '状态异常';
                            tokenStatus = '验证失败';
                            logger.error('[MCTool] 验证失败:', error.message);
                        }
                    }
                } else {
                    cloudStatus = '不可用';
                    tokenStatus = '未验证';
                }
            } catch (error) {
                logger.error('[MCTool] 检查云端API状态失败:', error);
                cloudStatus = '连接失败';
                tokenStatus = '未验证';
            }
            
            // 发送状态信息
            const message = [
                '=== MCTool 服务状态检查结果 ===\n',
                '【皮肤渲染服务】',
                `行走视图渲染：${walkingViewStatus}${walkingViewServer ? ` (${walkingViewServer})` : ''}`,
                `站立视图渲染：${standingViewStatus}${standingViewServer ? ` (${standingViewServer})` : ''}`,
                `公用头像服务：${avatarStatus}\n`,
                '【Mod API服务】',
                `Modrinth API：${modrinthStatus}`,
                `CurseForge API：${curseforgeStatus}\n`,
                '【云端API服务】',
                `API状态：${cloudStatus}`,
                `Token验证：${tokenStatus}`,
                `Bot ID：${botId}`
            ].join('\n');
            
            e.reply(message);
            
            return true;
        } catch (error) {
            logger.error('[MCTool] 检查服务状态失败:', error);
            e.reply('检查服务状态失败，请稍后重试');
            return false;
        }
    }
} 