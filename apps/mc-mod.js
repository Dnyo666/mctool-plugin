import { Data, getConfig } from './mc-utils.js'
import common from '../../../lib/common/common.js'
import logger from '../models/logger.js'
import fs from 'fs'
import path from 'path'


// API配置，不要偷token！偷token没麻麻！
const API_CONFIG = {
    modrinth: {
        token: 'uDI95zNmiyqyT3QkvsoCQiO7xweL8va8',
        baseUrl: 'https://api.modrinth.com/v2'
    },
    curseforge: {
        token: '$2a$10$xu641HxxR5O9Z8sdQmSI8ury/SeTI9tDx3uW1jTOGaxnCmZ1bGbe.',
        baseUrl: 'https://api.curseforge.com/v1',
        gameId: 432  // Minecraft的游戏ID
    }
};

export class MCMod extends plugin {
    constructor() {
        super({
            name: 'MCTool-Mod',
            dsc: 'Minecraft Mod搜索',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?[Mm][Cc]mod(?:搜索|查找|查询)\\s+(.+)$',
                    fnc: 'searchModDefault',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]modrinth(?:搜索|查找|查询)\\s+(.+)$',
                    fnc: 'searchModrinthMod',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]modcurse(?:搜索|查找|查询)\\s+(.+)$',
                    fnc: 'searchCurseforgeMod',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]mod翻页$',
                    fnc: 'nextPage',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]mod信息\\s+(\\S+)$',
                    fnc: 'getModInfo',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]modrinth信息\\s+(\\d+)$',
                    fnc: 'getModrinthInfo',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]modcurse信息\\s+(\\d+)$',
                    fnc: 'getCurseforgeInfo',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]mod版本\\s+(\\S+)(?:\\s+([^\\s]+))?(?:\\s+([^\\s]+))?$',
                    fnc: 'getModVersions',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]modrinth版本\\s+(\\d+)(?:\\s+([^\\s]+))?(?:\\s+([^\\s]+))?$',
                    fnc: 'getModrinthVersions',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]modcurse版本\\s+(\\d+)(?:\\s+([^\\s]+))?(?:\\s+([^\\s]+))?$',
                    fnc: 'getCurseforgeVersions',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]mod版本翻页$',
                    fnc: 'nextVersionPage',
                    permission: 'all'
                },
                {
                    reg: '^#?[Mm][Cc]mod下载\\s+(\\S+)(?:\\s+([\\S]+))?(?:\\s+([\\S]+))?$',
                    fnc: 'getModVersion',
                    permission: 'all'
                }
            ]
        });
        this.pageSize = 20;
    }

    /**
     * 根据默认源搜索Mod
     * @param {*} e 消息事件
     */
    async searchModDefault(e) {
        try {
            const config = await getConfig();
            const defaultSource = config?.mod?.defaultSource || 'curseforge';
            
            // 提取搜索关键词
            const searchText = e.msg.match(/^#?[Mm][Cc]mod(?:搜索|查找|查询)\s+(.+)$/)?.[1]?.trim();
            if (!searchText) {
                e.reply(
                    '请提供要搜索的Mod名称\n' +
                    '用法：\n' +
                    '#mcmod搜索 <关键词> [版本] [加载器]\n' +
                    '例如：\n' +
                    '#mcmod搜索 jei 1.19.2 fabric\n' +
                    '#mcmod搜索 jei 1.18.2 forge'
                );
                return false;
            }

            const params = this.parseSearchParams(searchText);
            await this.sendWaitMsg(e);

            let result;
            if (defaultSource === 'modrinth') {
                result = await this.searchModrinth(params);
                result.hits = result.hits.map(hit => ({ ...hit, platform: 'modrinth' }));
            } else {
                result = await this.searchCurseForge(params);
                result.hits = result.hits.map(hit => ({ ...hit, platform: 'curseforge' }));
            }

            if (result.hits.length === 0) {
                e.reply('未找到相关Mod');
                return false;
            }

            // 缓存搜索结果
            this.saveCache(e.group_id, e.user_id, {
                keyword: searchText,
                hits: result.hits,
                currentPage: 0,
                totalHits: result.hits.length,
                timestamp: Date.now()
            });

            // 显示第一页结果
            await this.showPage(e);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 搜索Mod失败: ${error.message}`);
            e.reply(`搜索失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 搜索Modrinth平台的Mod
     * @param {*} e 消息事件
     */
    async searchModrinthMod(e) {
        try {
            const searchText = e.msg.match(/^#?[Mm][Cc]modrinth(?:搜索|查找|查询)\s+(.+)$/)?.[1]?.trim();
            if (!searchText) {
                e.reply(
                    '请提供要搜索的Mod名称\n' +
                    '用法：\n' +
                    '#mcmodrinth搜索 <关键词> [版本] [加载器]\n' +
                    '例如：\n' +
                    '#mcmodrinth搜索 jei 1.19.2 fabric\n' +
                    '#mcmodrinth搜索 jei 1.18.2 forge'
                );
                return false;
            }

            const params = this.parseSearchParams(searchText);
            await this.sendWaitMsg(e);

            const result = await this.searchModrinth(params);
            result.hits = result.hits.map(hit => ({ ...hit, platform: 'modrinth' }));

            if (result.hits.length === 0) {
                e.reply('未找到相关Mod');
                return false;
            }

            // 缓存搜索结果
            this.saveCache(e.group_id, e.user_id, {
                keyword: searchText,
                hits: result.hits,
                currentPage: 0,
                totalHits: result.hits.length,
                timestamp: Date.now()
            });

            // 显示第一页结果
            await this.showPage(e);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 搜索Modrinth Mod失败: ${error.message}`);
            e.reply(`搜索失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 搜索CurseForge平台的Mod
     * @param {*} e 消息事件
     */
    async searchCurseforgeMod(e) {
        try {
            const searchText = e.msg.match(/^#?[Mm][Cc]modcurse(?:搜索|查找|查询)\s+(.+)$/)?.[1]?.trim();
            if (!searchText) {
                e.reply(
                    '请提供要搜索的Mod名称\n' +
                    '用法：\n' +
                    '#mcmodcurse搜索 <关键词> [版本] [加载器]\n' +
                    '例如：\n' +
                    '#mcmodcurse搜索 jei 1.19.2 fabric\n' +
                    '#mcmodcurse搜索 jei 1.18.2 forge'
                );
                return false;
            }

            const params = this.parseSearchParams(searchText);
            await this.sendWaitMsg(e);

            const result = await this.searchCurseForge(params);
            result.hits = result.hits.map(hit => ({ ...hit, platform: 'curseforge' }));

            if (result.hits.length === 0) {
                e.reply('未找到相关Mod');
                return false;
            }

            // 缓存搜索结果
            this.saveCache(e.group_id, e.user_id, {
                keyword: searchText,
                hits: result.hits,
                currentPage: 0,
                totalHits: result.hits.length,
                timestamp: Date.now()
            });

            // 显示第一页结果
            await this.showPage(e);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 搜索CurseForge Mod失败: ${error.message}`);
            e.reply(`搜索失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取Modrinth的Mod信息
     * @param {*} e 消息事件
     */
    async getModrinthInfo(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache || !cache.hits) {
            e.reply('请先搜索Mod');
            return false;
        }

        const match = e.msg.match(/^#?[Mm][Cc]modrinth信息\s+(\d+)$/);
        if (!match) {
            e.reply('请提供正确的序号');
            return false;
        }

        const index = parseInt(match[1]) - 1;
        const mod = cache.hits[index];
        
        if (!mod || mod.platform !== 'modrinth') {
            e.reply('未找到该序号对应的Modrinth Mod');
            return false;
        }

        return this.getModInfo(e);
    }

    /**
     * 获取CurseForge的Mod信息
     * @param {*} e 消息事件
     */
    async getCurseforgeInfo(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache || !cache.hits) {
            e.reply('请先搜索Mod');
            return false;
        }

        const match = e.msg.match(/^#?[Mm][Cc]modcurse信息\s+(\d+)$/);
        if (!match) {
            e.reply('请提供正确的序号');
            return false;
        }

        const index = parseInt(match[1]) - 1;
        const mod = cache.hits[index];
        
        if (!mod || mod.platform !== 'curseforge') {
            e.reply('未找到该序号对应的CurseForge Mod');
            return false;
        }

        return this.getModInfo(e);
    }

    /**
     * 获取Modrinth的Mod版本信息
     * @param {*} e 消息事件
     */
    async getModrinthVersions(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache || !cache.hits) {
            e.reply('请先搜索Mod');
            return false;
        }

        const match = e.msg.match(/^#?[Mm][Cc]modrinth版本\s+(\d+)(?:\s+([^\s]+))?(?:\s+([^\s]+))?$/);
        if (!match) {
            e.reply('格式错误，请使用：#mcmodrinth版本 <序号> [游戏版本] [加载器]');
            return false;
        }

        const index = parseInt(match[1]) - 1;
        const mod = cache.hits[index];
        
        if (!mod || mod.platform !== 'modrinth') {
            e.reply('未找到该序号对应的Modrinth Mod');
            return false;
        }

        return this.getModVersions(e);
    }

    /**
     * 获取CurseForge的Mod版本信息
     * @param {*} e 消息事件
     */
    async getCurseforgeVersions(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache || !cache.hits) {
            e.reply('请先搜索Mod');
            return false;
        }

        const match = e.msg.match(/^#?[Mm][Cc]modcurse版本\s+(\d+)(?:\s+([^\s]+))?(?:\s+([^\s]+))?$/);
        if (!match) {
            e.reply('格式错误，请使用：#mcmodcurse版本 <序号> [游戏版本] [加载器]');
            return false;
        }

        const index = parseInt(match[1]) - 1;
        const mod = cache.hits[index];
        
        if (!mod || mod.platform !== 'curseforge') {
            e.reply('未找到该序号对应的CurseForge Mod');
            return false;
        }

        return this.getModVersions(e);
    }

    /**
     * 解析搜索参数
     * @param {string} searchText 搜索文本
     * @returns {object} 搜索参数
     */
    parseSearchParams(searchText) {
        const params = {
            query: '',
            gameVersion: null,
            loader: null
        };

        if (!searchText) return params;

        // 匹配格式：关键词 [版本] [加载器]
        const parts = searchText.split(/\s+/);
        
        for (const part of parts) {
            // 匹配版本号格式 (e.g., 1.19.2, 1.21.1)
            if (part.match(/^\d+\.\d+(\.\d+)?$/)) {
                params.gameVersion = part;
                continue;
            }

            // 匹配加载器（包含容错处理）
            const loaderMap = {
                'fabric': 'fabric',
                'farbic': 'fabric',  // 常见拼写错误
                'fabic': 'fabric',   // 常见拼写错误
                'forge': 'forge',
                'forg': 'forge',     // 常见拼写错误
                'quilt': 'quilt'
            };

            const normalizedLoader = part.toLowerCase();
            if (loaderMap[normalizedLoader]) {
                params.loader = loaderMap[normalizedLoader];
                continue;
            }

            // 其他都作为搜索关键词
            params.query += (params.query ? ' ' : '') + part;
        }

        // 调试日志
        logger.info(`[MCTool] 搜索参数解析结果: ${JSON.stringify(params)}`);

        return params;
    }

    /**
     * 获取缓存数据
     * @param {string} groupId 群号
     * @param {string} userId 用户ID
     * @returns {object} 缓存数据
     */
    getCache(groupId, userId) {
        const cacheData = Data.getGroupData('mod_search_cache', groupId) || {};
        return cacheData[userId];
    }

    /**
     * 保存缓存数据
     * @param {string} groupId 群号
     * @param {string} userId 用户ID
     * @param {object} data 要保存的数据
     */
    saveCache(groupId, userId, data) {
        const cacheData = Data.getGroupData('mod_search_cache', groupId) || {};
        cacheData[userId] = data;
        Data.saveGroupData('mod_search_cache', groupId, cacheData);
    }

    /**
     * 搜索Modrinth平台的Mod
     * @param {object} params 搜索参数
     * @returns {Promise<object>} 搜索结果
     */
    async searchModrinth(params) {
        const searchParams = new URLSearchParams({
            query: params.query,
            limit: '50',
            index: 'downloads',
            facets: JSON.stringify([
                ["project_type:mod"],
                params.gameVersion ? [`versions:${params.gameVersion}`] : [],
                params.loader ? [`categories:${params.loader}`] : []
            ].filter(f => f.length > 0))
        });

        const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/search?${searchParams}`, {
            headers: {
                'User-Agent': 'MCTool-Plugin/1.0.0',
                'Accept': 'application/json',
                'Authorization': API_CONFIG.modrinth.token
            }
        });

        if (!response.ok) {
            throw new Error(`Modrinth搜索失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            platform: 'modrinth',
            hits: await Promise.all(data.hits.map(async hit => {
                // 获取完整的项目信息以获取准确的版本列表
                const projectResponse = await fetch(`${API_CONFIG.modrinth.baseUrl}/project/${hit.project_id}`, {
                    headers: {
                        'User-Agent': 'MCTool-Plugin/1.0.0',
                        'Accept': 'application/json',
                        'Authorization': API_CONFIG.modrinth.token
                    }
                });

                let gameVersions = hit.versions || [];
                let loaders = hit.categories?.filter(c => ['fabric', 'forge', 'quilt'].includes(c)) || [];

                if (projectResponse.ok) {
                    const projectData = await projectResponse.json();
                    gameVersions = projectData.game_versions || gameVersions;
                    loaders = projectData.loaders || loaders;
                }

                return {
                    id: hit.project_id,
                    name: hit.title,
                    description: hit.description,
                    downloads: hit.downloads,
                    author: hit.author,
                    loaders,
                    gameVersions,
                    thumbnailUrl: hit.icon_url,
                    projectUrl: `https://modrinth.com/mod/${hit.slug}`
                };
            }))
        };
    }

    /**
     * 搜索CurseForge平台的Mod
     * @param {object} params 搜索参数
     * @returns {Promise<object>} 搜索结果
     */
    async searchCurseForge(params) {
        const searchParams = new URLSearchParams({
            gameId: API_CONFIG.curseforge.gameId.toString(),
            searchFilter: params.query,
            sortField: 'downloadCount',  // 按下载量排序
            sortOrder: 'desc',
            pageSize: '50',  // 使用最大页面大小
            classId: '6',    // Mods分类
            modLoaderType: this.getCurseForgeLoaderType(params.loader),  // 转换加载器类型
            gameVersion: params.gameVersion || ''
        });

        const response = await fetch(`${API_CONFIG.curseforge.baseUrl}/mods/search?${searchParams}`, {
            headers: {
                'x-api-key': API_CONFIG.curseforge.token,
                'Accept': 'application/json',
                'User-Agent': 'MCTool-Plugin/1.0.0'
            }
        });

        if (!response.ok) {
            throw new Error(`CurseForge搜索失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            platform: 'curseforge',
            hits: data.data.map(mod => ({
                id: mod.id.toString(),
                name: mod.name,
                description: mod.summary,
                downloads: mod.downloadCount,
                author: mod.authors?.[0]?.name || '未知作者',
                thumbnailUrl: mod.logo?.thumbnailUrl,
                projectUrl: mod.links?.websiteUrl,
                slug: mod.slug,
                categories: mod.categories?.map(c => c.name) || [],
                loader: this.getCurseForgeLoaderFromMod(mod),
                gameVersions: this.getModGameVersions(mod)
            }))
        };
    }

    /**
     * 获取CurseForge的加载器类型ID
     * @param {string} loader 加载器名称
     * @returns {number|null} 加载器类型ID
     */
    getCurseForgeLoaderType(loader) {
        if (!loader) return null;
        const loaderMap = {
            'forge': 1,
            'fabric': 4,
            'quilt': 5
        };
        return loaderMap[loader.toLowerCase()] || null;
    }

    /**
     * 从Mod信息中获取加载器类型
     * @param {object} mod Mod信息
     * @returns {Array<string>} 加载器类型列表
     */
    getCurseForgeLoaderFromMod(mod) {
        const loaderTypes = {
            1: 'forge',
            4: 'fabric',
            5: 'quilt'
        };
        
        const loaders = new Set();
        
        // 检查所有文件的加载器类型
        if (mod.latestFilesIndexes) {
            mod.latestFilesIndexes.forEach(file => {
                const loader = loaderTypes[file.modLoader];
                if (loader) {
                    loaders.add(loader);
                }
            });
        }

        // 检查分类中的加载器标签
        if (mod.categories) {
            mod.categories.forEach(category => {
                const name = category.name.toLowerCase();
                if (name.includes('forge')) loaders.add('forge');
                if (name.includes('fabric')) loaders.add('fabric');
                if (name.includes('quilt')) loaders.add('quilt');
            });
        }

        return Array.from(loaders);
    }

    /**
     * 获取Mod支持的游戏版本
     * @param {object} mod Mod信息
     * @returns {Array<string>} 游戏版本列表
     */
    getModGameVersions(mod) {
        if (!mod.latestFilesIndexes || mod.latestFilesIndexes.length === 0) {
            return [];
        }
        
        // 获取所有支持的游戏版本
        const versions = new Set();
        mod.latestFilesIndexes.forEach(file => {
            if (file.gameVersion) {
                versions.add(file.gameVersion);
            }
        });
        
        return Array.from(versions);
    }

    /**
     * 获取CurseForge的Mod详细信息
     * @param {string} modId Mod ID
     * @returns {Promise<object>} Mod详细信息
     */
    async getCurseForgeModInfo(modId) {
        const response = await fetch(`${API_CONFIG.curseforge.baseUrl}/mods/${modId}`, {
            headers: {
                'x-api-key': API_CONFIG.curseforge.token,
                'Accept': 'application/json',
                'User-Agent': 'MCTool-Plugin/1.0.0'
            }
        });

        if (!response.ok) {
            throw new Error(`获取CurseForge Mod信息失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data;
    }

    /**
     * 获取CurseForge的Mod版本列表
     * @param {string} modId Mod ID
     * @param {object} params 过滤参数
     * @returns {Promise<Array>} 版本列表
     */
    async getCurseForgeModFiles(modId, params = {}) {
        const searchParams = new URLSearchParams({
            gameId: API_CONFIG.curseforge.gameId.toString(),
            pageSize: '50'
        });

        if (params.gameVersion) {
            searchParams.append('gameVersion', params.gameVersion);
        }
        if (params.modLoader) {
            const loaderType = this.getCurseForgeLoaderType(params.modLoader);
            if (loaderType) {
                searchParams.append('modLoaderType', loaderType.toString());
            }
        }

        const response = await fetch(`${API_CONFIG.curseforge.baseUrl}/mods/${modId}/files?${searchParams}`, {
            headers: {
                'x-api-key': API_CONFIG.curseforge.token,
                'Accept': 'application/json',
                'User-Agent': 'MCTool-Plugin/1.0.0'
            }
        });

        if (!response.ok) {
            throw new Error(`获取CurseForge Mod版本列表失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data.map(file => ({
            ...file,
            // 如果没有直接的下载URL，构造一个
            downloadUrl: file.downloadUrl || `https://www.curseforge.com/api/v1/mods/${modId}/files/${file.id}/download`
        }));
    }

    /**
     * 合并搜索结果
     * @param {Array} results 搜索结果数组
     * @returns {object} 合并后的结果
     */
    mergeSearchResults(results) {
        const allHits = results.flatMap(result => 
            result.hits.map(hit => ({
                ...hit,
                platform: result.platform
            }))
        );

        // 按下载量排序
        return allHits.sort((a, b) => b.downloads - a.downloads);
    }

    /**
     * 搜索Mod（同时搜索两个平台）
     * @param {*} e 消息事件
     */
    async searchMod(e) {
        try {
            const searchText = e.msg.match(/^#?[Mm][Cc]mod(?:搜索|查找|查询)?(?:\s+(.+))?$/)?.[1]?.trim();
            if (!searchText) {
                e.reply(
                    '请提供要搜索的Mod名称\n' +
                    '用法：\n' +
                    '#mcmod搜索 <关键词> [版本] [加载器]\n' +
                    '例如：\n' +
                    '#mcmod搜索 jei 1.19.2 fabric\n' +
                    '#mcmod搜索 jei 1.18.2 forge'
                );
                return false;
            }

            const params = this.parseSearchParams(searchText);
            await this.sendWaitMsg(e);

            // 并行搜索两个平台
            const searchResults = await Promise.all([
                this.searchModrinth(params).catch(err => {
                    logger.error(`[MCTool] Modrinth搜索失败: ${err.message}`);
                    return { platform: 'modrinth', hits: [] };
                }),
                this.searchCurseForge(params).catch(err => {
                    logger.error(`[MCTool] CurseForge搜索失败: ${err.message}`);
                    return { platform: 'curseforge', hits: [] };
                })
            ]);

            const mergedResults = this.mergeSearchResults(searchResults);

            if (mergedResults.length === 0) {
                e.reply('未找到相关Mod');
                return false;
            }

            // 缓存搜索结果
            this.saveCache(e.group_id, e.user_id, {
                keyword: searchText,
                hits: mergedResults,
                currentPage: 0,
                totalHits: mergedResults.length,
                timestamp: Date.now()
            });

            // 显示第一页结果
            await this.showPage(e);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 搜索Mod失败: ${error.message}`);
            e.reply(`搜索失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 显示下一页
     * @param {*} e 消息事件
     */
    async nextPage(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache) {
            e.reply('请先进行搜索');
            return false;
        }

        // 检查缓存是否过期（1小时）
        if (Date.now() - cache.timestamp > 3600000) {
            e.reply('搜索结果已过期，请重新搜索');
            return false;
        }

        cache.currentPage++;
        const maxPages = Math.ceil(cache.hits.length / this.pageSize);

        if (cache.currentPage >= maxPages) {
            e.reply('已经是最后一页了');
            cache.currentPage = maxPages - 1;
            this.saveCache(e.group_id, e.user_id, cache);
            return false;
        }

        this.saveCache(e.group_id, e.user_id, cache);
        await this.showPage(e);
        return true;
    }

    /**
     * 显示搜索结果页面
     * @param {*} e 消息事件
     */
    async showPage(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache) {
            e.reply('请先进行搜索');
            return false;
        }

        const start = cache.currentPage * this.pageSize;
        const end = Math.min(start + this.pageSize, cache.hits.length);
        const mods = cache.hits.slice(start, end);

        const messages = [];
        
        // 添加搜索信息
        messages.push(
            `搜索关键词：${cache.keyword}\n` +
            `当前第 ${cache.currentPage + 1}/${Math.ceil(cache.hits.length / this.pageSize)} 页\n` +
            `结果如下：`
        );

        // 每个mod单独一条消息
        for (let i = 0; i < mods.length; i++) {
            const mod = mods[i];
            messages.push(
                `${start + i + 1}. ${mod.name} [${mod.platform}]\n` +
                `项目ID：${mod.id}\n` +
                `作者：${mod.author}\n` +
                `下载量：${mod.downloads.toLocaleString()}\n` +
                (mod.loader ? `加载器：${mod.loader}\n` : '') +
                `游戏版本：${mod.gameVersions?.join(', ') || '未知'}\n` +
                `项目地址：${mod.projectUrl}`
            );
        }

        // 添加提示信息
        messages.push(
            '发送以下指令进行操作：\n' +
            '#mcmod翻页 - 查看下一页\n' +
            '#mcmod信息 <序号> - 查看详细信息\n' +
            '#mcmod版本 <序号> [MC版本] [加载器] - 查看版本列表\n' +
            '#mcmod下载 <序号> <版本> [加载器] - 获取下载地址'
        );

        // 使用转发消息发送
        await this.reply_forward_msg(e, messages);
        return true;
    }

    /**
     * 发送合并转发消息
     * @param {*} e 消息事件
     * @param {Array<string>} messages 消息数组
     * @returns {Promise<boolean>} 是否发送成功
     */
    async reply_forward_msg(e, messages) {
        try {
            // 获取消息类型
            const firstMsg = messages[0] || '';
            let title = 'Mod信息';
            
            if (firstMsg.includes('搜索结果')) {
                title = 'Mod搜索结果';
            } else if (firstMsg.includes('版本信息')) {
                title = 'Mod版本列表';
            } else if (firstMsg.includes('下载信息')) {
                title = 'Mod下载信息';
            } else if (firstMsg.includes('Mod信息')) {
                title = 'Mod详细信息';
            }

            // 使用common中的转发方法
            const forwardMsg = await common.makeForwardMsg(e, messages, title);
            await e.reply(forwardMsg);
            return true;
        } catch (error) {
            logger.error('[MCTool] 发送转发消息失败:', error);
            // 如果转发消息失败，尝试直接发送
            try {
                await e.reply('消息太长，将分多条发送...');
                for (const msg of messages) {
                    if (msg.trim()) {
                        await e.reply(msg);
                        await new Promise(resolve => setTimeout(resolve, 200)); // 添加延迟避免风控
                    }
                }
                return true;
            } catch (err) {
                logger.error('[MCTool] 分条发送消息也失败了:', err);
                await e.reply('发送消息失败，请稍后重试');
                return false;
            }
        }
    }

    /**
     * 获取Mod详细信息
     * @param {*} e 消息事件
     */
    async getModInfo(e) {
        try {
            const match = e.msg.match(/^#?[Mm][Cc]mod信息\s+(\S+)$/);
            if (!match) {
                e.reply('请提供正确的序号或项目ID');
                return false;
            }

            const input = match[1];
            let mod = null;
            let detailedInfo = null;

            // 首先尝试从缓存中获取
            const cache = this.getCache(e.group_id, e.user_id);
            if (cache && cache.hits) {
                // 检查缓存是否过期（5分钟）
                if (Date.now() - cache.timestamp > 300000) {
                    e.reply('搜索结果已过期，请重新搜索');
                    return false;
                }

                const index = parseInt(input) - 1;
                if (index >= 0 && index < cache.hits.length) {
                    mod = cache.hits[index];
                }
            }

            // 如果没有从缓存中找到，尝试作为CurseForge项目ID查询
            if (!mod) {
                try {
                    detailedInfo = await this.getCurseForgeModInfo(input);
                    if (detailedInfo) {
                        mod = {
                            id: detailedInfo.id.toString(),
                            name: detailedInfo.name,
                            platform: 'curseforge',
                            projectUrl: detailedInfo.links?.websiteUrl
                        };
                    }
                } catch (error) {
                    logger.error(`[MCTool] 尝试通过项目ID获取CurseForge Mod失败: ${error.message}`);
                }
            }

            if (!mod) {
                e.reply('未找到该序号或项目ID对应的Mod');
                return false;
            }

            await this.sendWaitMsg(e);

            // 如果还没有获取详细信息，根据平台获取
            if (!detailedInfo) {
                if (mod.platform === 'modrinth') {
                    const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/project/${mod.id}`, {
                        headers: {
                            'User-Agent': 'MCTool-Plugin/1.0.0',
                            'Accept': 'application/json',
                            'Authorization': API_CONFIG.modrinth.token
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`获取Modrinth Mod信息失败: ${response.status} ${response.statusText}`);
                    }

                    detailedInfo = await response.json();
                } else {
                    detailedInfo = await this.getCurseForgeModInfo(mod.id);
                }
            }

            // 构建消息
            const messages = this.formatModInfo(mod.platform, detailedInfo, mod);

            // 使用转发消息发送结果
            await this.reply_forward_msg(e, messages);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 获取Mod信息失败: ${error.message}`);
            e.reply(`获取Mod信息失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 格式化Mod信息
     * @param {string} platform 平台
     * @param {object} detailedInfo 详细信息
     * @param {object} mod 基本信息
     * @returns {Array} 消息数组
     */
    formatModInfo(platform, detailedInfo, mod) {
            const messages = [];
            
        if (platform === 'modrinth') {
            messages.push(
                `Mod详细信息 [Modrinth]：\n` +
                `${detailedInfo.title}\n` +
                `项目ID：${detailedInfo.id}\n` +
                `作者：${detailedInfo.team_members?.map(m => m.user.username).join(', ') || '未知'}\n` +
                `关注数：${detailedInfo.followers.toLocaleString()}\n` +
                `发布时间：${new Date(detailedInfo.published).toLocaleString('zh-CN')}\n` +
                `更新时间：${new Date(detailedInfo.updated).toLocaleString('zh-CN')}\n` +
                `许可证：${detailedInfo.license?.id || '未知'}`
            );

            messages.push(
                `支持信息：\n` +
                `支持的游戏版本：${detailedInfo.game_versions?.join(', ') || '未知'}\n` +
                `支持的加载器：${detailedInfo.loaders?.join(', ') || '未知'}\n` +
                `下载量：${detailedInfo.downloads?.toLocaleString() || '未知'}`
            );
        } else {
            messages.push(
                `Mod详细信息 [CurseForge]：\n` +
                `${detailedInfo.name}\n` +
                `项目ID：${detailedInfo.id}\n` +
                `作者：${detailedInfo.authors?.map(a => a.name).join(', ') || '未知'}\n` +
                `创建时间：${new Date(detailedInfo.dateCreated).toLocaleString('zh-CN')}\n` +
                `更新时间：${new Date(detailedInfo.dateModified).toLocaleString('zh-CN')}\n` +
                `下载量：${detailedInfo.downloadCount?.toLocaleString() || '未知'}`
            );

            if (detailedInfo.categories?.length > 0) {
                messages.push(
                    `分类：\n${detailedInfo.categories.map(c => c.name).join(', ')}`
                );
            }
        }

        // 添加描述
        const description = platform === 'modrinth' ? detailedInfo.description : detailedInfo.description;
        if (description) {
            messages.push(`简介：\n${description}`);
        }

        // 添加链接
        messages.push(`项目链接：${mod.projectUrl}`);

        // 添加图片
        if (platform === 'modrinth' && detailedInfo.gallery?.length > 0) {
                messages.push('预览图片：');
            for (const image of detailedInfo.gallery) {
                    if (image.featured) {
                        messages.push(segment.image(image.url));
                    }
                }
        } else if (detailedInfo.screenshots?.length > 0) {
            messages.push('预览图片：');
            for (const screenshot of detailedInfo.screenshots) {
                messages.push(segment.image(screenshot.url));
            }
        }

        return messages;
    }

    /**
     * 获取Mod版本信息
     * @param {*} e 消息事件
     */
    async getModVersions(e) {
        try {
            const cache = this.getCache(e.group_id, e.user_id);
            if (!cache || !cache.hits) {
                e.reply('请先搜索Mod');
                return false;
            }

            const match = e.msg.match(/^#?[Mm][Cc]mod版本\s+(\S+)(?:\s+([^\\s]+))?(?:\s+([^\\s]+))?$/);
            if (!match) {
                e.reply('格式错误，请使用：#mcmod版本 <序号> [游戏版本] [加载器]');
                return false;
            }

            const index = parseInt(match[1]) - 1;
            const mod = cache.hits[index];
            
            if (!mod) {
                e.reply('未找到该序号对应的Mod');
                return false;
            }

            let gameVersion = null;
            let loader = null;

            if (match[2]) {
                if (match[2].match(/^\d+\.\d+(\.\d+)?$/)) {
                    gameVersion = match[2];
                    loader = match[3];
                } else {
                    loader = match[2];
                    gameVersion = match[3];
                }
            }

            await this.sendWaitMsg(e);

            let versions;
            if (mod.platform === 'modrinth') {
                versions = await this.getModrinthVersions(mod.id, gameVersion, loader);
            } else {
                versions = await this.getCurseForgeModFiles(mod.id, {
                    gameVersion,
                    modLoader: loader
                });
            }

            if (!versions || versions.length === 0) {
                e.reply('未找到版本信息');
                return false;
            }

            // 缓存版本信息
            this.saveCache(e.group_id, e.user_id, {
                type: 'version',
                modId: mod.id,
                platform: mod.platform,
                currentMod: mod,
                versions: versions,
                currentPage: 0,
                pageSize: 10,
                timestamp: Date.now()
            });

            // 显示第一页结果
            await this.showVersionPage(e);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 获取版本信息失败: ${error.message}`);
            e.reply(`获取版本信息失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取Modrinth的版本列表
     * @param {string} modId Mod ID
     * @param {string} gameVersion 游戏版本
     * @param {string} loader 加载器
     * @returns {Promise<Array>} 版本列表
     */
    async getModrinthVersions(modId, gameVersion, loader) {
            const params = new URLSearchParams();
            if (gameVersion) params.append('game_versions', `["${gameVersion}"]`);
            if (loader) {
                const loaderMap = {
                    'fabric': 'fabric',
                    'farbic': 'fabric',
                    'fabic': 'fabric',
                    'forge': 'forge',
                    'forg': 'forge',
                    'quilt': 'quilt'
                };
                const normalizedLoader = loaderMap[loader.toLowerCase()] || loader;
                params.append('loaders', `["${normalizedLoader}"]`);
            }

        const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/project/${modId}/version${params.toString() ? '?' + params.toString() : ''}`, {
                headers: {
                'User-Agent': 'MCTool-Plugin/1.0.0',
                    'Accept': 'application/json',
                'Authorization': API_CONFIG.modrinth.token
                }
            });

            if (!response.ok) {
            throw new Error(`获取Modrinth版本信息失败: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * 显示版本信息的当前页
     * @param {*} e 消息事件
     */
    async showVersionPage(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache || cache.type !== 'version') {
            e.reply('请先使用 #mcmod版本 <序号> 查询版本信息');
            return false;
        }

        // 检查缓存是否过期（5分钟）
        if (Date.now() - cache.timestamp > 300000) {
            e.reply('版本信息已过期，请重新查询');
            return false;
        }

        const start = cache.currentPage * cache.pageSize;
        const end = Math.min(start + cache.pageSize, cache.versions.length);
        const currentVersions = cache.versions.slice(start, end);

        // 构建消息
        const messages = [];
        
        // 添加标题和Mod信息
        messages.push(
            `Mod版本信息 [${cache.platform}]\n` +
            `Mod名称：${cache.currentMod.name}\n` +
            `Mod ID：${cache.currentMod.id}\n` +
            `共找到 ${cache.versions.length} 个版本\n` +
            `当前第 ${cache.currentPage + 1}/${Math.ceil(cache.versions.length / cache.pageSize)} 页`
        );

        if (cache.platform === 'modrinth') {
            // Modrinth版本显示逻辑
            const statusMap = {
                'listed': '已上架',
                'archived': '已存档',
                'draft': '草稿',
                'unlisted': '未上架',
                'scheduled': '计划中',
                'unknown': '未知'
            };

            const typeMap = {
                'release': '正式版',
                'beta': '测试版',
                'alpha': '开发版'
            };
            
            for (let i = 0; i < currentVersions.length; i++) {
                const version = currentVersions[i];
                const primaryFile = version.files.find(f => f.primary) || version.files[0];
                const fileSize = primaryFile ? (primaryFile.size / 1024 / 1024).toFixed(2) : '未知';

                // 基本信息
                messages.push(
                    `版本 ${start + i + 1}/${cache.versions.length}：\n` +
                    `版本号：${version.version_number}\n` +
                    `版本ID：${version.id}\n` +
                    `发布时间：${new Date(version.date_published).toLocaleString('zh-CN')}\n` +
                    `版本类型：${typeMap[version.version_type] || version.version_type}\n` +
                    `状态：${statusMap[version.status] || version.status}`
                );

                // 支持信息
                messages.push(
                    `支持信息：\n` +
                    `游戏版本：${version.game_versions.join(', ')}\n` +
                    `加载器：${version.loaders.join(', ')}\n` +
                    `下载量：${version.downloads.toLocaleString()}\n` +
                    `文件大小：${fileSize}MB\n` +
                    (primaryFile ? `下载链接：${primaryFile.url}` : '')
                );
            }
        } else {
            // CurseForge版本显示逻辑
            const releaseTypeMap = {
                1: '正式版',
                2: '测试版',
                3: '开发版'
            };

            for (let i = 0; i < currentVersions.length; i++) {
                const version = currentVersions[i];
                const fileSize = (version.fileLength / 1024 / 1024).toFixed(2);

                // 基本信息
                messages.push(
                    `版本 ${start + i + 1}/${cache.versions.length}：\n` +
                    `版本号：${version.displayName}\n` +
                    `文件ID：${version.id}\n` +
                    `发布时间：${new Date(version.fileDate).toLocaleString('zh-CN')}\n` +
                    `版本类型：${releaseTypeMap[version.releaseType] || '未知'}`
                );

                // 支持信息
                messages.push(
                    `支持信息：\n` +
                    `游戏版本：${version.gameVersions.join(', ')}\n` +
                    `下载量：${version.downloadCount.toLocaleString()}\n` +
                    `文件大小：${fileSize}MB\n` +
                    `下载链接：${version.downloadUrl}`
                );
            }
        }

        // 添加提示信息
        messages.push(
            `提示：\n` +
            `发送 #mcmod版本翻页 查看下一页\n` +
            `发送 #mcmod下载 <序号> 下载指定版本\n` +
            `也可以使用 #mcmod下载 <序号> <版本号> [加载器] 下载特定版本`
        );

        // 使用转发消息发送结果
        await this.reply_forward_msg(e, messages);
        return true;
    }

    /**
     * 显示版本信息的下一页
     * @param {*} e 消息事件
     */
    async nextVersionPage(e) {
        const cache = this.getCache(e.group_id, e.user_id);
        if (!cache || cache.type !== 'version') {
            e.reply('请先使用 #mcmod版本 <序号> 查询版本信息');
            return false;
        }

        // 检查缓存是否过期（1小时）
        if (Date.now() - cache.timestamp > 3600000) {
            e.reply('版本信息已过期，请重新查询');
            return false;
        }

        cache.currentPage++;
        const maxPages = Math.ceil(cache.versions.length / cache.pageSize);

        if (cache.currentPage >= maxPages) {
            e.reply('已经是最后一页了');
            cache.currentPage = maxPages - 1;
            this.saveCache(e.group_id, e.user_id, cache);
            return false;
        }

        this.saveCache(e.group_id, e.user_id, cache);
        await this.showVersionPage(e);
        return true;
    }

    /**
     * 下载文件
     * @param {string} url 下载地址
     * @param {string} fileName 文件名
     * @returns {Promise<string>} 文件路径
     */
    async downloadFile(url, fileName) {
        const downloadPath = path.join(process.cwd(), 'data/mctool/downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        const filePath = path.join(downloadPath, fileName);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'MCTool-Plugin/1.0.0'
            }
        });

        if (!response.ok) {
            throw new Error(`下载失败: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return filePath;
    }

    /**
     * 上传文件到群文件
     * @param {*} e 消息事件
     * @param {string} filePath 文件路径
     * @returns {Promise<boolean>} 是否上传成功
     */
    async uploadGroupFile(e, filePath) {
        try {
            await e.group.fs.upload(filePath);
            return true;
        } catch (error) {
            logger.error(`[MCTool] 上传群文件失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 清理临时文件
     * @param {string} filePath 文件路径
     */
    async cleanupFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            logger.error(`[MCTool] 清理临时文件失败: ${error.message}`);
        }
    }

    /**
     * 获取特定版本的Mod信息
     * @param {*} e 消息事件
     */
    async getModVersion(e) {
        try {
            // 检查是否启用下载功能
            const config = await getConfig();
            if (!config?.mod?.enableDownload) {
                e.reply('Mod下载功能已禁用，请联系管理员开启');
                return false;
            }

            const match = e.msg.match(/^#?[Mm][Cc]mod下载\s+(\S+)(?:\s+([\\S]+))?(?:\\s+([\\S]+))?$/);
            if (!match) {
                e.reply(
                    '请提供正确的参数\n' +
                    '下载方式：\n' +
                    '1. 从版本列表：#mcmod下载 <序号>\n' +
                    '2. 指定版本：#mcmod下载 <序号/ModID> <版本号/版本ID> [加载器]\n' +
                    '例如：\n' +
                    '#mcmod下载 1\n' +
                    '#mcmod下载 1 1.2.3 fabric\n' +
                    '#mcmod下载 nfn13YXA aBHkMOqF'
                );
                return false;
            }

            const input = match[1];
            const versionQuery = match[2];
            const loader = match[3];

            let mod = null;
            let version = null;

            // 首先尝试从版本缓存中获取
            const versionCache = this.getCache(e.group_id, e.user_id);
            if (versionCache?.type === 'version' && versionCache.versions) {
                // 检查缓存是否过期（5分钟）
                if (Date.now() - versionCache.timestamp > 300000) {
                    e.reply('版本信息已过期，请重新查询');
                    return false;
                }

                const index = parseInt(input) - 1;
                if (!isNaN(index) && index >= 0 && index < versionCache.versions.length) {
                    version = versionCache.versions[index];
                    mod = versionCache.currentMod;
                }
            }

            // 如果没有从版本缓存中找到，尝试从搜索缓存中获取
            if (!version && !mod) {
                const searchCache = this.getCache(e.group_id, e.user_id);
                if (searchCache?.hits) {
                    // 检查缓存是否过期（5分钟）
                    if (Date.now() - searchCache.timestamp > 300000) {
                        e.reply('搜索结果已过期，请重新搜索');
                        return false;
                    }

                    const index = parseInt(input) - 1;
                    if (!isNaN(index) && index >= 0 && index < searchCache.hits.length) {
                        mod = searchCache.hits[index];
                    }
                }
            }

            // 如果还没找到，尝试作为ModID处理
            if (!mod) {
                // 尝试Modrinth
                try {
                    const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/project/${input}`, {
                        headers: {
                            'User-Agent': 'MCTool-Plugin/1.0.0',
                            'Accept': 'application/json',
                            'Authorization': API_CONFIG.modrinth.token
                        }
                    });

                    if (response.ok) {
                        const projectData = await response.json();
                        mod = {
                            id: projectData.id,
                            name: projectData.title,
                            platform: 'modrinth'
                        };
                    }
                } catch (error) {
                    logger.debug(`[MCTool] 尝试通过ID获取Modrinth Mod失败: ${error.message}`);
                }

                // 如果不是Modrinth的，尝试CurseForge
                if (!mod) {
                    try {
                        const curseforgeData = await this.getCurseForgeModInfo(input);
                        if (curseforgeData) {
                            mod = {
                                id: curseforgeData.id.toString(),
                                name: curseforgeData.name,
                                platform: 'curseforge'
                            };
                        }
                    } catch (error) {
                        logger.debug(`[MCTool] 尝试通过ID获取CurseForge Mod失败: ${error.message}`);
                    }
                }
            }

            if (!mod) {
                e.reply('未找到对应的Mod信息');
                return false;
            }

            await this.sendWaitMsg(e);

            // 如果没有版本信息，需要查询
            if (!version && versionQuery) {
                if (mod.platform === 'modrinth') {
                    // 首先尝试作为版本ID获取
                    try {
                        const response = await fetch(`${API_CONFIG.modrinth.baseUrl}/version/${versionQuery}`, {
                            headers: {
                                'User-Agent': 'MCTool-Plugin/1.0.0',
                                'Accept': 'application/json',
                                'Authorization': API_CONFIG.modrinth.token
                            }
                        });

                        if (response.ok) {
                            version = await response.json();
                            // 验证版本是否属于指定的mod
                            if (version.project_id !== mod.id) {
                                version = null;
                            }
                        }
                    } catch (error) {
                        logger.debug(`[MCTool] 尝试通过版本ID获取失败: ${error.message}`);
                    }

                    // 如果版本ID获取失败，尝试作为版本号获取
                    if (!version) {
                        let url = `${API_CONFIG.modrinth.baseUrl}/project/${mod.id}/version/${versionQuery}`;
                        if (loader) {
                            url += `?loader=${loader}`;
                        }

                        try {
                            const response = await fetch(url, {
                                headers: {
                                    'User-Agent': 'MCTool-Plugin/1.0.0',
                                    'Accept': 'application/json',
                                    'Authorization': API_CONFIG.modrinth.token
                                }
                            });

                            if (response.ok) {
                                version = await response.json();
                            }
                        } catch (error) {
                            logger.debug(`[MCTool] 尝试通过版本号获取失败: ${error.message}`);
                        }
                    }
                } else {
                    // CurseForge版本获取
                    try {
                        const files = await this.getCurseForgeModFiles(mod.id, {
                            gameVersion: versionQuery,
                            modLoader: loader
                        });

                        if (files && files.length > 0) {
                            version = files[0];  // 使用最新的匹配版本
                        }
                    } catch (error) {
                        logger.debug(`[MCTool] 获取CurseForge版本列表失败: ${error.message}`);
                    }
                }
            }

            if (!version) {
                e.reply('未找到指定的版本，请先使用 #mcmod版本 <序号> 查看版本列表，或提供正确的版本信息');
                return false;
            }

            // 获取文件信息
            let fileInfo;
            if (mod.platform === 'modrinth') {
                const primaryFile = version.files.find(f => f.primary) || version.files[0];
                if (!primaryFile) {
                    e.reply('未找到可下载的文件');
                    return false;
                }
                fileInfo = {
                    fileName: primaryFile.filename,
                    fileSize: (primaryFile.size / 1024 / 1024).toFixed(2),
                    downloadUrl: primaryFile.url,
                    version: version.version_number,
                    gameVersions: version.game_versions,
                    loaders: version.loaders
                };
            } else {
                fileInfo = {
                    fileName: version.fileName,
                    fileSize: (version.fileLength / 1024 / 1024).toFixed(2),
                    downloadUrl: version.downloadUrl,
                    version: version.displayName,
                    gameVersions: version.gameVersions,
                    loaders: [this.getCurseForgeLoaderFromMod(version)]
                };
            }

            // 构建消息
            const messages = [
                `Mod下载信息：\n` +
                `Mod名称：${mod.name}\n` +
                `Mod ID：${mod.id}\n` +
                `平台：${mod.platform}`,
                `文件信息：\n` +
                `文件名：${fileInfo.fileName}\n` +
                `文件大小：${fileInfo.fileSize}MB\n` +
                `版本：${fileInfo.version}`,
                `支持信息：\n` +
                `游戏版本：${fileInfo.gameVersions.join(', ')}\n` +
                `加载器：${fileInfo.loaders.filter(Boolean).join(', ')}`,
                `下载地址：${fileInfo.downloadUrl}`
            ];

            // 发送下载信息
            await this.reply_forward_msg(e, messages);

            try {
                // 下载文件
                const filePath = await this.downloadFile(fileInfo.downloadUrl, fileInfo.fileName);

                // 尝试上传到群文件
                const uploadSuccess = await this.uploadGroupFile(e, filePath);

                if (uploadSuccess) {
                    await e.reply('文件已上传到群文件');
                } else {
                    await e.reply(`无法上传到群文件，请直接下载：\n${fileInfo.downloadUrl}`);
                }

                // 清理临时文件
                await this.cleanupFile(filePath);
            } catch (error) {
                logger.error(`[MCTool] 文件处理失败: ${error.message}`);
                await e.reply(`文件处理失败，请直接下载：\n${fileInfo.downloadUrl}`);
            }

            return true;
        } catch (error) {
            logger.error(`[MCTool] 获取版本信息失败: ${error.message}`);
            e.reply(`获取版本信息失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 发送等待消息并记录消息ID
     * @param {*} e 消息事件
     * @param {string} msg 消息内容
     * @returns {Promise<object>} 消息对象
     */
    async sendWaitMsg(e, msg = '正在获取信息，请稍候...') {
        return await e.reply(msg);
    }

    /**
     * 撤回等待消息
     * @param {*} e 消息事件
     * @param {object} waitMsg 等待消息对象
     */
    async recallWaitMsg(e, waitMsg) {
        if (waitMsg?.message_id) {
            await e.group.recallMsg(waitMsg.message_id);
        }
    }
}