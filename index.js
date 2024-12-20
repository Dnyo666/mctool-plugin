import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.info('------------------------------------')
console.info('MCTool-Plugin v1.0.0')
console.info('插件正在加载中...')
console.info('作者：浅巷墨黎')
console.info('QQ群：303104111')
console.info('项目地址：https://github.com/Dnyo666/mctool-plugin')
console.info('------------------------------------')

const apps = {}

// 按顺序加载插件
const pluginOrder = [
    'mc-utils.js',      // 工具类
    'mc-server.js',     // 服务器管理
    'mc-auth.js',       // 验证功能
    'mc-push.js',       // 推送功能
    'mc-push-commands.js', // 推送命令
    'mc-auth-request.js',  // 验证请求
    'help.js'           // 帮助信息
]

for (const file of pluginOrder) {
    try {
        const mod = await import(`./apps/${file}`)
        const name = file.replace('.js', '')
        
        // 获取导出的类（可能是默认导出或命名导出）
        const exportedClass = mod.default || Object.values(mod)[0]
        
        if (exportedClass && typeof exportedClass === 'function') {
            apps[name] = exportedClass
            console.info(`[MCTool] 成功加载插件: ${name}`)
        }
    } catch (err) {
        console.error(`[MCTool] 载入插件错误：${file}`)
        console.error(err)
    }
}

export { apps }

console.info('MCTool-Plugin 初始化完成')
console.info('------------------------------------') 