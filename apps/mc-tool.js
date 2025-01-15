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
            await this.reply('[MCTool] 正在检查服务状态...');

            // 获取本地配置
            const config = getConfig();
            const localBotId = this.e.bot.uin.toString();

            // 检查云端API状态
            let cloudStatus = '未知';
            let tokenStatus = '未验证';
            let botId = localBotId;  // 默认使用本地Bot ID
            
            try {
                // 初始化云端API
                await this.initCloud();
                
                if (this.cloudAvailable && this.cloudAPI) {
                    try {
                        const data = await this.cloudAPI.request('/api/bot/validate');
                        logger.info('[MCTool] 云端API响应:', JSON.stringify(data));
                        
                        cloudStatus = '运行正常';
                        tokenStatus = '验证通过';
                        botId = data.botId || localBotId;
                    } catch (error) {
                        if (error.message.includes('Token未初始化')) {
                            cloudStatus = '运行正常';
                            tokenStatus = '未验证';
                        } else if (error.message.includes('云端API暂时不可用') || error.message.includes('云端API连接失败')) {
                            cloudStatus = '不可用';
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

            // 检查各项服务状态
            let render1Status, render2Status, avatarStatus, modrinthStatus, curseforgeStatus;
            
            try {
                render1Status = await this.checkRender1Service();
            } catch (error) {
                logger.error('[MCTool] 检查行走视图渲染服务失败:', error);
                render1Status = '检查失败';
            }

            try {
                render2Status = await this.checkRender2Service();
            } catch (error) {
                logger.error('[MCTool] 检查站立视图渲染服务失败:', error);
                render2Status = '检查失败';
            }

            try {
                avatarStatus = await this.checkAvatarService();
            } catch (error) {
                logger.error('[MCTool] 检查头像服务失败:', error);
                avatarStatus = '检查失败';
            }

            try {
                modrinthStatus = await this.checkModrinthAPI();
            } catch (error) {
                logger.error('[MCTool] 检查Modrinth API失败:', error);
                modrinthStatus = '检查失败';
            }

            try {
                curseforgeStatus = await this.checkCurseForgeAPI();
            } catch (error) {
                logger.error('[MCTool] 检查CurseForge API失败:', error);
                curseforgeStatus = '检查失败';
            }

            // 生成状态报告
            const report = [
                '=== MCTool 服务状态检查结果 ===\n',
                '【皮肤渲染服务】',
                `行走视图渲染：${render1Status}`,
                `站立视图渲染：${render2Status}`,
                `公用头像服务：${avatarStatus}\n`,
                '【Mod API服务】',
                `Modrinth API：${modrinthStatus}`,
                `CurseForge API：${curseforgeStatus}\n`,
                '【云端API服务】',
                `API状态：${cloudStatus}`,
                `Token验证：${tokenStatus}`,
                `Bot ID：${botId}`
            ].join('\n');

            await this.reply(report);
            return true;
        } catch (err) {
            logger.error(`[MCTool] 检查服务状态失败: ${err.message}`);
            await this.reply('检查服务状态失败，请稍后重试');
            return false;
        }
    }

    async checkRender1Service() {
        try {
            const config = getConfig();
            const skin = config?.skin || {};
            
            if (!skin.use3D || skin.renderType !== 1) {
                return '未启用';
            }

            const server = skin.render1?.server || 'https://skin2.qxml.ltd';
            const response = await fetch('https://skin2.qxml.ltd/docs#/');
            
            if (response.ok) {
                return `运行正常 (${server})`;
            } else {
                return `状态异常 (${server})`;
            }
        } catch (error) {
            logger.error('[MCTool] 检查行走视图渲染状态失败:', error);
            return '连接失败';
        }
    }

    async checkRender2Service() {
        try {
            const config = getConfig();
            const skin = config?.skin || {};
            const server = skin.render2?.server || 'http://127.0.0.1:3006';
            
            if (!skin.use3D || (skin.renderType !== 2 && skin.renderType !== 1)) {
                return '未启用';
            }

            try {
                const healthResponse = await fetch(`${server}/health`);
                const healthData = await healthResponse.json();
                
                if (!healthResponse.ok || healthData?.status !== 'ok') {
                    return `状态异常 (${server})`;
                } else {
                    return `运行正常 (${server})`;
                }
            } catch (error) {
                logger.error(`[MCTool] 检查站立视图渲染状态失败: ${error}`);
                return `连接失败 (${server})`;
            }
        } catch (error) {
            logger.error(`[MCTool] 检查站立视图渲染配置失败: ${error}`);
            return '配置错误';
        }
    }

    async checkAvatarService() {
        try {
            const response = await fetch('https://mcacg.qxml.ltd/docs#/', {
                method: 'GET',
                headers: {
                    'Accept': 'text/html'
                }
            });
            
            return response.ok ? '运行正常' : '状态异常';
        } catch (error) {
            logger.error('[MCTool] 检查头像服务状态失败:', error);
            return '连接失败';
        }
    }

    async checkModrinthAPI() {
        try {
            const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/search`, {
                method: 'GET',
                headers: {
                    'Authorization': API_CONFIG.modrinth.token
                }
            });
            
            return response.ok ? '运行正常' : `状态异常 (${response.status})`;
        } catch (error) {
            logger.error('[MCTool] 检查Modrinth API状态失败:', error);
            return '连接失败';
        }
    }

    async checkCurseForgeAPI() {
        try {
            const response = await fetch(`${API_CONFIG.curseforge.baseUrl}/games`, {
                method: 'GET',
                headers: {
                    'x-api-key': API_CONFIG.curseforge.token
                }
            });
            
            return response.ok ? '运行正常' : `状态异常 (${response.status})`;
        } catch (error) {
            logger.error('[MCTool] 检查CurseForge API状态失败:', error);
            return '连接失败';
        }
    }
} 