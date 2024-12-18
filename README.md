# MCTool Plugin

MCTool 是一个基于 Yunzai-Bot 的 Minecraft 服务器管理插件，提供服务器状态查询、玩家动态推送等功能。

## 功能特点

- 🖥️ **服务器管理**
  - 添加/删除服务器
  - 查看服务器状态
  - 查看在线玩家

- 📢 **动态推送**
  - 玩家上下线提醒
  - 新玩家加入提醒
  - 自定义推送格式

- ⚙️ **可视化配置**
  - 支持 Guoba 插件管理器
  - 灵活的配置选项
  - 友好的配置界面

## 安装方法

1. 在 Yunzai-Bot 根目录下执行：
```bash
git clone https://github.com/Dnyo666/mctool-plugin ./plugins/mctool-plugin/
```

2. 安装依赖：
```bash
pnpm install -P
```

3. 重启 Yunzai-Bot

## 使用方法

### 基础指令

| 指令 | 说明 | 权限 |
|------|------|------|
| #mc帮助 | 显示帮助信息 | 所有人 |
| #mc列表 | 查看服务器状态 | 所有人 |
| #mc在线 | 查看在线玩家 | 所有人 |

### 管理指令

| 指令 | 说明 | 权限 |
|------|------|------|
| #mc添加 <名称> <IP:端口> [描述] | 添加服务器 | 群管理 |
| #mc删除 <ID> | 删除服务器 | 群管理 |

### 推送指令

| 指令 | 说明 | 权限 |
|------|------|------|
| #mc开启推送 | 开启玩家推送 | 群管理 |
| #mc关闭推送 | 关闭玩家推送 | 群管理 |
| #mc推送 <服务器ID> <玩家名/all> | 设置推送目标 | 群管理 |
| #mc取消推送 <服务器ID> <玩家名> | 取消玩家推送 | 群管理 |
| #mc开启新人推送 | 开启新玩家提醒 | 群管理 |
| #mc关闭新人推送 | 关闭新玩家提醒 | 群管理 |

## 配置说明

插件配置文件位于 `config/config/mctool.yaml`：

```yaml
# 服务器状态检查间隔（分钟）
checkInterval: 1

# 每个群可添加的最大服务器数量
maxServers: 10

# 玩家动态推送消息格式
pushFormat: '【MC服务器推送】{player} 已{action} {server}'

# API超时时间（秒）
apiTimeout: 5
```

## 常见问题

**Q: 为什么无法添加服务器？**
A: 请确保：
1. 您是群管理员或群主
2. 服务器地址格式正确（IP:端口）
3. 未超过最大服务器数量限制

**Q: 为什么推送消息没有收到？**
A: 请检查：
1. 是否已开启推送功能
2. 是否已正确配置推送目标
3. 服务器是否在线

## 更新日志

### v1.0.0
- 初始版本发布
- 基础服务器管理功能
- 玩家动态推送功能
- Guoba 配置支持

## 致谢

- [Yunzai-Bot](https://github.com/Le-niao/Yunzai-Bot)
- [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin)
- [mcstatus.io](https://mcstatus.io/)

## 交流反馈

- 交流群：303104111
- 项目地址：[GitHub](https://github.com/Dnyo666/mctool-plugin)
- 作者：浅巷墨黎

## 许可证

MIT License
