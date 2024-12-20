import { Data, getConfig } from './mc-utils.js';
import pkg from 'icqq';
const { Bot } = pkg;

// 格式化推送消息
export function formatPushMessage(type, data, server) {
    const format = getConfig('pushFormat');
    
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
}

// 处理服务器状态变化
export function handleServerStatusChange(serverId, oldStatus, newStatus) {
    try {
        // 获取订阅了该服务器的群组
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
                Bot.pickGroup(groupId)?.sendMsg(message).catch(err => {
                    console.error(`[MCTool] 发送服务器状态变化消息失败: ${err.message}`);
                });
                console.debug(`[MCTool] 服务器 ${serverName} ${newStatus.online ? '上线' : '离线'} 推送至群 ${groupId}`);
            }
            
            // 如果服务器在线，检查玩家变化
            if (newStatus?.online && newStatus?.players?.list) {
                handlePlayerChanges(serverId, serverName, groupId, oldStatus, newStatus);
            }
        }
        
        // 更新当前状态
        const current = Data.read('current');
        current[serverId] = newStatus;
        Data.write('current', current);
        
    } catch (error) {
        console.error(`[MCTool] 处理服务器状态变化失败:`, error);
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
            Bot.pickGroup(groupId)?.sendMsg(message).catch(err => {
                console.error(`[MCTool] 发送玩家加入消息失败: ${err.message}`);
            });
            console.debug(`[MCTool] 玩家 ${player} ${isNew ? '首次加入' : '加入'} ${serverName} 推送至群 ${groupId}`);
        }
        
        // 处理离开的玩家
        for (const player of left) {
            const message = formatPushMessage('leave', player, serverName);
            Bot.pickGroup(groupId)?.sendMsg(message).catch(err => {
                console.error(`[MCTool] 发送玩家离开消息失败: ${err.message}`);
            });
            console.debug(`[MCTool] 玩家 ${player} 离开 ${serverName} 推送至群 ${groupId}`);
        }
        
        // 更新历史玩家记录
        if (validNewPlayers.length > 0) {
            updateHistoricalPlayers(serverId, validNewPlayers);
        }
        
        // 记录玩家变动
        updatePlayerChanges(serverId, joined, left);
        
    } catch (error) {
        console.error(`[MCTool] 处理玩家变化失败:`, error);
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
        
        // 过滤掉空值和无效值
        const validPlayers = players.filter(player => 
            player && typeof player === 'string' && player.trim().length > 0
        );
        
        // 找出新玩家
        const newPlayers = validPlayers.filter(player => 
            !historical[serverId].players.includes(player)
        );
        
        if (newPlayers.length > 0) {
            // 添加新玩家到历史记录
            historical[serverId].players.push(...newPlayers);
            historical[serverId].lastUpdate = Date.now();
            
            // 保存更新后的历史记录
            if (!Data.write('historical', historical)) {
                throw new Error('保存历史玩家记录失败');
            }
            
            console.debug(`[MCTool] 服务器 ${serverId} 新增历史玩家: ${newPlayers.join(', ')}`);
        }
        
        return newPlayers;
    } catch (error) {
        console.error(`[MCTool] 更新历史玩家记录失败:`, error);
        return [];
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
        console.error(`[MCTool] 更新玩家变动记录失败:`, error);
    }
} 