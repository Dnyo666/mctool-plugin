import plugin from '../../../lib/plugins/plugin.js';
import common from '../../../lib/common/common.js';

export class helpApp extends plugin {
    constructor() {
        super({
            name: 'MCTool-帮助',
            dsc: 'MC服务器管理帮助',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(mc|mctool)(插件|plugin)?(帮助|菜单|help)$',
                    fnc: 'help'
                }
            ]
        });
    }

    async help(e) {
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
#mc开启推送 - 开启玩家推送
#mc关闭推送 - 关闭玩家推送
#mc推送 <服务器ID> <玩家名/all> - 设置推送
#mc取消推送 <服务器ID> <玩家名> - 取消推送
#mc开启新人推送 - 开启新玩家提醒
#mc关闭新人推送 - 关闭新玩家提醒
#mcpushlist - 查看当前推送配置

示例：
#mc添加 生存服 play.abc.com:25565 这是一个生存服
#mc推送 1 all - 推送所有玩家的上下线
#mc推送 1 Steve - 仅推送玩家Steve的上下线
#mc取消推送 1 Steve - 取消对Steve的推送

项目地址：https://github.com/Dnyo666/mctool-plugin
交流群：303104111`;

        await e.reply(helpText);
        return true;
    }
}
