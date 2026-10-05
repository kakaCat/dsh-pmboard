/**
 * 原型对齐断言（REQ-261004103330-005f · 人验收反馈后补）。
 *
 * ## 这份文件为什么存在
 *
 * 人验收时反馈「实现的和原型不一致」。根因：四张前端卡的测试只断言了**文案与行为**，
 * **没有一条断言视觉结构**——于是每张卡都"绿"，界面却不是原型那个样子。
 * 这与"每张卡都绿但接起来是断的"是同一类错误：**把「没有反例」当成了「符合要求」**。
 *
 * 所以本文件把「形态」写成**会红的东西**：
 * - 对齐施工期间：**它必红**（这是靶子，不是故障）；
 * - 对齐归零后：**它必须全绿**，且不许靠删断言变绿。
 *
 * 权威界面：`docs/requirements/REQ-261004103330-005f/prototype/board-settings.html`
 * 施工清单：`docs/requirements/REQ-261004103330-005f/notes/prototype-parity.md`
 */
import { describe, it, expect } from 'vitest'
import { buildSettingsShell } from '../src/client/settings/render/shell.ts'
import { initialShellState, type SettingsShellState } from '../src/client/settings/model.ts'
import { WORKFLOW_STAGES } from '../src/client/workflow-constants.ts'
import type { StageKey, StageLimitView, StorageSettingsView, SystemRecordView } from '../src/client/settings/types.ts'

/** 只取某一个屏位的 HTML（壳会同时渲染四个屏位，跨屏断言会串味）。 */
function paneHtml(html: string, pane: string): string {
  const start = html.indexOf(`id="dsh-pm-set-pane-${pane}"`)
  expect(start, `壳里找不到屏位 ${pane}`).toBeGreaterThan(-1)
  const next = html.indexOf('id="dsh-pm-set-pane-', start + 10)
  return html.slice(start, next === -1 ? undefined : next)
}

function limits(): Readonly<Partial<Record<StageKey, StageLimitView>>> {
  const out: Partial<Record<StageKey, StageLimitView>> = {}
  for (const k of Object.keys(WORKFLOW_STAGES) as StageKey[]) {
    out[k] = { value: 1000, default: 1000, source: 'default' }
  }
  return out
}

function storage(): StorageSettingsView {
  return {
    backend: { value: 'json', source: 'config' },
    sqlitePath: '/Users/mac/.dsh/reqboard.sqlite',
    effective: 'json',
    restartRequired: false,
  }
}

function record(): SystemRecordView {
  return {
    ok: true,
    exists: true,
    updatedAt: 1791100000000,
    events: 3,
    active: 'json',
    plugin: { version: '0.4.2', buildStamp: 'abc123' },
    compat: { ok: true },
    stores: {
      shards: { exists: true, requirements: 128 },
      sqlite: { exists: false, requirements: 0 },
    },
    history: [],
  } as unknown as SystemRecordView
}

const shell = (over: Partial<SettingsShellState>): string =>
  buildSettingsShell({ ...initialShellState(), open: true, ...over })

describe('原型对齐 · 运行上限屏', () => {
  const html = shell({ pane: 'limits', limits: limits() })

  it('阶段行带彩色圆点（原型每阶段一个色点）', () => {
    expect(paneHtml(html, 'limits')).toMatch(/dsh-pm-set-dot|dsh-pm-set-stage-dot/)
  })

  it('阶段名后是中文副标题，不是英文阶段 key', () => {
    const p = paneHtml(html, 'limits')
    // 原型形如「立项 · 立项草稿」；英文 key 不得作为可见标签出现
    expect(p).not.toMatch(/>\s*(draft|brainstorming|implementing|accepting)\s*</)
  })

  it('底部说明框写明保存路径与来源顺序（原型里这两条都在说明框内）', () => {
    const p = paneHtml(html, 'limits')
    expect(p).toContain('dsh-reqboard-settings.json')
    expect(p).toContain('设置文件')
    expect(p).toMatch(/插件配置/)
  })

  it('标题下一行只说「允许自动续跑的最大回合数」', () => {
    expect(paneHtml(html, 'limits')).toContain('允许自动续跑的最大回合数')
  })
})

