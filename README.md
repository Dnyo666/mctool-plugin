![MCTool-Plugin](https://socialify.git.ci/Dnyo666/MCTool-Plugin/image?description=1&font=Raleway&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto)

<img decoding="async" align=right src="resources/readme/background.png" width="35%">

# MC工具箱插件🎮

基于 Yunzai-Bot v3 的 Minecraft 服务器管理插件，支持服务器状态查询、玩家绑定、进群验证等功能。

## 提醒事项

- 当前存在api问题而导致服务器状态被反复推送，不建议开启服务器状态推送，玩家上下线无关

- 后续考虑给出自建api的解决方案(待办ing)

- 当前已启用云端数据库，本地仅存该机器人的数据，如果有被他人绑定的账号，请联系插件开发者处理（进群：303104111）

## 功能介绍

- [x] 群服务器列表管理
  - 添加/删除服务器
  - 支持多服务器配置
  - 数据本地持久化存储
  - 查询服务器MOTD
- [x] 推送功能
  - 实时服务器状态
  - 在线玩家统计
  - 服务器状态推送
  - 玩家上下线推送
  - 新玩家提醒
- [x] 玩家功能
  - 云端数据功能，本地仅存该机器人的数据，自动向上同步
  - 绑定正版用户名
  - 解绑正版用户名
  - 查看已绑定正版用户名
  - 查询玩家UUID
  - 渲染玩家头像
  - 渲染玩家3D皮肤
- [x] 进群验证
  - 正版账户入群验证
  - 分群配置
  - 验证记录管理
- [x] 其他功能
  - Mod搜索、下载


## 安装方法

1. 在 Yunzai-Bot 根目录下执行：

* 使用 Github

```bash
git clone https://github.com/Dnyo666/mctool-plugin.git ./plugins/mctool-plugin/
```

* 使用 Gitee

```bash
git clone https://gitee.com/Dnyo666/mctool-plugin.git ./plugins/mctool-plugin/
```

2. 进入插件目录
```bash
cd ./plugins/mctool-plugin
```

3. 在插件目录下执行
```bash
pnpm install
```

4. 重启 Yunzai-Bot 

## 使用说明

### 基础指令
- `#mc帮助` - 显示帮助信息
- `#mc列表` - 查看服务器列表
- `#mc在线` - 查看在线服务器及玩家列表
- `#mc状态` - 查看服务器状态
- `#mcmotd <服务器地址[:端口]>` - 查询指定服务器MOTD

### 玩家相关
- `#mc绑定 mojang/littleskin <玩家名>` - 绑定MC玩家名
- `#mc信息` - 查看绑定信息
- `#mc解绑 mojang/littleskin <玩家名>` - 解除指定玩家名的绑定
- `#mc头像 [全身|半身|头部] [玩家名]（可选）` - 生成玩家头像，不指定玩家名时生成所有绑定账号的头像
- `#mc服务状态` - 查看公用头像服务状态和3D渲染服务状态
- `#mcid <玩家名>（可选）` - 查询玩家UUID，默认查询绑定账号
- `#mc皮肤渲染` - 使用行走视图渲染已绑定账号的皮肤，生成高清3D渲染图

### 皮肤渲染预览

<div align="center">
  <div style="display: inline-block; text-align: center; margin: 10px;">
    <p><b>行走视图渲染</b></p>
    <img src="resources/readme/walking-view.png" width="400" alt="行走视图渲染示例">
  </div>
  <div style="display: inline-block; text-align: center; margin: 10px;">
    <p><b>站立视图渲染</b></p>
    <img src="resources/readme/standing-view.png" width="440" alt="站立视图渲染示例">
  </div>
</div>

### 管理指令
- `#mc添加 <名称> <IP:端口> [描述]` - 添加服务器
- `#mc删除 <ID>` - 删除指定服务器

### 推送设置
- `#mc推送` - 查看当前推送配置
- `#mc开启推送 <ID>` - 开启指定服务器的推送
- `#mc关闭推送 <ID>` - 关闭指定服务器的推送
- `#mc开启状态推送 <ID>` - 开启服务器状态推送
- `#mc关闭状态推送 <ID>` - 关闭服务器状态推送
- `#mc推送玩家 <ID> <玩家名/all>` - 添加玩家推送
- `#mc取消推送玩家 <ID> <玩家名/all>` - 取消玩家推送
- `#mc开启新人推送 <ID>` - 开启新玩家提醒
- `#mc关闭新人推送 <ID>` - 关闭新玩家提醒

### 验证设置
- `#mc验证` - 查看当前验证配置
- `#mc验证开启` - 开启验证功能
- `#mc验证关闭` - 关闭验证功能
- `#mc验证重复使用开启` - 允许重复使用玩家名
- `#mc验证重复使用关闭` - 禁止重复使用玩家名
- `#mc验证拒绝开启` - 开启自动拒绝重复用户名
- `#mc验证拒绝关闭` - 关闭自动拒绝重复用户名
- `#mc验证列表` - 查看已验证用户
- `#mc验证删除 <玩家名>` - 删除验证记录

### 用户设置
- `#mc绑定 用户名` - 绑定正版用户名
- `#mc解绑 用户名` - 解绑正版用户名
- `#mc信息` - 查看已绑定正版用户名

### Mod功能
- `#mcmod帮助` - 显示MCTool Mod帮助信息
- `#mcmod搜索 <关键词>` - 搜索指定关键词的Mod
- `#mcmod版本 <序号/modid> [版本号] [加载器]` - 搜索指定关键词的Mod版本
- `#mcmod下载 <序号/modid> [版本号] [加载器]` - 下载指定版本的Mod
- `#mcmod下载 <版本序号>` - 下载版本列表中指定版本的Mod

## 配置说明

> 推荐使用锅巴面板进行可视化配置，更加直观和便捷。

配置文件位于 `plugins/mctool-plugin/config/config.yaml`，包含以下配置项：

<details>
<summary>API配置</summary>

```yaml
apis:
  - name: mcsrvstat
    url: https://api.mcsrvstat.us/3/{host}:{port}
    timeout: 30
    maxRetries: 3
    retryDelay: 1000
    parser:
      online: online
      players:
        online: players.online
        max: players.max
        list: players.list[].name
      version: version.name_clean
      motd: motd.clean[]

  - name: mcstatus
    url: https://api.mcstatus.io/v2/status/java/{host}:{port}
    timeout: 30
    maxRetries: 3
    retryDelay: 1000
    parser:
      online: online
      players:
        online: players.online
        max: players.max
        list: players.list[].name_clean
      version: version.name_clean
      motd: motd.clean[]
```
</details>

<details>
<summary>定时任务配置</summary>

```yaml
schedule:
  cron: "30 * * * * *"  # 每分钟的第30秒执行
  startupNotify: true   # 是否在机器人启动时发送服务器状态推送
  retryDelay: 5000      # 重试等待时间（毫秒）
```
</details>

<details>
<summary>数据存储配置</summary>

```yaml
dataPath: data/mctool  # 数据存储路径
```
</details>

<details>
<summary>默认群组配置</summary>

```yaml
defaultGroup:
  enabled: false        # 是否默认开启功能
  serverStatusPush: false  # 是否默认开启服务器状态推送
  newPlayerAlert: false    # 是否默认开启新玩家提醒
```
</details>

<details>
<summary>验证配置</summary>

```yaml
verification:
  enabled: false        # 是否默认开启验证
  expireTime: 86400     # 验证请求过期时间（秒）
  maxRequests: 5        # 最大验证请求数
```
</details>

<details>
<summary>皮肤渲染配置</summary>

```yaml
skin:
  use3D: true  # 是否使用3D渲染
  renderType: 1  # 渲染方案选择 (1: 行走视图, 2: 站立视图)
  # 渲染方案一配置（行走视图）
  render1:
    server: 'https://skin2.qxml.ltd'  # 渲染服务器地址
    definition: 1.5  # 图片清晰度
    transparent: true  # 是否透明背景
  # 渲染方案二配置（站立视图）
  render2:
    server: 'http://skin.qxml.ltd'  # 渲染服务器地址
    endpoint: '/render'  # 渲染接口路径
    width: 300   # 渲染宽度
    height: 600  # 渲染高度
```
</details>

<details>
<summary>Mod搜索配置</summary>

```yaml
mod:
  # 是否启用mod下载功能，不影响搜索和版本查询
  enableDownload: true
  # 默认mod源 (可选值: modrinth, curseforge)
  defaultSource: 'curseforge' 
```

</details>

## 3D渲染接口部署

> 3D渲染原项目（行走&站立视角）（不支持api）：https://github.com/bs-community/skinview3d

 一、站立视角API项目地址：https://github.com/Dnyo666/skinview3d-api
 
 **注意：** 
 
 1. 目前只测试了Windows环境，其他环境未测试
 2. 部署时需要修改config.yaml中的server和endpoint
 3. 默认端口为3006，可根据项目内文档进行更改，同时请注意插件内配置
> 公用API：http://skin.qxml.ltd 由九九系只喵提供（3500039980）

二、行走视角API项目地址：https://github.com/SerinaNya/SkinRenderMC

**注意：** 

1. 行走视角API项目可自行部署，且需要修改config.yaml中的server
2. 部署方法详见项目页，使用docker快速部署
3. 浅巷墨黎提供公用API：http://skin2.qxml.ltd

## 注意事项

1. 服务器状态查询使用了 mcsrvstat 和 mcstatus 两个API，确保网络能够正常访问。
2. 进群验证功能需要群管理员权限。
3. 推送功能会定期检查服务器状态，请合理设置检查间隔。
4. 玩家名绑定会通过 PlayerDB API 验证玩家名的有效性。


## TODO
- 优化：
  - [ ] 优化定时任务
  - [x] 改为debug模式
  - [ ] 添加超时重试机制
  - [ ] 优化错误处理
  - [x] 数据自动迁移同步
- 功能：
  - [ ] littleskin绑定（加急中）
  - [ ] MUA高校联合绑定（咕咕咕）
  - [ ] 附魔计算器
  - [ ] 百科查询
  - [ ] 指令备忘录
  - [ ] 玩家在线状态查询
  - [x] 玩家绑定信息云端
  - [x] 3D渲染皮肤（#mc信息）
  - [x] mc头像渲染(感谢Natsusomekeishi/MCCAG)
  - [x] 服务状态查询
  - [x] mod搜索下载
- 文档：
  - [ ] 添加详细的配置说明
  - [ ] 添加常见问题解答
  - [ ] 编写开发者文档

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

项目采用 [GPL-3.0](./LICENSE) 许可证，这意味着：

1. 您可以自由使用、修改和分发本软件
2. 如果您分发修改后的版本，必须同样遵循 GPL-3.0 协议
3. 您必须公开源代码
4. 您必须保留原作者的版权声明
