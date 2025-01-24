import McsAPI from '../../../components/mcsmanager/mcs-api.js'

export default class McsInstanceApp {
  constructor() {
    this.mcsApi = new McsAPI()
  }

  /**
   * 获取实例状态名称
   * @param {number} state 状态码
   * @returns {string} 状态名称
   */
  getStateName(state) {
    const states = {
      '-1': '忙碌',
      0: '停止',
      1: '停止中',
      2: '启动中',
      3: '运行中'
    }
    return states[state] || '未知状态'
  }

  /**
   * 获取实例列表
   * @param {string} userId QQ号
   * @param {Object} params 查询参数
   * @returns {Promise<Object>} 实例列表
   */
  async getInstanceList(userId, params = {}) {
    try {
      // 检查用户是否已绑定
      if (!global.mcsUserData.isUserBound(userId)) {
        throw new Error('请先使用 #mcs bind 命令绑定面板')
      }

      const result = await this.mcsApi.getInstanceList(userId, {
        page: params.page || 1,
        page_size: params.page_size || 10
      })

      return {
        success: true,
        page: result.page,
        pageSize: result.pageSize,
        maxPage: result.maxPage,
        instances: result.data.map(inst => ({
          uuid: inst.instanceUuid,
          name: inst.config.nickname,
          type: inst.config.type,
          state: inst.status,
          started: inst.started,
          stateName: this.getStateName(inst.status),
          createTime: inst.config.createDatetime,
          lastTime: inst.config.lastDatetime,
          autoStart: inst.config.eventTask?.autoStart || false,
          autoRestart: inst.config.eventTask?.autoRestart || false
        }))
      }
    } catch (error) {
      logger.error(`[MCS Instance] 获取实例列表失败:`, error)
      throw error
    }
  }

  /**
   * 获取实例详情
   * @param {string} userId QQ号
   * @param {string} instanceUuid 实例UUID
   * @returns {Promise<Object>} 实例详情
   */
  async getInstanceInfo(userId, instanceUuid) {
    try {
      const instance = await this.mcsApi.getInstanceInfo(userId, instanceUuid);
      return {
        success: true,
        instance: {
          uuid: instance.instanceUuid,
          started: instance.started,  // 启动次数
          status: instance.status,    // 实例状态
          stateName: this.getStateName(instance.status),
          config: {
            name: instance.config?.nickname || '未命名',
            type: instance.config?.type || 'universal',
            startCommand: instance.config?.startCommand || '',
            stopCommand: instance.config?.stopCommand || '',
            updateCommand: instance.config?.updateCommand || '',
            cwd: instance.config?.cwd || '',
            createTime: instance.config?.createDatetime,
            lastTime: instance.config?.lastDatetime,
            endTime: instance.config?.endTime || 0,
            processType: instance.config?.processType || 'general',
            fileCode: instance.config?.fileCode || 'utf8',
            crlf: instance.config?.crlf || 1,
            category: instance.config?.category || 0,
            encoding: {
              ie: instance.config?.ie || 'utf8',
              oe: instance.config?.oe || 'utf8'
            },
            terminal: {
              haveColor: instance.config?.terminalOption?.haveColor || false,
              pty: instance.config?.terminalOption?.pty || true,
              windowCol: instance.config?.terminalOption?.ptyWindowCol || 164,
              windowRow: instance.config?.terminalOption?.ptyWindowRow || 40
            },
            eventTask: {
              autoStart: instance.config?.eventTask?.autoStart || false,
              autoRestart: instance.config?.eventTask?.autoRestart || false,
              ignore: instance.config?.eventTask?.ignore || false
            },
            docker: {
              containerName: instance.config?.docker?.containerName || '',
              image: instance.config?.docker?.image || '',
              memory: instance.config?.docker?.memory || 0,
              cpuUsage: instance.config?.docker?.cpuUsage || 0,
              maxSpace: instance.config?.docker?.maxSpace || 0,
              networkMode: instance.config?.docker?.networkMode || 'bridge',
              workingDir: instance.config?.docker?.workingDir || '/workspace/',
              ports: instance.config?.docker?.ports || [],
              env: instance.config?.docker?.env || []
            },
            rcon: {
              enable: instance.config?.enableRcon || false,
              password: instance.config?.rconPassword || '',
              port: instance.config?.rconPort || 0,
              ip: instance.config?.rconIp || ''
            }
          },
          process: {
            cpu: instance.processInfo?.cpu || 0,
            memory: instance.processInfo?.memory || 0,
            uptime: instance.processInfo?.elapsed || 0,
            ctime: instance.processInfo?.ctime || 0,
            timestamp: instance.processInfo?.timestamp || 0,
            pid: instance.processInfo?.pid || 0,
            ppid: instance.processInfo?.ppid || 0
          },
          info: {
            currentPlayers: instance.info?.currentPlayers || 0,
            maxPlayers: instance.info?.maxPlayers || 0,
            version: instance.info?.version || '',
            fileLock: instance.info?.fileLock || 0,
            mcPingOnline: instance.info?.mcPingOnline || false,
            openFrpStatus: instance.info?.openFrpStatus || false,
            latency: instance.info?.latency || 0
          },
          space: instance.space || 0
        }
      };
    } catch (error) {
      logger.error(`[MCS Instance] 获取实例详情失败:`, error);
      throw error;
    }
  }

  /**
   * 实例操作
   * @param {string} userId QQ号
   * @param {string} instanceUuid 实例UUID
   * @param {string} operation 操作类型
   * @returns {Promise<Object>} 操作结果
   */
  async instanceOperation(userId, instanceUuid, operation) {
    try {
      await this.mcsApi.instanceOperation(userId, instanceUuid, operation)
      return {
        success: true,
        message: `实例${operation}操作已执行`
      }
    } catch (error) {
      logger.error(`[MCS Instance] 实例${operation}操作失败:`, error)
      throw error
    }
  }

  /**
   * 发送实例命令
   * @param {string} userId QQ号
   * @param {string} instanceUuid 实例UUID
   * @param {string} command 命令内容
   * @returns {Promise<Object>} 发送结果
   */
  async sendCommand(userId, instanceUuid, command) {
    try {
      await this.mcsApi.sendCommand(userId, instanceUuid, command)
      return {
        success: true,
        message: '命令已发送'
      }
    } catch (error) {
      logger.error(`[MCS Instance] 发送命令失败:`, error)
      throw error
    }
  }

  /**
   * 获取实例日志
   * @param {string} userId QQ号
   * @param {string} instanceUuid 实例UUID
   * @returns {Promise<Object>} 日志数据
   */
  async getInstanceLog(userId, instanceUuid) {
    try {
      const log = await this.mcsApi.getInstanceLog(userId, instanceUuid)
      return {
        success: true,
        log: log
      }
    } catch (error) {
      logger.error(`[MCS Instance] 获取实例日志失败:`, error)
      throw error
    }
  }
} 