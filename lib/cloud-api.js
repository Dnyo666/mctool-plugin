import fs from 'fs'
import path from 'path'

export class CloudAPI {
    constructor() {
        this.baseUrl = 'https://mctoolapi.lzgzxs.xyz';
        this.token = null;
        this.available = false;
    }

    async init() {
        await this.loadToken();
    }

    async loadToken() {
        const tokenPath = path.join(process.cwd(), 'data/mctool/cloud_token.json');
        if (fs.existsSync(tokenPath)) {
            try {
                const content = fs.readFileSync(tokenPath, 'utf8');
                if (!content.trim()) {
                    logger.info('[MCTool] Token文件为空');
                    return false;
                }
                
                const data = JSON.parse(content);
                if (!data || !data.token) {
                    logger.info('[MCTool] Token文件格式无效');
                    return false;
                }

                this.token = data.token;
                // 验证token
                await this.validateToken();
                this.available = true;
                return true;
            } catch (err) {
                logger.error(`[MCTool] Token验证失败: ${err.message}`);
                // 如果是文件读取或解析错误，删除无效的token文件
                if (err instanceof SyntaxError || err.code === 'ENOENT') {
                    try {
                        fs.unlinkSync(tokenPath);
                        logger.info('[MCTool] 已删除无效的Token文件');
                    } catch (e) {
                        logger.error(`[MCTool] 删除Token文件失败: ${e.message}`);
                    }
                }
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

        try {
            const response = await fetch(`${this.baseUrl}/api/bot/validate`, {
                headers: {
                    'X-Bot-Token': this.token,
                    'Content-Type': 'application/json'
                }
            });

            // 检查502错误
            if (response.status === 502) {
                logger.error('[MCTool] 云端API暂时不可用 (502)');
                this.available = false;
                throw new Error('云端API暂时不可用');
            }

            const data = await response.json();
            if (data.code !== 200) {
                throw new Error(data.message);
            }

            return data.data;
        } catch (err) {
            if (err.message === '云端API暂时不可用') {
                throw err;
            }
            // 其他网络错误
            if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                logger.error(`[MCTool] 云端API连接失败: ${err.message}`);
                this.available = false;
                throw new Error('云端API连接失败');
            }
            throw err;
        }
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
            
            // 处理已注册的情况
            if (data.code === 400 && data.message.includes('已被注册')) {
                try {
                    // 尝试从错误消息中提取数据
                    const existingData = JSON.parse(data.message.replace('已被注册: ', ''));
                    if (existingData && existingData.token) {
                        this.token = existingData.token;
                        this.available = true;
                        // 保存token
                        await this.saveToken(existingData);
                        return existingData;
                    }
                } catch (err) {
                    logger.error(`[MCTool] 解析已存在的Token数据失败: ${err.message}`);
                    throw new Error('获取已注册的Token失败');
                }
            }
            
            // 处理成功注册的情况
            if (data.code === 200 && data.data && data.data.token) {
                this.token = data.data.token;
                this.available = true;
                // 保存token
                await this.saveToken(data.data);
                return data.data;
            }

            throw new Error(data.message || '注册失败');
        } catch (err) {
            this.available = false;
            throw err;
        }
    }

    async saveToken(data) {
        const tokenPath = path.join(process.cwd(), 'data/mctool/cloud_token.json');
        try {
            fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
            fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2));
            logger.info('[MCTool] Token保存成功');
            return true;
        } catch (err) {
            logger.error(`[MCTool] Token保存失败: ${err.message}`);
            return false;
        }
    }

    async request(path, options = {}) {
        if (!this.available) {
            throw new Error('云端API不可用');
        }

        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                ...options,
                headers: {
                    ...options.headers,
                    'X-Bot-Token': this.token
                }
            });

            // 处理502状态码,表示云端不可用
            if (response.status === 502) {
                this.available = false;
                throw new Error('云端服务暂时不可用');
            }

            // 处理400状态码,表示验证失败
            if (response.status === 400) {
                throw new Error('验证失败');
            }

            // 其他非200状态码
            if (response.status !== 200) {
                throw new Error(`请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (err) {
            // 如果是网络错误,设置云端不可用
            if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                this.available = false;
            }
            throw err;
        }
    }
} 