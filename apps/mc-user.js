import { Data, getPlayerUUID } from './mc-utils.js'
import common from '../../../lib/common/common.js'

export class MCUser extends plugin {
    constructor() {
        super({
            name: 'MCTool-用户',
            dsc: 'Minecraft用户名绑定和查询',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#mc绑定\\s*(.*)$',
                    fnc: 'bindUser'
                },
                {
                    reg: '^#mc解绑\\s+(.+)$',
                    fnc: 'unbindUser'
                },
                {
                    reg: '^#mc信息$',
                    fnc: 'getUserInfo'
                }
            ]
        });
    }

    /**
     * 绑定用户名
     * @param {*} e 消息事件
     * @returns {Promise<boolean>} 是否处理成功
     */
    async bindUser(e) {
        // 获取用户名参数
        const match = e.msg.match(/^#mc绑定\s*(.*)$/);
        const username = match?.[1]?.trim();
        
        if (!username) {
            await e.reply('命令格式错误\n正确用法：#mc绑定 <用户名>\n例如：#mc绑定 Notch');
            return false;
        }

        // 读取绑定数据
        const bindings = Data.read('user_bindings') || {};
        const userIndex = Data.read('username_index') || {};

        // 检查用户名是否已被绑定
        if (userIndex[username.toLowerCase()]) {
            if (userIndex[username.toLowerCase()] === e.user_id) {
                await e.reply('该用户名已经绑定到你的账号了');
            } else {
                await e.reply('该用户名已被其他QQ号绑定');
            }
            return false;
        }

        // 获取UUID
        const { uuid, raw_id } = await getPlayerUUID(username);
        if (!uuid) {
            await e.reply('无法获取该用户名的UUID，请确认用户名是否正确');
            return false;
        }

        // 添加绑定
        if (!bindings[e.user_id]) {
            bindings[e.user_id] = [];
        }
        bindings[e.user_id].push({
            username: username,
            uuid: uuid,
            raw_uuid: raw_id,
            bindTime: Date.now()
        });

        // 更新用户名索引
        userIndex[username.toLowerCase()] = e.user_id;

        // 保存数据
        Data.write('user_bindings', bindings);
        Data.write('username_index', userIndex);

        await e.reply(`成功绑定用户名: ${username}\nUUID: ${uuid}`);
        return true;
    }

    /**
     * 解绑用户名
     * @param {*} e 消息事件
     * @returns {Promise<boolean>} 是否处理成功
     */
    async unbindUser(e) {
        // 获取用户名参数
        const username = e.msg.match(/^#mc解绑\s+(.+)$/)[1].trim();
        if (!username) {
            await e.reply('请提供要解绑的用户名');
            return false;
        }

        // 读取绑定数据
        const bindings = Data.read('user_bindings') || {};
        const userIndex = Data.read('username_index') || {};

        // 检查用户名是否已被绑定
        if (!userIndex[username.toLowerCase()] || userIndex[username.toLowerCase()] !== e.user_id) {
            await e.reply('该用户名未绑定到你的账号');
            return false;
        }

        // 移除绑定
        if (bindings[e.user_id]) {
            bindings[e.user_id] = bindings[e.user_id].filter(
                bind => bind.username.toLowerCase() !== username.toLowerCase()
            );
            if (bindings[e.user_id].length === 0) {
                delete bindings[e.user_id];
            }
        }

        // 移除用户名索引
        delete userIndex[username.toLowerCase()];

        // 保存数据
        Data.write('user_bindings', bindings);
        Data.write('username_index', userIndex);

        await e.reply(`成功解绑用户名: ${username}`);
        return true;
    }

    /**
     * 查询用户信息
     * @param {*} e 消息事件
     * @returns {Promise<boolean>} 是否处理成功
     */
    async getUserInfo(e) {
        // 读取绑定数据
        const bindings = Data.read('user_bindings') || {};
        const userBindings = bindings[e.user_id] || [];

        if (userBindings.length === 0) {
            await e.reply('你还没有绑定任何用户名\n可以使用 #mc绑定 <用户名> 来绑定你的MC账号\n例如：#mc绑定 Notch');
            return false;
        }

        // 获取用户群昵称
        const memberInfo = await Bot.getGroupMemberInfo(e.group_id, e.user_id);
        const nickname = memberInfo.card || memberInfo.nickname;

        // 构建消息
        let msg = [`${nickname}的MC绑定信息：\n`];
        
        // 为每个绑定的账号构建消息
        for (const bind of userBindings) {
            const username = bind.username;
            const uuid = bind.uuid || '未知';
            const raw_uuid = bind.raw_uuid || '未知';
            const bindTime = new Date(bind.bindTime).toLocaleString();

            msg.push(
                `用户名：${username}\n`,
                `UUID：${uuid}\n`,
                `绑定时间：${bindTime}\n`
            );

            // 如果有 UUID，添加皮肤图片
            if (raw_uuid) {
                msg.push(segment.image(`https://api.mineatar.io/body/full/${raw_uuid}`));
            }
        }

        // 发送消息
        await e.reply(msg);
        return true;
    }
} 