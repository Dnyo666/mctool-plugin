import { get } from './utils/request.js'

/**
 * 查询服务器状态
 * @param {string} address 服务器地址
 * @returns {Promise<Object>} 服务器状态信息
 */
export async function queryServerStatus(address) {
    try {
        const [host, port = '25565'] = address.split(':')
        const response = await get(`https://api.mcstatus.io/v2/status/java/${host}:${port}`)
        const data = response.data

        return {
            online: data.online,
            players: {
                online: data.players?.online || 0,
                max: data.players?.max || 0,
                list: data.players?.list?.map(p => p.name_clean || p.name) || []
            },
            version: data.version?.name_clean || data.version?.name,
            description: data.motd?.clean || data.motd?.raw
        }
    } catch (error) {
        console.error(`[MCTool] 查询服务器状态失败: ${error.message}`)
        return {
            online: false,
            players: {
                online: 0,
                max: 0,
                list: []
            }
        }
    }
} 