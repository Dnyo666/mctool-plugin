import fs from 'fs'
import path from 'path'
import logger from '../models/logger.js'

export class CloudAPI {
    constructor() {
        this.baseUrl = 'https://mctoolapi.lzgzxs.xyz';
        this.token = null;
        this.available = false; // 添加标志位表示云端API是否可用
    }

    async init() {
        await this.loadToken();
    }

    async loadToken() {
        const tokenPath = path.join(process.cwd(), 'data/mctool/cloud_token.json');
        if (fs.existsSync(tokenPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
                this.token = data.token;
                // 验证token
                await this.validateToken();
                this.available = true;
                return true;
            } catch (err) {
                logger.error(`[MCTool] Token验证失败: ${err.message}`);
                this.available = false;
                return false;
            }
        }
        return false;
    }

    async validateToken() {
        if (!this.token) {
            throw new Error('Token未初始化');
        }

        const response = await fetch(`${this.baseUrl}/api/bot/validate`, {
            headers: {
                'X-Bot-Token': this.token,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.message);
        }

        return data.data;
    }

    async register(botId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/bot/register/${botId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            if (data.code === 200) {
                this.token = data.data.token;
                this.available = true;
                // 保存token
                const tokenPath = path.join(process.cwd(), 'data/mctool/cloud_token.json');
                fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
                fs.writeFileSync(tokenPath, JSON.stringify(data.data));
                return data.data;
            }
            throw new Error(data.message);
        } catch (err) {
            this.available = false;
            throw err;
        }
    }

    async request(endpoint, options = {}) {
        if (!this.available) {
            throw new Error('云端API不可用，请检查网络连接或联系管理员');
        }

        if (!this.token) {
            throw new Error('Bot token未初始化');
        }

        const headers = {
            'X-Bot-Token': this.token,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.message);
        }

        return data.data;
    }
} 