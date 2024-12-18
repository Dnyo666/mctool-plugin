import { MCServer, MCPush, MCAuth, helpApp } from './apps/index.js'

// 输出加载提示
logger.info('------------------------------------')
logger.info('MCTool-Plugin v1.0.0')
logger.info('插件正在加载中...')
logger.info('作者：浅巷墨黎')
logger.info('QQ群：303104111')
logger.info('项目地址：https://github.com/Dnyo666/mctool-plugin')
logger.info('------------------------------------')

const apps = {
    MCServer,
    MCPush,
    MCAuth,
    help: helpApp
}

export { apps }

logger.info('MCTool-Plugin 初始化完成')
logger.info('------------------------------------')
