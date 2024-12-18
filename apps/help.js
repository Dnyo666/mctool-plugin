import { App, Render } from '#components'
import lodash from 'lodash'
import { help as helpUtil } from '#models'

const app = {
  /** 功能ID */
  id: 'mctool',
  /** 功能名称 */
  name: 'MCTool'
}

export const rule = {
  help: {
    /** 命令正则匹配 */
    reg: /^#?(mc|mctool)(插件|plugin)?(帮助|菜单|help)$/i,
    /** 执行方法 */
    fnc: help,
    /** 权限 */
    permission: 'all'
  }
}

export const helpApp = new App(app, rule).create()

// 定义帮助菜单内容
helpUtil.helpList.push({
  group: 'MCTool',
  list: [
    {
      icon: 1,
      title: '#mc帮助',
      desc: '显示帮助信息'
    },
    {
      icon: 2,
      title: '#mc列表',
      desc: '查看服务器状态'
    },
    {
      icon: 3,
      title: '#mc在线',
      desc: '查看在线玩家'
    },
    {
      icon: 4,
      title: '#mc添加',
      desc: '添加服务器(管理)'
    },
    {
      icon: 5,
      title: '#mc删除',
      desc: '删除服务器(管理)'
    },
    {
      icon: 6,
      title: '#mc推送',
      desc: '玩家动态推送(管理)'
    }
  ]
})

async function help(e) {
  const helpGroup = []

  lodash.forEach(helpUtil.helpList, (group) => {
    if (group.auth && group.auth === 'master' && !e.isMaster) {
      return true
    }

    lodash.forEach(group.list, (help) => {
      const icon = help.icon * 1
      if (!icon) {
        help.css = 'display:none'
      } else {
        const x = (icon - 1) % 10
        const y = (icon - x - 1) / 10
        help.css = `background-position:-${x * 50}px -${y * 50}px`
      }
    })

    helpGroup.push(group)
  })

  const themeData = await helpUtil.helpTheme.getThemeData(helpUtil.helpCfg)
  const img = await Render.render('help/index', {
    helpCfg: helpUtil.helpCfg,
    helpGroup,
    ...themeData,
    scale: 1.4
  })

  if (img) {
    await e.reply(img)
  } else {
    e.reply('生成帮助图片失败，请稍后重试')
  }
  return true
}
