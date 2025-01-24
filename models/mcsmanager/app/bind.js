import UserData from '../user/userdata.js';

export default class McsBindApp {
  constructor() {
    this.userData = new UserData();
  }

  /**
   * 解析绑定命令
   * @param {string} command 命令内容
   * @returns {Object|null} 解析结果
   */
  parseBindCommand(command) {
    // 移除命令前缀并分割参数
    const params = command.replace(/^#?(MCS|mcs) ?(绑定|bind)\s*/, '').trim().split(/\s+/);
    
    if (params.length !== 2) {
      return null;
    }

    const [url, apiKey] = params;
    
    // 验证URL格式
    try {
      new URL(url);
    } catch (error) {
      return null;
    }

    return { url, apiKey };
  }

  /**
   * 执行绑定操作
   * @param {string} userId 用户ID
   * @param {string} url MCS Manager URL
   * @param {string} apiKey API密钥
   * @returns {Promise<boolean>} 绑定结果
   */
  async bindMcsManager(userId, url, apiKey) {
    try {
      await this.userData.updateUserData(userId, {
        baseUrl: url,
        apiKey: apiKey
      });
      return true;
    } catch (error) {
      logger.error(`[MCS Bind] 绑定失败: ${error}`);
      return false;
    }
  }

  /**
   * 获取帮助信息
   * @returns {string} 帮助信息
   */
  getHelpMessage() {
    return 'MCS绑定帮助：\n命令格式：#mcs bind URL API密钥\n例如：#mcs bind http://localhost:23333 your-api-key';
  }

  /**
   * 获取错误提示
   * @returns {string} 错误提示
   */
  getErrorMessage() {
    return '格式错误！\n命令格式：#mcs bind URL API密钥\n例如：#mcs bind http://localhost:23333 your-api-key';
  }
}
