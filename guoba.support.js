import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Data, getConfig } from './apps/mc-utils.js'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 支持锅巴
export function supportGuoba() {
    return {
        // 插件信息
        pluginInfo: {
            name: 'mctool-plugin',
            title: 'MC服务器列表管理',
            author: '@浅巷墨黎',
            authorLink: 'https://github.com/Dnyo666',
            link: 'https://github.com/Dnyo666/mctool-plugin',
            isV3: true,
            isV2: false,
            description: 'Minecraft服务器列表管理插件',
            icon: 'minecraft:grass_block',
            version: '1.0.0'
        },
        
        // 配置项信息
        configInfo: {
            schemas: [
                {
                    field: 'checkInterval',
                    label: '检查间隔',
                    bottomHelpMessage: '服务器状态检查间隔（cron表达式）',
                    component: 'Input',
                    required: true,
                    defaultValue: '*/1 * * * *'
                },
                {
                    field: 'maxServers',
                    label: '最大服务器数',
                    bottomHelpMessage: '每个群可添加的最大服务器数量',
                    component: 'InputNumber',
                    required: true,
                    defaultValue: 10
                },
                {
                    field: 'apis',
                    label: 'API配置',
                    bottomHelpMessage: '服务器状态查询API配置',
                    component: 'GTags',
                    componentProps: {
                        allowAdd: true,
                        allowDel: true,
                        showPrompt: true,
                        promptProps: {
                            title: '添加API',
                            fields: [
                                {
                                    field: 'name',
                                    label: 'API名称',
                                    component: 'Input',
                                    required: true
                                },
                                {
                                    field: 'url',
                                    label: 'API地址',
                                    component: 'Input',
                                    required: true
                                },
                                {
                                    field: 'timeout',
                                    label: '超时时间',
                                    component: 'InputNumber',
                                    required: true,
                                    defaultValue: 30
                                },
                                {
                                    field: 'maxRetries',
                                    label: '最大重试次数',
                                    component: 'InputNumber',
                                    required: true,
                                    defaultValue: 3
                                },
                                {
                                    field: 'retryDelay',
                                    label: '重试延迟',
                                    component: 'InputNumber',
                                    required: true,
                                    defaultValue: 1000
                                }
                            ]
                        }
                    }
                },
                {
                    field: 'pushFormat',
                    label: '推送消息格式',
                    bottomHelpMessage: '推送消息格式配置',
                    component: 'GTags',
                    componentProps: {
                        allowAdd: false,
                        allowDel: false,
                        showPrompt: true,
                        promptProps: {
                            title: '编辑消息格式',
                            fields: [
                                {
                                    field: 'join',
                                    label: '玩家加入',
                                    component: 'Input',
                                    required: true
                                },
                                {
                                    field: 'leave',
                                    label: '玩家离开',
                                    component: 'Input',
                                    required: true
                                },
                                {
                                    field: 'newPlayer',
                                    label: '新玩家加入',
                                    component: 'Input',
                                    required: true
                                },
                                {
                                    field: 'serverOnline',
                                    label: '服务器上线',
                                    component: 'Input',
                                    required: true
                                },
                                {
                                    field: 'serverOffline',
                                    label: '服务器离线',
                                    component: 'Input',
                                    required: true
                                }
                            ]
                        }
                    }
                },
                {
                    field: 'defaultGroup',
                    label: '默认群组配置',
                    bottomHelpMessage: '新群组的默认配置',
                    component: 'GTags',
                    componentProps: {
                        allowAdd: false,
                        allowDel: false,
                        showPrompt: true,
                        promptProps: {
                            title: '编辑默认配置',
                            fields: [
                                {
                                    field: 'enabled',
                                    label: '推送开关',
                                    component: 'Switch',
                                    defaultValue: false
                                },
                                {
                                    field: 'serverStatusPush',
                                    label: '状态推送',
                                    component: 'Switch',
                                    defaultValue: false
                                },
                                {
                                    field: 'newPlayerAlert',
                                    label: '新人提醒',
                                    component: 'Switch',
                                    defaultValue: false
                                }
                            ]
                        }
                    }
                },
                {
                    field: 'verification',
                    label: '验证功能配置',
                    bottomHelpMessage: '玩家验证功能配置',
                    component: 'GTags',
                    componentProps: {
                        allowAdd: false,
                        allowDel: false,
                        showPrompt: true,
                        promptProps: {
                            title: '编辑验证配置',
                            fields: [
                                {
                                    field: 'enabled',
                                    label: '验证功能',
                                    component: 'Switch',
                                    defaultValue: false
                                },
                                {
                                    field: 'expireTime',
                                    label: '过期时间',
                                    component: 'InputNumber',
                                    required: true,
                                    defaultValue: 86400
                                },
                                {
                                    field: 'maxRequests',
                                    label: '最大请求数',
                                    component: 'InputNumber',
                                    required: true,
                                    defaultValue: 5
                                }
                            ]
                        }
                    }
                }
            ],
            
            // 获取配置数据
            getConfigData() {
                return getConfig()
            },
            
            // 设置配置数据
            setConfigData(data, { Result }) {
                const config = {}
                for (const [key, value] of Object.entries(data)) {
                    if (value !== undefined && value !== '') {
                        config[key] = value
                    }
                }
                
                const configFile = path.join(__dirname, 'config', 'config.yaml')
                try {
                    fs.writeFileSync(configFile, YAML.stringify(config))
                    return Result.ok({}, '保存成功~')
                } catch (err) {
                    return Result.error('保存失败：' + err.message)
                }
            }
        }
    }
}
