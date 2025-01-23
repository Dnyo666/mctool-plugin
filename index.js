import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

logger.info('------------------------------------')
logger.info('MCTool-Plugin v4.2.1')
logger.info('插件正在加载中...')
logger.info('作者：浅巷墨黎')
logger.info('QQ群：303104111')
logger.info('项目地址：https://github.com/Dnyo666/mctool-plugin')
logger.info('------------------------------------')

const apps = {}
const startTime = Date.now()
let successCount = 0
let failureCount = 0

// 预加载工具模块，确保数据迁移在其他模块加载前完成
try {
    const utils = await import('./apps/mc-utils.js')
    logger.info('[MCTool] 工具模块加载完成')
    // Data 实例在导入时已经创建，会自动执行数据迁移
} catch (err) {
    logger.error('[MCTool] 工具模块加载失败:', err)
    failureCount++
}

// 按顺序加载插件
const pluginOrder = [
    { name: 'mc-server', file: './apps/mc-server.js' },
    { name: 'mc-auth', file: './apps/mc-auth.js' },
    { name: 'mc-auth-request', file: './apps/mc-auth-request.js' },
    { name: 'mc-push', file: './apps/mc-push.js' },
    { name: 'mc-push-commands', file: './apps/mc-push-commands.js' },
    { name: 'mc-user', file: './apps/mc-user.js' },
    { name: 'help', file: './apps/help.js' },
    { name: 'update', file: './apps/update.js' },
    { name: 'mc-mod', file: './apps/mc-mod.js' },
    { name: 'mc-tool', file: './apps/mc-tool.js' }
]

for (const plugin of pluginOrder) {
    try {
        const mod = await import(plugin.file)
        const exportedClass = Object.values(mod)[0]
        if (exportedClass && typeof exportedClass === 'function') {
            apps[plugin.name] = exportedClass
            logger.info(`[MCTool] 成功加载插件: ${plugin.name}`)
            successCount++
        }
    } catch (err) {
        logger.error(`[MCTool] 载入插件错误：${plugin.name}`)
        logger.error(err)
        failureCount++
    }
}

const elapsedTime = Date.now() - startTime

logger.info('----------------------')
logger.info(chalk.green('MCTool-Plugin载入完成'))
logger.info(`成功加载：${chalk.green(successCount)} 个`)
logger.info(`加载失败：${chalk.red(failureCount)} 个`)
logger.info(`总耗时：${chalk.yellow(elapsedTime)} 毫秒`)
logger.info('----------------------')

//最后在加载mcsmanager相关插件
try {
    const mcsPlugins = await import('./apps/mcsmanager/index.js')
    // 将 MCS 插件添加到 apps 对象中
    for (const [name, pluginClass] of Object.entries(mcsPlugins.default)) {
        apps[`mcs-${name}`] = pluginClass
    }
    logger.info('[MCTool] MCSManager加载完成')
} catch (err) {
    logger.error('[MCTool] MCSManager加载失败:', err)
    failureCount++
}

export { apps } 