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

// 预加载工具模块
try {
    await import('./apps/mc-utils.js')
    console.info('[MCTool] 工具模块加载完成')
} catch (err) {
    console.error('[MCTool] 工具模块加载失败:', err)
}

// 定义插件加载顺序
const pluginOrder = [
    { name: 'mc-server', file: './apps/mc-server.js' },
    { name: 'mc-auth', file: './apps/mc-auth.js' },
    { name: 'mc-auth-request', file: './apps/mc-auth-request.js' },
    { name: 'mc-push', file: './apps/mc-push-commands.js' },
    { name: 'help', file: './apps/help.js' }
]

// 创建加载任务
const loadTasks = pluginOrder.map(plugin => {
    return new Promise(async (resolve) => {
        try {
            const mod = await import(plugin.file)
            const exportedClass = Object.values(mod)[0]
            if (exportedClass && typeof exportedClass === 'function') {
                apps[plugin.name] = exportedClass
                console.info(`[MCTool] 成功加载插件: ${plugin.name}`)
            }
            resolve()
        } catch (err) {
            console.error(`[MCTool] 载入插件错误：${plugin.name}`)
            console.error(err)
            resolve() // 即使失败也继续
        }
    })
})

// 等待所有插件加载完成
await Promise.all(loadTasks)

export { apps }

console.info('MCTool-Plugin 初始化完成')
console.info('------------------------------------') 