describe('原型对齐 · 存储与数据库屏', () => {
  const html = shell({ pane: 'storage', storage: storage() })

  it('后端是分段开关（JSON 分片 / SQLite 同屏可选），不是两个平铺按钮', () => {
    const p = paneHtml(html, 'storage')
    expect(p).toContain('JSON 分片')
    expect(p).toContain('SQLite')
    // 必须真的具备"开关语义"：分段控件（radiogroup / aria-checked / seg 类）——只有两个按钮不算
    expect(p).toMatch(/role="radiogroup"|aria-checked|dsh-pm-set-seg/)
  })

  it('有「数据位置」与「改路径」入口（原型有，接口 storage.sqlitePath 本就支持）', () => {
    const p = paneHtml(html, 'storage')
    expect(p).toContain('数据位置')
    expect(p).toContain('改路径')
  })

  it('有「生效来源」「生效时机」两行与重启说明', () => {
    const p = paneHtml(html, 'storage')
    expect(p).toContain('生效来源')
    expect(p).toContain('生效时机')
    expect(p).toMatch(/重启/)
  })

  it('有「手动迁移命令」区与「不用你做」的 Agent 说明', () => {
    const p = paneHtml(html, 'storage')
    expect(p).toContain('手动迁移命令')
    expect(p).toMatch(/不用你做|开一个 Agent 窗口/)
  })

  it('迁移五步与「校验不过不写设置」在屏上说清', () => {
    expect(paneHtml(html, 'storage')).toMatch(/备份[\s\S]*建库[\s\S]*迁移[\s\S]*校验[\s\S]*写设置/)
  })
})

describe('原型对齐 · 系统记录屏', () => {
  const html = shell({ pane: 'records', systemRecord: record() })

  it('成组信息齐全：记录文件 / 写入者 / 初始化 / 保留策略', () => {
    const p = paneHtml(html, 'records')
    for (const label of ['记录文件', '写入者', '初始化', '保留策略']) expect(p, label).toContain(label)
  })

  it('本安装版本与版本字段两行在场（能答「这次迁移是哪个版本干的」）', () => {
    const p = paneHtml(html, 'records')
    expect(p).toMatch(/本安装版本|插件版本/)
    expect(p).toMatch(/版本字段|plugin/)
  })

  it('后端使用史时间线在场，且陈旧时无任何合并入口', () => {
    const p = paneHtml(html, 'records')
    expect(p).toContain('后端使用史')
    expect(p).not.toContain('合并')
  })
})

describe('原型对齐 · 通用屏', () => {
  const html = shell({
    pane: 'general',
    pluginVersion: '0.4.2',
    pluginBuildStamp: 'abc123',
    settingsFileExists: false,
    settingsFilePath: '/Users/mac/.dsh/dsh-reqboard-settings.json',
  })

  it('运行信息成组：设置文件 / 台账数据根 / 当前后端 / 插件构建指纹 / 台账 schema / 运行时', () => {
    const p = paneHtml(html, 'general')
    for (const label of ['设置文件', '台账数据根', '当前后端', '构建指纹', 'schema', '运行时']) expect(p, label).toContain(label)
  })

  it('设置文件不存在时：屏内说清「尚未创建」，页头按钮禁用', () => {
    // 位置照原型：说明在「设置文件」那一行里，禁用作用在**页头**的「打开配置文件」上。
    // （原先这条把 disabled 也要求在屏内出现，与原型的位置不符——不是放松，是改准。）
    expect(paneHtml(html, 'general')).toContain('尚未创建')
    // 页头按钮：语义不可用、但**保留可点击**（否则就是人报的「点了没反应」），且旁边有可见旁注
    expect(html).toMatch(/data-action="settings-open-config"[^>]*aria-disabled="true"/)
    expect(html).toMatch(/dsh-pm-set-head-note[^>]*>尚未创建</)
  })
})

/**
 * 形态断言：**四屏都要有屏标题行**（标题 + 副标题同排）。
 *
 * 这一条是被真事逼出来的：记录屏的 `ready` 分支漏了 `title`（只有 loading/error/invalid 带了），
 * 于是「最常见的那种状态反而没有屏标题」——只看单屏渲染的测试永远发现不了，
 * 必须**四屏横向比一遍**才看得出来。
 */
describe('原型对齐 · 四屏共有的形态', () => {
  it('每个屏位都有屏标题（h2.dsh-pm-set-pane-title）', () => {
    const states: Partial<SettingsShellState>[] = [
      { pane: 'limits', limits: limits() },
      { pane: 'storage', storage: storage() },
      { pane: 'records', systemRecord: record() },
      { pane: 'general', pluginVersion: '0.4.2', settingsFileExists: true },
    ]
    for (const s of states) {
      const html = shell(s)
      const pane = String(s.pane)
      expect(paneHtml(html, pane), `屏 ${pane} 缺屏标题`).toContain('dsh-pm-set-pane-title')
    }
  })
})
