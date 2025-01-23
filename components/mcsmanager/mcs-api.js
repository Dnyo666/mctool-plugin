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
   * 获取所有实例列表
   * @param {string} qq QQ号
   * @returns {Promise<Array>} 实例列表
   */
  async getInstances(qq) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(`${this.baseUrl}/api/instance/overview`, {
        method: 'GET',
        headers: this.headers
      });
      return await response.json();
    } catch (error) {
      logger.error(`获取实例列表失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取指定实例状态
   * @param {string} qq QQ号
   * @param {string} instanceId 实例ID
   * @returns {Promise<Object>} 实例状态信息
   */
  async getInstanceStatus(qq, instanceId) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(`${this.baseUrl}/api/instance/${instanceId}/status`, {
        method: 'GET',
        headers: this.headers
      });
      return await response.json();
    } catch (error) {
      logger.error(`获取实例状态失败: ${error}`);
      throw error;
    }
  }

  /**
   * 启动实例
   * @param {string} qq QQ号
   * @param {string} instanceId 实例ID
   * @returns {Promise<Object>} 操作结果
   */
  async startInstance(qq, instanceId) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(`${this.baseUrl}/api/instance/${instanceId}/start`, {
        method: 'PUT',
        headers: this.headers
      });
      return await response.json();
    } catch (error) {
      logger.error(`启动实例失败: ${error}`);
      throw error;
    }
  }

  /**
   * 停止实例
   * @param {string} qq QQ号
   * @param {string} instanceId 实例ID
   * @returns {Promise<Object>} 操作结果
   */
  async stopInstance(qq, instanceId) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(`${this.baseUrl}/api/instance/${instanceId}/stop`, {
        method: 'PUT',
        headers: this.headers
      });
      return await response.json();
    } catch (error) {
      logger.error(`停止实例失败: ${error}`);
      throw error;
    }
  }

  /**
   * 发送命令到实例
   * @param {string} qq QQ号
   * @param {string} instanceId 实例ID
   * @param {string} command 命令内容
   * @returns {Promise<Object>} 操作结果
   */
  async sendCommand(qq, instanceId, command) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(`${this.baseUrl}/api/instance/${instanceId}/command`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({ command })
      });
      return await response.json();
    } catch (error) {
      logger.error(`发送命令失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取实例终端日志
   * @param {string} qq QQ号
   * @param {string} instanceId 实例ID
   * @param {number} lines 日志行数
   * @returns {Promise<Array>} 日志内容
   */
  async getInstanceLogs(qq, instanceId, lines = 100) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(`${this.baseUrl}/api/instance/${instanceId}/logs?lines=${lines}`, {
        method: 'GET',
        headers: this.headers
      });
      return await response.json();
    } catch (error) {
      logger.error(`获取实例日志失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取面板概览数据
   * @param {string} qq QQ号
   * @returns {Promise<Object>} 概览数据
   */
  async getOverview(qq) {
    await this.initUserConfig(qq);
    try {
      const response = await fetch(this.buildUrl('/api/overview'), {
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
      logger.error(`[MCS API] 获取概览数据失败:`, error);
      throw error;
    }
  }

  /**
   * 获取错误信息
   * @param {number} status HTTP状态码
   * @returns {string} 错误信息
   */
  getErrorMessage(status) {
    switch (status) {
      case 400:
        return '请求参数错误';
      case 401:
        return 'API密钥无效或已过期';
      case 403:
        return '没有访问权限，请检查API密钥权限';
      case 404:
        return '请求的资源不存在';
      case 500:
        return '面板服务器内部错误';
      case 502:
        return '面板服务器网关错误';
      case 503:
        return '面板服务器暂时不可用';
      case 504:
        return '面板服务器网关超时';
      default:
        return `面板请求失败 (HTTP ${status})`;
    }
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
}
