import { Data, getConfig } from './mc-utils.js';
import logger from '../models/logger.js';

// 格式化推送消息
function formatPushMessage(type, data, server) {
    try {
        const format = getConfig('pushFormat') || {
            join: '{player} 加入了服务器 {server}',
            leave: '{player} 离开了服务器 {server}',
            newPlayer: '新玩家 {player} 加入了服务器 {server}',
            serverOnline: '服务器 {server} 已上线',
            serverOffline: '服务器 {server} 已离线'
        };
        
        switch (type) {
            case 'join':
                return format.join.replace('{player}', data).replace('{server}', server);
            case 'leave':
                return format.leave.replace('{player}', data).replace('{server}', server);
            case 'new':
                return format.newPlayer.replace('{player}', data).replace('{server}', server);
            case 'online':
                return format.serverOnline.replace('{server}', server);
            case 'offline':
                return format.serverOffline.replace('{server}', server);
            default:
                return '';
        }
    } catch (error) {
        logger.error('格式化推送消息失败:', error);
        return `${type === 'online' ? '上线' : type === 'offline' ? '离线' : data} - ${server}`;
    }
}

// 处理玩家变化
function handlePlayerChanges(serverId, serverName, groupId, oldStatus, newStatus) {
    try {
        const oldPlayers = oldStatus?.players?.list || [];
        const newPlayers = newStatus.players.list;
        
        const validOldPlayers = oldPlayers.filter(p => p && !p.includes('§') && !p.includes('排队'));
        const validNewPlayers = newPlayers.filter(p => p && !p.includes('§') && !p.includes('排队'));
        
        const joined = validNewPlayers.filter(player => !validOldPlayers.includes(player));
        const left = validOldPlayers.filter(player => !validNewPlayers.includes(player));
        
        // 处理新加入的玩家
        for (const player of joined) {
            const isNew = !Data.read('historical')?.[serverId]?.players?.includes(player);
            const message = formatPushMessage(
                isNew ? 'new' : 'join',
                player,
                serverName
            );
            global.Bot.pickGroup(groupId)?.sendMsg(message).catch(err => {
                logger.error(`发送玩家加入消息失败: ${err.message}`);
            });
        }
        
        // 处理离开的玩家
        for (const player of left) {
            const message = formatPushMessage('leave', player, serverName);
            global.Bot.pickGroup(groupId)?.sendMsg(message).catch(err => {
                logger.error(`发送玩家离开消息失败: ${err.message}`);
            });
        }
        
        // 更新历史玩家记录
        if (validNewPlayers.length > 0) {
            updateHistoricalPlayers(serverId, validNewPlayers);
        }
        
        // 记录玩家变动
        updatePlayerChanges(serverId, joined, left);
    } catch (error) {
        logger.error(`处理玩家变化失败:`, error);
    }
}

// 更新历史玩家记录
function updateHistoricalPlayers(serverId, players) {
    try {
        const historical = Data.read('historical') || {};
        if (!historical[serverId]) {
            historical[serverId] = {
                players: [],
                lastUpdate: 0
            };
        }
        
        const validPlayers = players.filter(player => 
            player && typeof player === 'string' && player.trim().length > 0
        );
        
        const newPlayers = validPlayers.filter(player => 
            !historical[serverId].players.includes(player)
        );
        
        if (newPlayers.length > 0) {
            historical[serverId].players.push(...newPlayers);
            historical[serverId].lastUpdate = Date.now();
            Data.write('historical', historical);
        }
    } catch (error) {
        logger.error(`更新历史玩家记录失败:`, error);
    }
}

// 更新玩家变动记录
function updatePlayerChanges(serverId, joined, left) {
    try {
        const changes = Data.read('changes');
        if (!changes[serverId]) {
            changes[serverId] = { join: [], leave: [] };
        }
        if (joined.length > 0) {
            changes[serverId].join.push(...joined);
        }
        if (left.length > 0) {
            changes[serverId].leave.push(...left);
        }
        Data.write('changes', changes);
    } catch (error) {
        logger.error(`更新玩家变动记录失败:`, error);
    }
}

// 处理服务器状态变化
export async function handleServerStatusChange(serverId, oldStatus, newStatus) {
    try {
        const subscriptions = Data.read('subscriptions');
        const servers = Data.read('servers');
        const serverName = servers[serverId]?.name || serverId;
        
        // 遍历所有群组
        for (const [groupId, groupConfig] of Object.entries(subscriptions)) {
            if (!groupConfig?.servers?.[serverId]?.enabled) continue;
            
            // 检查服务器状态变化
            if (oldStatus?.online !== newStatus?.online) {
                const message = formatPushMessage(
                    newStatus.online ? 'online' : 'offline',
                    null,
                    serverName
                );
                global.Bot.pickGroup(groupId)?.sendMsg(message).catch(err => {
                    logger.error(`发送服务器状态变化消息失败: ${err.message}`);
                });
            }
            
            // 如果服务器在线，检查玩家变化
            if (newStatus?.online && newStatus?.players?.list) {
                await handlePlayerChanges(serverId, serverName, groupId, oldStatus, newStatus);
            }
        }
        
        // 更新当前状态
        const current = Data.read('current');
        current[serverId] = newStatus;
        Data.write('current', current);
    } catch (error) {
        logger.error(`处理服务器状态变化失败:`, error);
    }
} 