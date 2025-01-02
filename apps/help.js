import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fs from 'fs'
import path from 'path'

export class Help extends plugin {
    constructor() {
        super({
            name: 'MCTool-帮助',
            dsc: '显示帮助信息',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc](tool|工具)?(help|帮助|菜单)$',
                    fnc: 'help',
                    permission: 'all'
                }
            ]
        });
    }

    async help(e) {
        try {
            // 读取package.json获取版本号
            const packagePath = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            const version = packageJson.version;

            // 使用puppeteer渲染HTML
            const htmlPath = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'resources', 'html', 'help.html');
            const browser = await puppeteer.browserInit();
            const page = await browser.newPage();
            
            // 读取HTML模板并替换版本号
            let template = fs.readFileSync(htmlPath, 'utf8');
            template = template.replace('{{version}}', version);

            await page.setContent(template);

            // 等待所有内容加载完成
            await page.waitForSelector('.container', { timeout: 5000 });

            // 获取实际内容高度
            const contentHeight = await page.evaluate(() => {
                const container = document.querySelector('.container');
                if (!container) return 800;
                
                // 获取实际内容高度
                const rect = container.getBoundingClientRect();
                // 添加一些额外的空间以确保内容完全显示
                return Math.max(800, Math.ceil(rect.height + 50));
            });

            // 设置视口大小，确保高度足够
            await page.setViewport({
                width: 800,
                height: contentHeight
            });

            // 再次等待内容重新布局
            await page.waitForTimeout(500);

            // 确保临时目录存在
            const tempDir = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // 截图
            const screenshotPath = path.join(tempDir, `${e.user_id}_help.png`);
            try {
                // 尝试多次截图，确保内容完整
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await page.screenshot({
                            path: screenshotPath,
                            fullPage: true,
                            captureBeyondViewport: true
                        });
                        
                        // 验证图片是否完整
                        const stats = fs.statSync(screenshotPath);
                        if (stats.size > 1000) { // 确保图片大小合理
                            break;
                        }
                        
                        // 如果图片太小，增加等待时间再试
                        await page.waitForTimeout(500 * attempt);
                    } catch (screenshotError) {
                        if (attempt === 3) throw screenshotError;
                        await page.waitForTimeout(500);
                    }
                }
            } catch (error) {
                console.error('截图失败:', error);
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
            console.error('生成帮助信息失败:', error);
            e.reply('生成帮助信息失败，请稍后重试');
            return false;
        }
    }
}
