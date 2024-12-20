import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 输出加载提示
console.info('------------------------------------')
console.info('MCTool-Plugin v1.0.0')
console.info('插件正在加载中...')
console.info('作者：浅巷墨黎')
console.info('QQ群：303104111')
console.info('项目地址：https://github.com/Dnyo666/mctool-plugin')
console.info('------------------------------------')

// 动态加载所有插件
const files = fs.readdirSync(join(__dirname, 'apps'))
    .filter(file => file.endsWith('.js'))

let ret = []
for (let file of files) {
    ret.push(import(`./apps/${file}`).catch(err => {
        console.error(`载入插件错误：${file}`)
        console.error(err)
        return null
    }))
}

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
    let name = files[i].replace('.js', '')
    if (ret[i].status != 'fulfilled') {
        console.error(`载入插件错误：${name}`)
        console.error(ret[i].reason)
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

console.info('MCTool-Plugin 初始化完成')
console.info('------------------------------------')
