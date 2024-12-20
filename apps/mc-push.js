import { Data, getConfig } from './mc-utils.js'
import { logger } from '#lib'

// 格式化推送消息
function formatPushMessage(type, data, server) {
    try {
        const format = getConfig('pushFormat') || {
            join: '{player} 加入了服务器 {server}',
            leave: '{player} 离开了服务器 {server}',
            newPlayer: '新玩家 {player} 加入了服务器 {server}',
            serverOnline: '服务器 {server} 已上线',
            serverOffline: '服务器 {server} 已离线'
        }
        
        switch (type) {
            case 'join':
                return format.join.replace('{player}', data).replace('{server}', server)
            case 'leave':
                return format.leave.replace('{player}', data).replace('{server}', server)
            case 'new':
                return format.newPlayer.replace('{player}', data).replace('{server}', server)
            case 'online':
                return format.serverOnline.replace('{server}', server)
            case 'offline':
                return format.serverOffline.replace('{server}', server)
            default:
                return ''
        }
    } catch (error) {
        logger.error('格式化推送消息失败:', error)
        return `${type === 'online' ? '上线' : type === 'offline' ? '离线' : data} - ${server}`
    }
}

// 处理玩家变化
function handlePlayerChanges(serverId, serverName, groupId, oldStatus, newStatus) {
    try {
        const oldPlayers = oldStatus?.players?.list || []
        const newPlayers = newStatus?.players?.list || []
        
        // 获取群组配置
        const groupConfig = Data.getGroupData('push', groupId)
        if (!groupConfig.enabled) return
        
        // 获取服务器配置
        const serverConfig = groupConfig.servers?.[serverId]
        if (!serverConfig) return
        
        const messages = []
        
        // 检查服务器状态变化
        if (groupConfig.statusPush) {
            if (!oldStatus.online && newStatus.online) {
                messages.push(formatPushMessage('online', null, serverName))
            } else if (oldStatus.online && !newStatus.online) {
                messages.push(formatPushMessage('offline', null, serverName))
            }
        }
        
        // 检查玩家变化
        if (serverConfig.players.includes('all') || serverConfig.players.length > 0) {
            const joinedPlayers = newPlayers.filter(player => !oldPlayers.includes(player))
            const leftPlayers = oldPlayers.filter(player => !newPlayers.includes(player))
            
            for (const player of joinedPlayers) {
                if (serverConfig.players.includes('all') || serverConfig.players.includes(player)) {
                    messages.push(formatPushMessage('join', player, serverName))
                }
                
                // 检查新玩家提醒
                if (serverConfig.newPlayerAlert && !Data.getGroupData('players', groupId)[player]) {
                    messages.push(formatPushMessage('new', player, serverName))
                    // 记录玩家
                    const players = Data.getGroupData('players', groupId)
                    players[player] = { firstSeen: Date.now() }
                    Data.saveGroupData('players', groupId, players)
                }
            }
            
            for (const player of leftPlayers) {
                if (serverConfig.players.includes('all') || serverConfig.players.includes(player)) {
                    messages.push(formatPushMessage('leave', player, serverName))
                }
            }
        }
        
        return messages
    } catch (error) {
        logger.error(`处理玩家变化失败:`, error)
    }
}

export { formatPushMessage, handlePlayerChanges } 