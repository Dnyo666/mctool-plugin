import fs from 'fs'
import lodash from 'lodash'
import YAML from 'yaml'

const Path = process.cwd()
const Config_File = `${Path}/config/mctool.yaml`

// 读取配置文件
function getConfig() {
    try {
        const yaml = fs.readFileSync(Config_File, 'utf8')
        return YAML.parse(yaml)
    } catch (err) {
        logger.error('[MCTool-Plugin] 读取配置文件失败:', err)
        return {}
    }
}

// 保存配置文件
function saveConfig(config) {
    try {
        const yaml = YAML.stringify(config)
        fs.writeFileSync(Config_File, yaml, 'utf8')
        return true
    } catch (err) {
        logger.error('[MCTool-Plugin] 保存配置文件失败:', err)
        return false
    }
}

export function supportGuoba() {
    return {
        // 插件信息，将会显示在前端页面
        pluginInfo: {
            name: 'MCTool-Plugin',
            title: 'MC服务器管理',
            author: '@浅巷墨黎',
            authorLink: 'https://github.com/Dnyo666',
            link: 'https://github.com/Dnyo666/mctool-plugin',
            isV3: true,
            isV2: false,
            description: 'Minecraft服务器管理插件，提供服务器状态监控、玩家动态推送等功能',
            icon: 'mdi:minecraft',
            iconColor: '#7CBA3B',
            iconPath: ''
        },
        // 配置项信息
        configInfo: {
            schemas: [
                {
                    field: 'checkInterval',
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
                    field: 'maxServers',
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
                    field: 'apiTimeout',
                    label: 'API超时',
                    bottomHelpMessage: 'API请求超时时间（秒）',
                    component: 'InputNumber',
                    required: true,
                    componentProps: {
                        min: 1,
                        max: 30,
                        placeholder: '请输入超时时间'
                    }
                },
                {
                    field: 'pushFormat',
                    label: '推送格式',
                    bottomHelpMessage: '推送消息格式配置',
                    component: 'Group',
                    components: [
                        {
                            field: 'join',
                            label: '玩家上线',
                            bottomHelpMessage: '变量：{player}玩家名，{server}服务器名',
                            component: 'Input',
                            required: true,
                            componentProps: {
                                placeholder: '请输入上线消息格式'
                            }
                        },
                        {
                            field: 'leave',
                            label: '玩家下线',
                            bottomHelpMessage: '变量：{player}玩家名，{server}服务器名',
                            component: 'Input',
                            required: true,
                            componentProps: {
                                placeholder: '请输入下线消息格式'
                            }
                        },
                        {
                            field: 'newPlayer',
                            label: '新玩家提醒',
                            bottomHelpMessage: '变量：{player}玩家名，{server}服务器名',
                            component: 'Input',
                            required: true,
                            componentProps: {
                                placeholder: '请输入新玩家提醒格式'
                            }
                        },
                        {
                            field: 'serverOnline',
                            label: '服务器上线',
                            bottomHelpMessage: '变量：{server}服务器名',
                            component: 'Input',
                            required: true,
                            componentProps: {
                                placeholder: '请输入服务器上线消息格式'
                            }
                        },
                        {
                            field: 'serverOffline',
                            label: '服务器离线',
                            bottomHelpMessage: '变量：{server}服务器名',
                            component: 'Input',
                            required: true,
                            componentProps: {
                                placeholder: '请输入服务器离线消息格式'
                            }
                        }
                    ]
                },
                {
                    field: 'auth',
                    label: '验证配置',
                    bottomHelpMessage: '正版验证功能配置',
                    component: 'Group',
                    components: [
                        {
                            field: 'apiUrl',
                            label: 'API地址',
                            bottomHelpMessage: '验证服务器API地址',
                            component: 'Input',
                            required: true,
                            componentProps: {
                                placeholder: '请输入API地址'
                            }
                        },
                        {
                            field: 'requestTimeout',
                            label: '请求超时',
                            bottomHelpMessage: '验证请求超时时间（毫秒）',
                            component: 'InputNumber',
                            required: true,
                            componentProps: {
                                min: 1000,
                                max: 30000,
                                placeholder: '请输入超时时间'
                            }
                        },
                        {
                            field: 'maxUsernameLength',
                            label: '用户名长度',
                            bottomHelpMessage: 'MC用户名最大长度限制',
                            component: 'InputNumber',
                            required: true,
                            componentProps: {
                                min: 3,
                                max: 26,
                                placeholder: '请输入最大长度'
                            }
                        },
                        {
                            field: 'debug',
                            label: '调试模式',
                            bottomHelpMessage: '是否开启调试模式',
                            component: 'Switch'
                        }
                    ]
                }
            ],
            getConfigData() {
                return getConfig()
            },
            setConfigData(data, { Result }) {
                if (saveConfig(data)) {
                    return Result.ok({}, '保存成功~')
                } else {
                    return Result.error('保存失败！')
                }
            }
        }
    }
}
