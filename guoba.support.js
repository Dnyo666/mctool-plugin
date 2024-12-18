import lodash from 'lodash'
import { Config } from '#components'
import { setting } from '#models'
import { CONFIG } from './apps/mc-utils.js'

export function supportGuoba() {
    return {
        // 插件信息
        pluginInfo: {
            name: 'mctool-plugin',
            title: 'MCTool',
            author: CONFIG.author,
            authorLink: CONFIG.github,
            link: CONFIG.github,
            isV3: true,
            isV2: false,
            description: CONFIG.pluginDesc,
            // 使用Minecraft相关图标
            icon: 'mdi:minecraft'
        },
        // 配置信息
        configInfo: {
            // 配置项
            schemas: [
                {
                    field: 'mctool.checkInterval',
                    label: '检查间隔',
                    bottomHelpMessage: '服务器状态检查间隔（分钟）',
                    component: 'InputNumber',
                    required: true,
                    componentProps: {
                        min: 1,
                        max: 60,
                        placeholder: '请输入检查间隔'
                    }
                },
                {
                    field: 'mctool.maxServers',
                    label: '最大服务器数',
                    bottomHelpMessage: '每个群可添加的最大服务器数量',
                    component: 'InputNumber',
                    required: true,
                    componentProps: {
                        min: 1,
                        max: 100,
                        placeholder: '请输入最大服务器数'
                    }
                },
                {
                    field: 'mctool.pushFormat',
                    label: '推送格式',
                    bottomHelpMessage: '玩家动态推送消息格式',
                    component: 'Input',
                    required: true,
                    componentProps: {
                        placeholder: '例如：【MC服务器推送】{player} 已{action} {server}'
                    }
                },
                {
                    field: 'mctool.apiTimeout',
                    label: 'API超时',
                    bottomHelpMessage: '服务器状态查询超时时间（秒）',
                    component: 'InputNumber',
                    required: true,
                    componentProps: {
                        min: 1,
                        max: 30,
                        placeholder: '请输入超时时间'
                    }
                }
            ],

            // 获取配置数据
            getConfigData() {
                const data = {}
                for (const file of Config.files) {
                    const name = file.replace('.yaml', '')
                    data[name] = Config.getDefOrConfig(name)
                }
                return data
            },

            // 设置配置数据
            setConfigData(data, { Result }) {
                const config = Config.getCfg()

                for (const key in data) {
                    const split = key.split('.')
                    if (lodash.isEqual(config[split[1]], data[key])) continue
                    Config.modify(split[0], split[1], data[key])
                }
                return Result.ok({}, '保存成功')
            }
        }
    }
}
