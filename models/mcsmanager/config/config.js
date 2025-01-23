import fs from 'fs';
import YAML from 'yaml';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class McsConfig {
  constructor() {
    const configRoot = path.join(process.cwd(), 'plugins/mctool-plugin/config');
    this.configPath = path.join(configRoot, 'mcsconfig.yaml');
    this.defaultConfigPath = path.join(configRoot, 'default_mcsconfig.yaml');
    this.config = null;
  }

  /**
   * 深度合并对象
   * @param {Object} target 用户配置
   * @param {Object} source 默认配置
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, source) {
    const merged = { ...target };
    
    for (const key in source) {
      if (!(key in target)) {
        // 如果用户配置中没有这个键，添加它
        merged[key] = source[key];
      } else if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // 如果是对象，递归合并
        merged[key] = this.deepMerge(target[key], source[key]);
      }
      // 如果用户配置中有这个键，保留用户的值
    }
    
    return merged;
  }

  /**
   * 检查并更新配置
   */
  async checkAndUpdate() {
    try {
      // 读取默认配置
      const defaultConfig = YAML.parse(fs.readFileSync(this.defaultConfigPath, 'utf8'));
      if (!defaultConfig) {
        throw new Error('默认配置文件格式错误');
      }

      // 合并配置，保留用户配置，添加新功能
      const updatedConfig = this.deepMerge(this.config, defaultConfig);
      
      // 检查是否有更新
      if (JSON.stringify(this.config) !== JSON.stringify(updatedConfig)) {
        this.config = updatedConfig;
        // 写入更新后的配置
        fs.writeFileSync(this.configPath, YAML.stringify(this.config), 'utf8');
        logger.info('[MCS Config] 配置已更新，新功能已添加');
      }
    } catch (error) {
      logger.error(`[MCS Config] 检查更新失败: ${error}`);
      throw error;
    }
  }

  /**
   * 初始化配置
   */
  async initialize() {
    try {
      // 确保配置目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // 如果配置文件不存在，复制默认配置文件
      if (!fs.existsSync(this.configPath)) {
        if (fs.existsSync(this.defaultConfigPath)) {
          fs.copyFileSync(this.defaultConfigPath, this.configPath);
          logger.info('[MCS Config] 已复制默认配置文件');
        } else {
          logger.error('[MCS Config] 默认配置文件不存在');
          throw new Error('默认配置文件不存在');
        }
      }
      
      // 加载配置
      this.loadConfig();
      
      // 检查并更新配置
      await this.checkAndUpdate();
    } catch (error) {
      logger.error('[MCS Config] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载配置文件
   */
  loadConfig() {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      this.config = YAML.parse(content);
      
      if (!this.config) {
        throw new Error('配置文件格式错误');
      }
    } catch (error) {
      logger.error('[MCS Config] 加载配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取配置
   * @returns {Object} 配置对象
   */
  getConfig() {
    if (!this.config) {
      throw new Error('配置未初始化');
    }
    return this.config;
  }

  /**
   * 获取MCS配置
   * @returns {Object} MCS配置
   */
  getMcsConfig() {
    const config = this.getConfig();
    if (!config.mcsmanager) {
      throw new Error('配置格式错误：缺少 mcsmanager 节点');
    }
    return {
      userdata: config.mcsmanager.userdata,
      defaults: config.mcsmanager.defaults
    };
  }

  /**
   * 更新配置
   * @param {Object} newConfig 新配置
   */
  async updateConfig(newConfig) {
    try {
      // 合并配置
      this.config = { ...this.config, ...newConfig };
      
      // 写入文件
      const yamlStr = YAML.stringify(this.config);
      fs.writeFileSync(this.configPath, yamlStr, 'utf8');
      
      logger.info('[MCS Config] 配置已更新');
    } catch (error) {
      logger.error(`[MCS Config] 更新配置失败: ${error}`);
      throw error;
    }
  }

  /**
   * 重置配置
   */
  async resetConfig() {
    try {
      if (fs.existsSync(this.defaultConfigPath)) {
        fs.copyFileSync(this.defaultConfigPath, this.configPath);
        await this.loadConfig();
        logger.info('[MCS Config] 配置已重置为默认值');
      } else {
        throw new Error('默认配置文件不存在');
      }
    } catch (error) {
      logger.error(`[MCS Config] 重置配置失败: ${error}`);
      throw error;
    }
  }
}

export default new McsConfig();
