import plugin from '../../../../lib/plugins/plugin.js'
import McsInfo from '../../models/mcsmanager/app/info.js'

// #mcs overview 获取面板概览信息
// #mcs users 获取用户列表·

export class MCSManagerInfo extends plugin {
  constructor() {
    super({
      name: 'MCSManager-信息',
      dsc: '获取MCSManager面板信息',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#?(mcs|MCS)\\s*(概览|overview)$',
          fnc: 'overview'
        },
        {
          reg: '^#?(mcs|MCS)\\s*(用户列表|users)\\s*(\\d+)?$',
          fnc: 'users'
        }
      ]
    })

    this.info = new McsInfo()
  }

  /**
   * 获取面板概览信息
   * @param {*} e 消息对象
   * @returns {Promise<boolean>} 是否处理成功
   */
  async overview(e) {
    try {
      // 检查用户是否已绑定
      if (!global.mcsUserData.isUserBound(e.user_id)) {
        await e.reply('请先使用 #mcs bind 命令绑定面板');
        return false;
      }

      const data = await this.info.getOverview(e.user_id)

      // 构建消息
      const msg = [
        '============= MCS Manager 概览 =============',
        `面板版本：${data.version}`,
        `守护进程版本：${data.daemonVersion}`,
        '',
        '[ 系统信息 ]',
        `系统类型：${data.system.type} (${data.system.platform})`,
        `系统版本：${data.system.release}`,
        `内核版本：${data.system.version}`,
        `Node版本：${data.system.node}`,
        `主机名称：${data.system.hostname}`,
        `运行时间：${data.system.uptime}`,
        `CPU使用率：${data.system.cpu}`,
        `系统负载：${data.system.loadavg[0].toFixed(2)}, ${data.system.loadavg[1].toFixed(2)}, ${data.system.loadavg[2].toFixed(2)} (1/5/15分钟)`,
        `内存使用：${data.system.memory.used}/${data.system.memory.total} (${data.system.memory.usage})`,
        data.system.user ? [
          `运行用户：${data.system.user.username}`,
          `用户目录：${data.system.user.homedir}`,
          `用户Shell：${data.system.user.shell}`,
          `用户权限：UID=${data.system.user.uid} GID=${data.system.user.gid}`
        ].join('\n') : '',
        '',
        '[ 进程信息 ]',
        `运行时间：${data.process.uptime}`,
        `CPU使用率：${data.process.cpu}`,
        `内存使用：${data.process.memory.used}/${data.process.memory.total} (${data.process.memory.usage})`,
        `工作目录：${data.process.cwd}`,
        '',
        '[ 实例统计 ]',
        `实例数量：${data.status.running}/${data.status.instance} (运行中/总数)`,
        `远程节点：${data.status.available}/${data.status.remote} (可用/总数)`,
        '',
        '[ 守护进程信息 ]',
        data.daemon ? [
          `版本：${data.daemon.version}`,
          `地址：${data.daemon.address}`,
          `备注：${data.daemon.remarks}`,
          `状态：${data.daemon.available ? '在线' : '离线'}`
        ].join('\n') : '未连接守护进程',
        '',
        '[ 访问统计 ]',
        data.record ? [
          `成功登录：${data.record.logined} 次`,
          `登录失败：${data.record.loginFailed} 次`,
          `非法访问：${data.record.illegalAccess} 次`,
          `封禁IP数：${data.record.bannedIPs} 个`
        ].join('\n') : '无统计数据',
        '============================================'
      ].filter(Boolean).join('\n');

      await e.reply(msg);
      return true;
    } catch (error) {
      logger.error(`[MCS Info] 获取概览信息失败:`, error)
      
      // 根据错误类型返回不同的提示
      let message = '获取面板信息失败，请检查面板连接状态。'
      
      if (error.message.includes('未绑定')) {
        message = '请先使用 #mcs bind 命令绑定面板'
      } else if (error.message.includes('API密钥')) {
        message = '面板连接失败：API密钥无效或已过期，请重新绑定面板'
      } else if (error.message.includes('权限')) {
        message = '面板连接失败：没有访问权限，请检查API密钥权限'
      } else if (error.message.includes('无法连接')) {
        message = '面板连接失败：无法连接到面板服务器，请检查面板地址是否正确'
      } else if (error.message.includes('网络请求失败')) {
        message = '面板连接失败：网络请求失败，请检查网络连接'
      }
      
      await e.reply(message)
      return false
    }
  }

  /**
   * 获取用户列表
   * @param {*} e 消息对象
   * @returns {Promise<boolean>} 是否处理成功
   */
  async users(e) {
    try {
      // 检查用户是否已绑定
      if (!global.mcsUserData.isUserBound(e.user_id)) {
        await e.reply('请先使用 #mcs bind 命令绑定面板');
        return false;
      }

      // 获取页码参数
      const page = parseInt(e.msg.match(/\d+/)?.[0] || '1');
      
      const data = await this.info.getUserList(e.user_id, {
        page,
        pageSize: 10
      });

      if (data.users.length === 0) {
        await e.reply('暂无用户数据');
        return true;
      }

      // 构建消息
      const msg = [
        '============= MCS Manager 用户列表 =============',
        `第 ${data.page}/${data.totalPage} 页，共 ${data.total} 个用户`,
        '',
        ...data.users.map(user => [
          `[ ${user.username} ]`,
          `用户ID：${user.id}`,
          `权限等级：${user.role}`,
          `创建时间：${user.createTime}`,
          `最后登录：${user.lastLoginTime}`,
          `双因素认证：${user.is2FAEnabled ? '已开启' : '未开启'}`,
          `API密钥：${user.apiKey ? '已设置' : '未设置'}`,
          user.instances.length > 0 ? `实例数量：${user.instances.length}` : '无实例',
          ''
        ].join('\n')),
        `提示：使用 #mcs users <页码> 查看其他页`,
        '============================================='
      ].join('\n');

      await e.reply(msg);
      return true;
    } catch (error) {
      logger.error(`[MCS Info] 获取用户列表失败:`, error);
      
      let message = '获取用户列表失败，请检查面板连接状态。';
      
      if (error.message.includes('未绑定')) {
        message = '请先使用 #mcs bind 命令绑定面板';
      } else if (error.message.includes('API密钥')) {
        message = '面板连接失败：API密钥无效或已过期，请重新绑定面板';
      } else if (error.message.includes('权限')) {
        message = '面板连接失败：没有访问权限，请检查API密钥权限';
      }
      
      await e.reply(message);
      return false;
    }
  }
}
