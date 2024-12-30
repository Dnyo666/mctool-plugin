import common from '../../../lib/common/common.js';

export class helpApp extends plugin {
    constructor() {
        super({
            name: 'MCTool-帮助',
            dsc: 'MC工具箱帮助',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(mc|MC)(help|帮助|菜单)$',
                    fnc: 'help'
                }
            ]
        });
    }

    async help(e) {
        // 准备转发消息
        const forwardMsgs = [];

        // 基本信息
        forwardMsgs.push(
            `MC工具箱\n` +
            `版本：V2.3\n` +
            `作者：浅巷墨黎\n`
        );

        // 基础指令
        forwardMsgs.push(
            `基础指令：\n` +
            `#mc帮助 - 显示本帮助\n` +
            `#mc列表 - 查看服务器列表\n` +
            `#mc在线 - 查看在线服务器及玩家列表`
        );

        // 管理指令
        forwardMsgs.push(
            `管理指令：\n` +
            `#mc添加 <名称> <IP:端口> [描述] - 添加服务器\n` +
            `#mc删除 <ID> - 删除指定服务器`
        );

        // 推送设置
        forwardMsgs.push(
            `推送设置：\n` +
            `#mc开启/关闭推送 [ID] - 开启或关闭推送\n` +
            `#mc开启/关闭状态推送 [ID] - 开启或关闭服务器状态推送\n` +
            `#mc推送玩家 <ID> <玩家名/all> - 添加玩家推送\n` +
            `#mc开启/关闭新人推送 <ID> - 开启或关闭新玩家提醒\n` +
            `#mc取消推送玩家 <ID> <玩家名/all> - 取消玩家推送\n` +
            `#mc推送 - 查看当前推送配置`
        );

        // 验证设置
        forwardMsgs.push(
            `验证设置：\n` +
            `#mc验证 - 查看当前验证配置\n` +
            `#mc验证 开启/关闭 - 开启或关闭验证功能\n` +
            `#mc验证重复使用 开启/关闭 - 设置是否允许重复用户名\n` +
            `#mc验证拒绝 开启/关闭 - 设置是否自动拒绝重复用户名\n` +
            `#mc验证列表 - 查看已验证用户`
        );

        // 用户设置
        forwardMsgs.push(
            `用户设置：\n` +
            `#mc绑定 用户名 - 绑定正版用户名\n` +
            `#mc解绑 用户名 - 解绑正版用户名\n` +
            `#mc信息 - 查看已绑定正版用户名uuid和皮肤`
        );

        // 使用合并转发发送消息
        const forwardMsg = await common.makeForwardMsg(e, forwardMsgs, 'MC服务器管理帮助');
        await e.reply(forwardMsg);
    }
}
