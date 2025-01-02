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
            
            // 设置视口大小
            await page.setViewport({
                width: 800,
                height: 800  // 设置一个足够大的高度
            });

            // 读取HTML模板并替换版本号
            let template = fs.readFileSync(htmlPath, 'utf8');
            template = template.replace('{{version}}', version);

            await page.setContent(template);

            // 等待内容加载完成
            await page.waitForSelector('.container');

            // 确保临时目录存在
            const tempDir = path.join(process.cwd(), 'plugins', 'mctool-plugin', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // 截图
            const screenshotPath = path.join(tempDir, `${e.user_id}_help.png`);
            try {
                await page.screenshot({
                    path: screenshotPath,
                    fullPage: true
                });
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
