import plugin from '../../../lib/plugins/plugin.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import common from '../../../lib/common/common.js';
import schedule from 'node-schedule';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据存储目录
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'MCServer');
const PATHS = {
    alias: path.join(DATA_DIR, 'servers.json'),
    current: path.join(DATA_DIR, 'currentPlayers.json'),
    changes: path.join(DATA_DIR, 'playerChanges.json'),
    subscriptions: path.join(DATA_DIR, 'groupSubscriptions.json'),
    historical: path.join(DATA_DIR, 'historicalPlayers.json')
};

export class MCServer extends plugin {
    constructor() {
        super({
            name: 'MCServer',
            dsc: 'Minecraft服务器状态查询与管理',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#mc帮助$',
                    fnc: 'showTextHelp'
                },
                {
                    reg: '^#mc列表$',
                    fnc: 'getServersStatus'
                },
                {
                    reg: '^#mc添加\\s+.+\\s+.+\\s*.*$',
                    fnc: 'addServer'
                },
                {
                    reg: '^#mc删除\\s+\\d+$',
                    fnc: 'deleteServer'
                },
                {
                    reg: '^#mc在线$',
                    fnc: 'getOnlinePlayers'
                },
                {
                    reg: '^#mc(开启|关闭)推送$',
                    fnc: 'togglePush'
                },
                {
                    reg: '^#mc推送\\s+\\S+\\s+\\S+',
                    fnc: 'configurePlayerPush'
                },
                {
                    reg: '^#mc(开启|关闭)新人推送$',
                    fnc: 'toggleNewPlayerAlert'
                },
                {
                    reg: '^#mc取消推送\\s+\\S+\\s+\\S+',
                    fnc: 'cancelPush'
                }
            ]
        });

        this.init();
        this.startMonitoring();
    }

    async init() {
        // 确保数据目录存在
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // 初始化所有数据文件
        for (const filePath of Object.values(PATHS)) {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '{}', 'utf8');
            }
        }
    }

    // 启动服务器状态监控
    startMonitoring() {
        schedule.scheduleJob('*/1 * * * *', async () => {
            await this.checkServerStatus();
        });
    }

    // 检查服务器状态
    async checkServerStatus() {
        try {
            const currentData = JSON.parse(fs.readFileSync(PATHS.current, 'utf8'));
            const subscriptions = JSON.parse(fs.readFileSync(PATHS.subscriptions, 'utf8'));

            for (const [serverId, serverData] of Object.entries(currentData)) {
                const newPlayerList = await this.fetchServerPlayers(serverId);
                if (!newPlayerList) continue;

                const changes = this.detectPlayerChanges(serverData.players || [], newPlayerList);
                if (changes.join.length > 0 || changes.leave.length > 0) {
                    await this.notifyGroups(serverId, changes, subscriptions);
                }

                // 检查新玩家
                for (const groupId of Object.keys(subscriptions)) {
                    if (subscriptions[groupId].enabled && subscriptions[groupId].servers[serverId]) {
                        await this.checkNewPlayers(serverId, newPlayerList, groupId);
                    }
                }

                // 更新当前玩家列表
                currentData[serverId].players = newPlayerList;
            }

            fs.writeFileSync(PATHS.current, JSON.stringify(currentData, null, 2));
        } catch (error) {
            console.error('服务器状态检查失败:', error);
        }
    }

    // 获取服务器玩家列表
    async fetchServerPlayers(address) {
        try {
            const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(address)}`);
            const data = await response.json();
            return data.online ? (data.players.list || []).map(p => p.name_clean) : [];
        } catch (error) {
            console.error(`获取服务器 ${address} 玩家列表失败:`, error);
            return null;
        }
    }

    // 检测玩家变动
    detectPlayerChanges(oldPlayers, newPlayers) {
        const join = newPlayers.filter(p => !oldPlayers.includes(p));
        const leave = oldPlayers.filter(p => !newPlayers.includes(p));
        return { join, leave };
    }

    // 发送群组通知
    async notifyGroups(serverId, changes, subscriptions) {
        for (const [groupId, config] of Object.entries(subscriptions)) {
            if (!config.enabled) continue;

            const serverConfig = config.servers[serverId];
            if (!serverConfig) continue;

            const messages = [];
            
            for (const player of changes.join) {
                if (serverConfig.players.includes('all') || serverConfig.players.includes(player)) {
                    messages.push(`【MC服务器推送】${player} 已进入 ${serverConfig.serverName}`);
                }
            }

            for (const player of changes.leave) {
                if (serverConfig.players.includes('all') || serverConfig.players.includes(player)) {
                    messages.push(`【MC服务器推送】${player} 已离开 ${serverConfig.serverName}`);
                }
            }

            if (messages.length > 0) {
                Bot.pickGroup(groupId).sendMsg(messages.join('\n'));
            }
        }
    }

    // 发送转发消息
    async sendForwardMsg(e, messages) {
        try {
            if (!messages.length) return;
            const msg = await common.makeForwardMsg(e, messages, '服务器状态信息');
            await e.reply(msg);
        } catch (error) {
            console.error('发送转发消息失败:', error);
            e.reply('发送消息失败，请稍后重试');
        }
    }

    // 命令处理函数
    async addServer(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
            e.reply('您没有权限添加服务器');
            return;
        }

        try {
            const match = e.msg.match(/^#mc添加\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc添加 [名称] [地址:端口] [描述]');
                return;
            }

            const [, name, address, description = '无描述'] = match;
            const servers = JSON.parse(fs.readFileSync(PATHS.alias, 'utf8'));
            
            if (!servers[e.group_id]) {
                servers[e.group_id] = [];
            }

            if (servers[e.group_id].some(s => s.address === address)) {
                e.reply('该服务器地址已存在');
                return;
            }

            const id = servers[e.group_id].length > 0 
                ? Math.max(...servers[e.group_id].map(s => s.id)) + 1 
                : 1;

            servers[e.group_id].push({ id, name, address, description });
            fs.writeFileSync(PATHS.alias, JSON.stringify(servers, null, 2));
            
            e.reply(`服务器添加成功\n名称: ${name}\n地址: ${address}\n描述: ${description}`);
        } catch (error) {
            console.error('添加服务器失败:', error);
            e.reply('添加服务器失败，请稍后重试');
        }
    }

    async deleteServer(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
            e.reply('您没有权限删除服务器');
            return;
        }

        try {
            const serverId = parseInt(e.msg.match(/\d+/)[0]);
            const servers = JSON.parse(fs.readFileSync(PATHS.alias, 'utf8'));

            if (!servers[e.group_id] || !servers[e.group_id].length) {
                e.reply('该群未添加任何服务器');
                return;
            }

            const index = servers[e.group_id].findIndex(s => s.id === serverId);
            if (index === -1) {
                e.reply(`未找到ID为 ${serverId} 的服务器`);
                return;
            }

            servers[e.group_id].splice(index, 1);
            fs.writeFileSync(PATHS.alias, JSON.stringify(servers, null, 2));
            
            e.reply(`已删除ID为 ${serverId} 的服务器`);
        } catch (error) {
            console.error('删除服务器失败:', error);
            e.reply('删除服务器失败，请稍后重试');
        }
    }

    async getServersStatus(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        try {
            const servers = JSON.parse(fs.readFileSync(PATHS.alias, 'utf8'));
            if (!servers[e.group_id] || !servers[e.group_id].length) {
                e.reply('该群未添加任何服务器\n请管理员使用 #mc添加 添加服务器');
                return;
            }

            const statusList = await Promise.all(servers[e.group_id].map(async server => {
                try {
                    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(server.address)}`);
                    const data = await response.json();
                    const status = data.online ? '在线🟢' : '离线🔴';
                    const players = data.online ? `${data.players.online}/${data.players.max}` : '0/0';

                    return `ID: ${server.id}\n名称: ${server.name}\n地址: ${server.address}\n描述: ${server.description}\n状态: ${status}\n在线人数: ${players}`;
                } catch (error) {
                    return `ID: ${server.id}\n名称: ${server.name}\n地址: ${server.address}\n描述: ${server.description}\n状态: 离线🔴`;
                }
            }));

            if (statusList.length >= 5) {
                await this.sendForwardMsg(e, statusList);
            } else {
                e.reply(statusList.join('\n\n'));
            }
        } catch (error) {
            console.error('获取服务器状态失败:', error);
            e.reply('获取服务器状态失败，请稍后重试');
        }
    }

    async getOnlinePlayers(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        try {
            const servers = JSON.parse(fs.readFileSync(PATHS.alias, 'utf8'));
            if (!servers[e.group_id] || !servers[e.group_id].length) {
                e.reply('该群未添加任何服务器\n请管理员使用 #mc添加 添加服务器');
                return;
            }

            let totalPlayers = 0;
            const playersList = await Promise.all(servers[e.group_id].map(async server => {
                try {
                    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(server.address)}`);
                    const data = await response.json();
                    
                    if (!data.online) {
                        return {
                            message: `服务器: ${server.name}\n状态: 离线🔴`,
                            playerCount: 0
                        };
                    }

                    const players = data.players.list || [];
                    const playerNames = players.map(p => p.name_clean).join('\n');
                    totalPlayers += players.length;

                    return {
                        message: `服务器: ${server.name}\n状态: 在线🟢\n在线人数: ${data.players.online}/${data.players.max}\n在线玩家:\n${playerNames || '暂无玩家在线'}`,
                        playerCount: players.length
                    };
                } catch (error) {
                    return {
                        message: `服务器: ${server.name}\n状态: 离线🔴`,
                        playerCount: 0
                    };
                }
            }));

            const needForward = playersList.some(s => s.playerCount > 10) || totalPlayers > 15;
            const messages = playersList.map(s => s.message);

            if (needForward) {
                await this.sendForwardMsg(e, messages);
            } else {
                e.reply(messages.join('\n\n'));
            }
        } catch (error) {
            console.error('获取在线玩家失败:', error);
            e.reply('获取在线玩家失败，请稍后重试');
        }
    }

    async showTextHelp(e) {
        const helpText = `MC服务器管理系统
版本：1.0.0
作者：浅巷墨黎

基础指令：
#mc帮助 - 显示本帮助
#mc列表 - 查看服务器列表
#mc在线 - 查看在线玩家

管理指令：
#mc添加 <名称> <IP:端口> [描述] - 添加服务器
#mc删除 <ID> - 删除指定服务器

推送设置：
#mc开启推��� - 开启玩家推送
#mc关闭推送 - 关闭玩家推送
#mc推送 <服务器ID> <玩家名/all> - 设置推送
#mc取消推送 <服务器ID> <玩家名> - 取消推送
#mc开启新人推送 - 开启新玩家提醒
#mc关闭新人推送 - 关闭新玩家提醒

提示：使用 #mc插件帮助 可查看图文帮助

项目地址：https://github.com/Dnyo666/MCServer-plugin
交流群：303104111`;

        e.reply(helpText);
    }

    // 开启/关闭推送
    async togglePush(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
            e.reply('您没有权限操作推送功能');
            return;
        }

        try {
            const isEnable = e.msg.includes('开启');
            const subscriptions = JSON.parse(fs.readFileSync(PATHS.subscriptions, 'utf8'));
            
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            subscriptions[e.group_id].enabled = isEnable;
            fs.writeFileSync(PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
            
            e.reply(`已${isEnable ? '开启' : '关闭'}推送功能`);
        } catch (error) {
            console.error('操作推送功能失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    // 配置玩家推送
    async configurePlayerPush(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
            e.reply('您没有权限配置推送');
            return;
        }

        try {
            const match = e.msg.match(/^#mc推送\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc推送 <服务器ID> <玩家名/all>');
                return;
            }

            const [, serverId, playerName] = match;
            const servers = JSON.parse(fs.readFileSync(PATHS.alias, 'utf8'));
            const subscriptions = JSON.parse(fs.readFileSync(PATHS.subscriptions, 'utf8'));

            // 检查服务器是否存在
            const server = servers[e.group_id]?.find(s => s.id === parseInt(serverId));
            if (!server) {
                e.reply('未找到指定的服务器');
                return;
            }

            // 初始化订阅配置
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: true,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            if (!subscriptions[e.group_id].servers[server.id]) {
                subscriptions[e.group_id].servers[server.id] = {
                    serverName: server.name,
                    players: []
                };
            }

            const serverConfig = subscriptions[e.group_id].servers[server.id];

            // 处理 'all' 特殊情况
            if (playerName.toLowerCase() === 'all') {
                serverConfig.players = ['all'];
                fs.writeFileSync(PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
                e.reply(`已设置推送 ${server.name} 的所有玩家动态`);
                return;
            }

            // 添加指定玩家
            if (!serverConfig.players.includes(playerName) && serverConfig.players[0] !== 'all') {
                serverConfig.players.push(playerName);
                fs.writeFileSync(PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
                e.reply(`已添加对玩家 ${playerName} 的动态推送`);
            } else {
                e.reply('该玩家已在推送列表中');
            }
        } catch (error) {
            console.error('配置推送失败:', error);
            e.reply('配置推送失败，请稍后重试');
        }
    }

    // 开启/关闭新玩家提醒
    async toggleNewPlayerAlert(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
            e.reply('您没有权限操作新玩家提醒');
            return;
        }

        try {
            const isEnable = e.msg.includes('开启');
            const subscriptions = JSON.parse(fs.readFileSync(PATHS.subscriptions, 'utf8'));
            
            if (!subscriptions[e.group_id]) {
                subscriptions[e.group_id] = {
                    enabled: false,
                    servers: {},
                    newPlayerAlert: false
                };
            }

            subscriptions[e.group_id].newPlayerAlert = isEnable;
            fs.writeFileSync(PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
            
            e.reply(`已${isEnable ? '开启' : '关闭'}新玩家提醒`);
        } catch (error) {
            console.error('操作新玩家提醒失败:', error);
            e.reply('操作失败，请稍后重试');
        }
    }

    // 取消玩家推送
    async cancelPush(e) {
        if (!e.isGroup) {
            e.reply('该功能仅限群聊使用');
            return;
        }

        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        if (!(['owner', 'admin'].includes(memberInfo.role) || e.isMaster)) {
            e.reply('您没有权限取消推送');
            return;
        }

        try {
            const match = e.msg.match(/^#mc取消推送\s+(\S+)\s+(\S+)$/);
            if (!match) {
                e.reply('格式错误\n用法: #mc取消推送 <服务器ID> <玩家名>');
                return;
            }

            const [, serverId, playerName] = match;
            const subscriptions = JSON.parse(fs.readFileSync(PATHS.subscriptions, 'utf8'));

            if (!subscriptions[e.group_id]?.servers[serverId]) {
                e.reply('未找到该服务器的推送配置');
                return;
            }

            const serverConfig = subscriptions[e.group_id].servers[serverId];
            const playerIndex = serverConfig.players.indexOf(playerName);

            if (playerIndex === -1) {
                e.reply('该玩家不在推送列表中');
                return;
            }

            // 移除玩家
            serverConfig.players.splice(playerIndex, 1);
            fs.writeFileSync(PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
            
            e.reply(`已取消对玩家 ${playerName} 的动态推送`);
        } catch (error) {
            console.error('取消推送失败:', error);
            e.reply('取消推送失败，请稍后重试');
        }
    }

    // 检查新玩家
    async checkNewPlayers(serverId, newPlayers, groupId) {
        try {
            const historical = JSON.parse(fs.readFileSync(PATHS.historical, 'utf8'));
            if (!historical[serverId]) {
                historical[serverId] = [];
            }

            const newPlayersList = newPlayers.filter(player => !historical[serverId].includes(player));
            if (newPlayersList.length > 0) {
                historical[serverId].push(...newPlayersList);
                fs.writeFileSync(PATHS.historical, JSON.stringify(historical, null, 2));

                const subscriptions = JSON.parse(fs.readFileSync(PATHS.subscriptions, 'utf8'));
                if (subscriptions[groupId]?.newPlayerAlert) {
                    const serverName = subscriptions[groupId].servers[serverId]?.serverName || '未知服务器';
                    const message = `【新玩家提醒】\n服务器: ${serverName}\n新玩家: ${newPlayersList.join(', ')}`;
                    Bot.pickGroup(groupId).sendMsg(message);
                }
            }
        } catch (error) {
            console.error('检查新玩家失败:', error);
        }
    }
} 