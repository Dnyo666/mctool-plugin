import fetch from 'node-fetch';
import UserData from '../../models/mcsmanager/user/userdata.js';

export default class McsAPI {
  constructor() {
    this.userData = new UserData();
  }

  /**
   * 初始化用户配置
   * @param {string} qq QQ号
   */
  async initUserConfig(qq) {
    try {
      // 检查用户是否已绑定
      if (!global.mcsUserData.isUserBound(qq)) {
        throw new Error('用户未绑定面板，请先使用 #mcs bind 命令绑定面板');
      }

      // 获取用户数据
      const userData = global.mcsUserData.getUserData(qq);
      
      // 设置API配置
      this.baseUrl = userData.baseUrl;
      this.headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json; charset=utf-8'
      };
      // API Key 作为 URL 参数
      this.apiKey = userData.apiKey;
    } catch (error) {
      logger.error(`[MCS API] 初始化用户配置失败: ${error}`);
      throw error;
    }
  }

  /**
   * 构建带 API Key 的 URL
   * @param {string} path API路径
   * @returns {string} 完整的URL
   */
  buildUrl(path) {
    const url = new URL(path, this.baseUrl);
    url.searchParams.append('apikey', this.apiKey);
    return url.toString();
  }

  /**
   * 获取面板概览数据
   * @param {string} qq QQ号
   * @returns {Promise<Object>} 概览数据
   */
  async getOverview(qq) {
    await this.initUserConfig(qq);
    try {
      const url = this.buildUrl('/api/overview');
      
      logger.debug(`[MCS API] 获取面板概览请求: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      const data = await this.handleResponse(response);

      return data;
    } catch (error) {
      logger.error(`[MCS API] 获取面板概览失败:`, error);
      throw error;
    }
  }

  /**
   * 获取错误信息
   * @param {number} status HTTP状态码
   * @returns {string} 错误信息
   */
  getErrorMessage(status) {
    const messages = {
      400: '请求参数错误',
      401: '未授权，请检查API密钥',
      403: '权限不足',
      404: '请求的资源不存在',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务暂时不可用',
      504: '网关超时'
    };
    return messages[status] || `HTTP错误 ${status}`;
  }

  /**
   * 获取用户列表
   * @param {string} qq QQ号
   * @param {Object} params 查询参数
   * @param {number} params.page 页码
   * @param {number} params.page_size 每页数量
   * @param {string} [params.userName] 用户名(可选)
   * @param {string} [params.role] 用户权限(可选)
   * @returns {Promise<Object>} 用户列表数据
   */
  async getUserList(qq, params) {
    await this.initUserConfig(qq);
    try {
      // 构建查询参数
      const queryParams = new URLSearchParams({
        userName: params.userName || '',  // 即使为空也需要带上参数
        page: params.page || 1,
        page_size: params.page_size || 20,
        role: params.role || ''  // 即使为空也需要带上参数
      });

      const url = this.buildUrl(`/api/auth/search?${queryParams}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const error = new Error(this.getErrorMessage(response.status));
        error.response = response;
        throw error;
      }

      const data = await response.json();
      if (data.status !== 200 || !data.data) {
        throw new Error(data.error || '面板返回错误状态');
      }

      return data.data;  // 直接返回处理好的数据
    } catch (error) {
      logger.error(`[MCS API] 获取用户列表失败:`, error);
      throw error;
    }
  }

  /**
   * 创建新用户
   * @param {string} qq QQ号
   * @param {Object} userData 用户数据
   * @param {string} userData.username 用户名
   * @param {string} userData.password 密码
   * @param {number} userData.permission 用户权限(1=用户,10=管理员,-1=被封禁)
   * @returns {Promise<Object>} 新创建的用户数据
   */
  async createUser(qq, userData) {
    await this.initUserConfig(qq);
    try {
      const url = this.buildUrl('/api/auth');
      
      // 记录请求数据（不包含密码）
      logger.debug(`[MCS API] 创建用户请求: ${url}`, {
        username: userData.username,
        permission: userData.permission
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: userData.username,
          password: userData.password,
          permission: userData.permission
        })
      });

      // 获取响应文本以便调试
      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        logger.error(`[MCS API] 解析响应失败: ${responseText}`);
        throw new Error('服务器响应格式错误');
      }

      if (!response.ok) {
        logger.error(`[MCS API] HTTP错误: ${response.status}`, responseData);
        throw new Error(responseData.error || this.getErrorMessage(response.status));
      }

      if (responseData.status !== 200) {
        logger.error(`[MCS API] 业务错误:`, responseData);
        throw new Error(responseData.error || '面板返回错误状态');
      }

      if (!responseData.data) {
        logger.error(`[MCS API] 响应数据缺失:`, responseData);
        throw new Error('响应数据格式错误');
      }

      const result = {
        uuid: responseData.data.uuid,
        userName: responseData.data.userName,
        permission: responseData.data.permission
      };

      logger.mark(`[MCS API] 创建用户成功: ${result.userName}`);
      return result;

    } catch (error) {
      logger.error(`[MCS API] 创建用户失败:`, error);
      // 包装错误信息，使其更友好
      throw new Error(error.message || '创建用户时发生未知错误');
    }
  }

  /**
   * 更新用户数据
   * @param {string} qq QQ号
   * @param {string} uuid 目标用户UUID
   * @param {Object} config 用户配置数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateUser(qq, uuid, config) {
    await this.initUserConfig(qq);
    try {
      const url = this.buildUrl('/api/auth');
      
      // 记录请求数据
      logger.debug(`[MCS API] 更新用户请求: ${url}`, {
        uuid,
        config: { ...config, password: '***' } // 隐藏密码
      });

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uuid,
          config
        })
      });

      // 获取响应文本以便调试
      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        logger.error(`[MCS API] 解析响应失败: ${responseText}`);
        throw new Error('服务器响应格式错误');
      }

      if (!response.ok) {
        logger.error(`[MCS API] HTTP错误: ${response.status}`, responseData);
        throw new Error(responseData.error || this.getErrorMessage(response.status));
      }

      if (responseData.status !== 200) {
        logger.error(`[MCS API] 业务错误:`, responseData);
        throw new Error(responseData.error || '面板返回错误状态');
      }

      // 获取更新后的用户信息
      const userInfo = await this.getUserList(qq, {
        page: 1,
        page_size: 20
      });
      
      const updatedUser = userInfo.data.find(user => user.uuid === uuid);
      if (!updatedUser) {
        throw new Error('无法获取更新后的用户信息');
      }

      return {
        uuid: updatedUser.uuid,
        userName: updatedUser.userName,
        permission: updatedUser.permission
      };

    } catch (error) {
      logger.error(`[MCS API] 更新用户数据失败:`, error);
      throw new Error(error.message || '更新用户时发生未知错误');
    }
  }

  /**
   * 删除用户
   * @param {string} qq QQ号
   * @param {string} uuid 目标用户UUID
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteUser(qq, uuid) {
    await this.initUserConfig(qq);
    try {
      const url = this.buildUrl('/api/auth');
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([uuid])
      });

      if (!response.ok) {
        const error = new Error(this.getErrorMessage(response.status));
        error.response = response;
        throw error;
      }

      const data = await response.json();
      if (data.status !== 200) {
        throw new Error(data.error || '面板返回错误状态');
      }

      return data.data;
    } catch (error) {
      logger.error(`[MCS API] 删除用户失败:`, error);
      throw error;
    }
  }

  /**
   * 根据用户名获取用户信息
   * @param {string} qq QQ号
   * @param {string} userName 用户名
   * @returns {Promise<Object|null>} 用户信息
   */
  async getUserByName(qq, userName) {
    try {
      const userList = await this.getUserList(qq, {
        page: 1,
        page_size: 100,
        userName: userName
      });

      const user = userList.data.find(u => u.userName === userName);
      return user || null;
    } catch (error) {
      logger.error(`[MCS API] 获取用户信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取实例列表
   * @param {string} qq QQ号
   * @param {Object} params 查询参数
   * @param {number} params.page 页码
   * @param {number} params.page_size 每页数量
   * @returns {Promise<Object>} 实例列表数据
   */
  async getInstanceList(qq, params = {}) {
    await this.initUserConfig(qq);
    try {
      // 获取用户数据
      const userData = await global.mcsUserData.getUserData(qq);
      if (!userData?.instances?.list?.[0]?.daemonId) {
        throw new Error('未找到守护进程ID，请先使用 #mcs bind 重新绑定面板');
      }

      const daemonId = userData.instances.list[0].daemonId;

      const queryParams = new URLSearchParams({
        daemonId: daemonId,
        page: params.page || 1,
        page_size: params.page_size || 20,
        instance_name: '',
        status: ''
      });

      const url = this.buildUrl(`/api/service/remote_service_instances?${queryParams}`);

      logger.debug(`[MCS API] 获取实例列表请求: ${url}`);
      logger.debug(`[MCS API] 使用守护进程ID: ${daemonId}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      const responseData = await this.handleResponse(response);
      
      return {
        page: responseData.page,
        pageSize: responseData.pageSize,
        maxPage: responseData.maxPage,
        data: (responseData.data || []).map(inst => ({
          instanceUuid: inst.instanceUuid,
          started: inst.started,
          status: inst.status,
          config: {
            nickname: inst.config?.nickname || '未命名',
            type: inst.config?.type || 'universal',
            startCommand: inst.config?.startCommand,
            stopCommand: inst.config?.stopCommand,
            createDatetime: inst.config?.createDatetime,
            lastDatetime: inst.config?.lastDatetime,
            eventTask: inst.config?.eventTask
          },
          info: {
            ...inst.info
          }
        }))
      };
    } catch (error) {
      logger.error(`[MCS API] 获取实例列表失败:`, error);
      throw error;
    }
  }

  /**
   * 获取实例详情
   * @param {string} qq QQ号
   * @param {string} instanceUuid 实例UUID
   * @returns {Promise<Object>} 实例详情
   */
  async getInstanceInfo(qq, instanceUuid) {
    await this.initUserConfig(qq);
    try {
      // 获取用户数据以获取 daemonId
      const userData = await global.mcsUserData.getUserData(qq);
      if (!userData?.instances?.list) {
        throw new Error('未找到实例信息，请先使用 #mcs bind 重新绑定面板');
      }

      // 查找对应实例的 daemonId
      const instance = userData.instances.list.find(inst => inst.instanceUuid === instanceUuid);
      if (!instance?.daemonId) {
        throw new Error('未找到该实例的守护进程ID');
      }

      const queryParams = new URLSearchParams({
        uuid: instanceUuid,
        daemonId: instance.daemonId
      });

      const url = this.buildUrl(`/api/instance?${queryParams}`);

      logger.debug(`[MCS API] 获取实例详情请求: ${url}`);
      logger.debug(`[MCS API] 使用守护进程ID: ${instance.daemonId}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      const data = await this.handleResponse(response);
      return data;
    } catch (error) {
      logger.error(`[MCS API] 获取实例详情失败:`, error);
      throw error;
    }
  }

  /**
   * 实例操作
   * @param {string} qq QQ号
   * @param {string} instanceUuid 实例UUID
   * @param {string} operation 操作类型(open/stop/restart/kill)
   * @returns {Promise<Object>} 操作结果
   */
  async instanceOperation(qq, instanceUuid, operation) {
    await this.initUserConfig(qq);
    try {
      // 获取用户数据以获取 daemonId
      const userData = await global.mcsUserData.getUserData(qq);
      if (!userData?.instances?.list) {
        throw new Error('未找到实例信息，请先使用 #mcs bind 重新绑定面板');
      }

      // 查找对应实例的 daemonId
      const instance = userData.instances.list.find(inst => inst.instanceUuid === instanceUuid);
      if (!instance?.daemonId) {
        throw new Error('未找到该实例的守护进程ID');
      }

      const queryParams = new URLSearchParams({
        uuid: instanceUuid,
        daemonId: instance.daemonId
      });

      const url = this.buildUrl(`/api/protected_instance/${operation}?${queryParams}`);

      logger.debug(`[MCS API] 实例${operation}操作请求: ${url}`);
      logger.debug(`[MCS API] 使用守护进程ID: ${instance.daemonId}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      const data = await this.handleResponse(response);
      return data;
    } catch (error) {
      logger.error(`[MCS API] 实例${operation}操作失败:`, error);
      throw error;
    }
  }

  /**
   * 统一处理API响应
   * @private
   * @param {Response} response Fetch响应对象
   * @returns {Promise<Object>} 处理后的数据
   */
  async handleResponse(response) {
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      logger.error(`[MCS API] 解析响应失败: ${responseText}`);
      throw new Error('服务器响应格式错误');
    }

    // 处理业务错误
    if (responseData.status === 500) {
      logger.error(`[MCS API] 业务错误:`, responseData);
      throw new Error(responseData.data || '操作失败');
    }

    // 处理HTTP错误
    if (!response.ok) {
      logger.error(`[MCS API] HTTP错误: ${response.status}`, responseData);
      throw new Error(responseData.error || this.getErrorMessage(response.status));
    }

    // 处理其他状态错误
    if (responseData.status !== 200) {
      logger.error(`[MCS API] 状态错误:`, responseData);
      throw new Error(responseData.error || '面板返回错误状态');
    }

    return responseData.data;
  }
}
