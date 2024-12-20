import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

class DataManager {
    constructor() {
        this.dataPath = './data/mctool'
        this.ensureDataPath()
    }

    ensureDataPath() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true })
        }
    }

    getFilePath(name) {
        return path.join(this.dataPath, `${name}.yaml`)
    }

    read(name) {
        const filePath = this.getFilePath(name)
        if (!fs.existsSync(filePath)) {
            return {}
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8')
            return YAML.parse(content) || {}
        } catch (error) {
            console.error(`[MCTool] 读取数据失败: ${error.message}`)
            return {}
        }
    }

    write(name, data) {
        const filePath = this.getFilePath(name)
        try {
            fs.writeFileSync(filePath, YAML.stringify(data))
            return true
        } catch (error) {
            console.error(`[MCTool] 写入数据失败: ${error.message}`)
            return false
        }
    }
}

export const Data = new DataManager()

export * as db from './db/index.js'
export * as bind from './bind/index.js'
export * as utils from './utils/index.js'
export * as api from './api/index.js'
export * as task from './task/index.js'
export * as help from './help/index.js'
export * as setting from './setting/index.js'
