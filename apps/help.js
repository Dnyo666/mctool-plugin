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
                    reg: '^#?([Mm][Cc]|[Mm][Cc][Tt][Oo][Oo][Ll])(插件|plugin)?(帮助|菜单|help)$',
                    fnc: 'help'
                }
            ]
        });
    }

    async help(e) {
        const helpText = `MC服务器管理系统
版本：V2.1
作者：浅巷墨黎

基础指令：
#mc帮助 - 显示本帮助
#mc列表 - 查看服务器列表
#mc在线 - 查看在线服务器及玩家列表

管理指令：
#mc添加 <名称> <IP:端口> [描述] - 添加服务器
#mc删除 <ID> - 删除指定服务器

推送设置：
#mc开启推送 - 开启玩家推送
#mc关闭推送 - 关闭玩家推送
#mc推送玩家 <服务器ID/IP> <玩家名/all> - 设置推送
#mc取消推送 <服务器ID/IP> <玩家名> - 取消推送
#mc开启新人推送 <服务器ID/IP> - 开启指定服务器新玩家提醒
#mc关闭新人推送 <服务器ID/IP> - 关闭指定服务器新玩家提醒
#mc开启状态推送 - 开启服务器在线离线推送
#mc关闭状态推送 - 关闭服务器在线离线推送
#mcpushlist - 查看当前推送配置

验证设置：
#mc验证 - 查看当前验证配置
#mc验证 开启/关闭 - 开启或关闭验证功能
#mc验证重复使用 开启/关闭 - 设置是否允许重复用户名
#mc验证拒绝 开启/关闭 - 设置是否自动拒绝重复用户名
#mc验证列表 - 查看已验证用户
#mc验证删除 <序号> - 删除指定验证记录

示例：
#mc添加 生存服 play.abc.com:25565 这是一个生存服
#mc推送玩家 1 all - 推送所有玩家的上下线
#mc推送玩家 1 Steve - 仅推送玩家Steve的上下线
#mc取消推送 1 Steve - 取消对Steve的推送
#mc开启新人推送 1 - 开启ID为1的服务器新人提醒
#mc开启新人推送 play.abc.com:25565 - 开启指定服务器新人提醒
#mc验证 开启 - 开启正版验证功能
#mc验证重复使用 关闭 - 禁止重复使用用户名

注意：所有命令中的mc不区分大小写，如#MC、#Mc均可使用

项目地址：https://github.com/Dnyo666/mctool-plugin
交流群：303104111`;

        await e.reply(helpText);
        return true;
    }
}
