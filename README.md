![MCTool-Plugin](https://socialify.git.ci/Dnyo666/MCTool-Plugin/image?description=1&font=Raleway&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto)

<img decoding="async" align=right src="resources/readme/background.png" width="35%">

# MCTool-Plugin 🎮

- 一个适用于 [Yunzai-Bot](https://github.com/Le-niao/Yunzai-Bot) 的 Minecraft 服务器管理插件
- 提供服务器状态监控、玩家动态推送、新玩家提醒等功能
- 支持多服务器管理、自定义推送设置等个性化配置

## 安装教程

1. 克隆项目
```bash
git clone https://github.com/Dnyo666/mctool-plugin.git ./plugins/mctool-plugin/
```

2. 进入插件目录
```bash
cd ./plugins/mctool-plugin/
```

3. 安装依赖
```bash
pnpm install
```

4. 重启云崽

## 功能介绍

<details><summary>基础功能</summary>

- [x] 服务器管理
  - 添加/删除服务器
  - 支持多服务器配置
  - 数据本地持久化存储
- [x] 状态监控
  - 实时服务器状态
  - 在线玩家统计
  - 服务器状态推送
- [x] 玩家动态
  - 玩家上下线推送
  - 新玩���提醒
  - 自定义推送配置
- [x] 推送服务
  - 群组独立配置
  - 自定义推送内容
  - 智能消息转发
- [x] 正版验证
  - 入群验证
  - 分群配置
  - 验证记录管理

</details>

## 使用指南

<details><summary>常用命令</summary>

| 命令 | 说明 | 示例 |
|------|------|------|
| #mc帮助 | 查看帮助 | #mc帮助 |
| #mc列表 | 查看服务器列表 | #mc列表 |
| #mc在线 | 查看在线玩家 | #mc在线 |
| #mc添加 | 添加服务器 | #mc添加 生存服 play.abc.com:25565 这是一个生存服 |
| #mc删除 | 删除服务器 | #mc删除 1 |
| #mc开启推送 | 开启推送 | #mc开启推送 |
| #mc推送玩家 | 设置玩家推送 | #mc推送玩家 1 Steve |
| #mc开启新人推送 | 开启指定服务器新人提醒 | #mc开启新人推送 1 |
| #mc开启状态推送 | 开启服务器在线离线推送 | #mc开启状态推送 |
| #mc开启验证 | 开启正版验证 | #mc开启验证 |

注意：所有命令中的mc不区分大小写，如#MC、#Mc均可使用

</details>

## 配置说明

<details><summary>配置项说明</summary>

主要配置项:
- 检查间隔: 服务器状态检查间隔
- 最大服务器数: 单群组最大服务器数量
- 推送格式: 自定义推送消息格式
  - 玩家上线提醒
  - 玩家下线提醒
  - 新玩家提醒
  - 服务器上线提醒
  - 服务器离线提醒
- API超时: API请求超时时间设置
- 验证设置: 正版验证相关配置
  - API地址: 验证服务器地址
  - 请求超时: 验证请求超时时间
  - 用户名长度: MC用户名最大长度限制
  - 调试模式: 是否启用调试功能

群组独立配置:
- 验证功能: 每个群可独立配置
  - 开启/关闭验证
  - 允许/禁止重复用户名
  - 自动/手动处理重复用户名

配置文件位置: `plugins/mctool-plugin/config/mctool.yaml`

</details>

## 效果展示

<details><summary>功能截图</summary>

| 功能 | 效果图 |
|------|--------|
| 服务器列表 | ![服务器列表](resources/readme/servers.png) |
| 在线玩家 | ![在线玩家](resources/readme/players.png) |
| 推送效果 | ![推送效果](resources/readme/push.png) |

</details>

## 联系方式

- QQ群: [303104111](http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=gdLRKPbtdd23Tw9M0HthGaU-PRXFToFY&authKey=ULxjgIsrwBQt74OIgbozC8aztsuHYPNvQcpERBqGf9TvUwdO2myrJxhSZTx2kwdh&noverify=0&group_code=303104111)

## 贡献者

> 🌟 感谢所有为 **MCTool-Plugin** 做出贡献的人！

<a href="https://github.com/Dnyo666/MCTool-Plugin/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Dnyo666%2FMCTool-Plugin" />
</a>

## 其他

如果觉得此插件对你有帮助的话,可以点一个 star,你的支持就是我们不断更新的动力~

## 许可证

项目采用 [MIT](./LICENSE) 许可证
