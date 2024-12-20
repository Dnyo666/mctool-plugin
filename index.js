import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import log from '../../lib/plugins/lib/log.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 输出加载提示
log.info('------------------------------------')
log.info('MCTool-Plugin v1.0.0')
log.info('插件正在加载中...')
log.info('作者：浅巷墨黎')
log.info('QQ群：303104111')
log.info('项目地址：https://github.com/Dnyo666/mctool-plugin')
log.info('------------------------------------')

// 动态加载所有插件
const files = fs.readdirSync(join(__dirname, 'apps'))
    .filter(file => file.endsWith('.js'))

let ret = []
for (let file of files) {
    ret.push(import(`./apps/${file}`).catch(err => {
        log.error(`载入插件错误：${file}`)
        log.error(err)
        return null
    }))
}

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
    let name = files[i].replace('.js', '')
    if (ret[i].status != 'fulfilled') {
        log.error(`载入插件错误：${log.red(name)}`)
        log.error(ret[i].reason)
        continue
    }
    const mod = ret[i].value
    if (mod) {
        const keys = Object.keys(mod)
        if (keys.length > 0) {
            apps[name] = mod[keys[0]]
        }
    }
}

export { apps }

log.info('MCTool-Plugin 初始化完成')
log.info('------------------------------------')
