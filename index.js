import { MCServer } from './apps/mc-server.js'
import { MCAuth } from './apps/mc-auth.js'
import { MCPush } from './apps/mc-push.js'
import { MCAuthRequest } from './apps/mc-auth-request.js'

console.info('------------------------------------')
console.info('MCTool-Plugin v1.0.0')
console.info('插件正在加载中...')
console.info('作者：浅巷墨黎')
console.info('QQ群：303104111')
console.info('项目地址：https://github.com/Dnyo666/mctool-plugin')
console.info('------------------------------------')

const apps = {}

try {
    apps['mc-server'] = MCServer
    apps['mc-auth'] = MCAuth
    apps['mc-push'] = MCPush
    apps['mc-auth-request'] = MCAuthRequest
    console.info('[MCTool] 插件加载成功')
} catch (err) {
    console.error('[MCTool] 插件加载失败:', err)
}

export { apps }

console.info('MCTool-Plugin 初始化完成')
console.info('------------------------------------') 