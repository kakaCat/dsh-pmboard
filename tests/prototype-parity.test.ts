/**
 * 原型对齐断言（REQ-261004103330-005f 人验收反馈后补；REQ-261006201649-cc89 t4 改造为**可参数化判据的调用方**）。
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
 * ## t4 改造（REQ-261006201649-cc89 FR-5）：从"专属靶子"到"通用判据的调用方"
 *
 * 原来这里 194 行断言**只为这一条需求**存在，新需求无法复用（实测：15 条有原型的需求里
 * 只有 4 条真的对照过——手写成本就是那个缺口的一部分）。现在：
 *   · 判据本体在 `src/domain/prototype/ParityContracts.ts`（纯函数、零 IO，被所有需求共用）；
 *   · 本文件只提供**这一条需求的配置**（原型路径 / 渲染入口 / 取屏方式 / 三组契约）；
 *   · 原有 12 条断言的强度**一律保留**（下面的各自 `it`），`it` 条数只增不减。
 *
 * 权威界面：`docs/requirements/REQ-261004103330-005f/prototype/board-settings.html`
 * 施工清单：`docs/requirements/REQ-261004103330-005f/notes/prototype-parity.md`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSettingsShell } from '../src/client/settings/render/shell.ts'
import { initialShellState, type SettingsShellState } from '../src/client/settings/model.ts'
import { WORKFLOW_STAGES } from '../src/client/workflow-constants.ts'
import type { StageKey, StageLimitView, StorageSettingsView, SystemRecordView } from '../src/client/settings/types.ts'
import { formatParityViolations, prototypeParityViolations } from '../src/domain/prototype/ParityContracts.ts'

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

// ── 被检需求的配置（FR-5：判据通用，配置属被检需求）────────────────────────────
//
// 四条纪律（写在这里，是因为它们是"配置该放哪、该长什么样"的唯一说明处）：
//  ① 配置放 `tests/`，**不进 `src/`**：判据只许"读原型、量实现"，不允许由实现反推原型
//     （`docs/architecture/project-manual.md` 机制备忘，2026-10-05）；
//  ② 每条契约必须能指向**原型里的哪个锚点**——判错了人得回原型看得到；
//  ③ 顺序契约用 `[顺序名, 记号]` 两元形态：原型里的顺序多是语义描述，不是可定位标记；
//  ④ **契约不是照原型抄**：原型与实现的命名体系可以不同（本条的类名就不同，见文末「已知差异」），
//     契约写的是「实现必须有的形态」，抄原型字面量只会得到一堆假红。

/** 权威原型的相对路径（旧目录 `prototype/`，本条需求归档于 2026-10-04，早于 `prototypes/` 口径）。 */
const PROTOTYPE_REL = 'docs/requirements/REQ-261004103330-005f/prototype/board-settings.html'
const prototypeHtml = (): string => readFileSync(fileURLToPath(new URL('../' + PROTOTYPE_REL, import.meta.url)), 'utf8')
const REF = (fr: string): string => PROTOTYPE_REL + '#' + fr

/**
 * 三组契约（按屏位分组的判据）。
 *
 * `classes` 只收实现**真的**该有的结构类；原型的裸类名（`agent-box` / `badge` / `card`…）
 * 没有进契约——理由见文末「已知差异：命名体系不同」，那是待裁定的偏差，不是实现缺陷。
 */
const CONTRACTS = {
  /** 四屏共有的壳结构 */
  shell: {
    classes: ['dsh-pm-set-dlg', 'dsh-pm-set-nav', 'dsh-pm-set-nav-item', 'dsh-pm-set-nav-label', 'dsh-pm-set-pane'],
    dataAttrs: ['data-pane'],
    order: [['导航', 'dsh-pm-set-nav'], ['主区', 'dsh-pm-set-main']],
  },
  /** 运行上限屏 */
  limits: {
    classes: ['dsh-pm-set-pane-limits', 'dsh-pm-set-pane-title', 'dsh-pm-set-limit-row', 'dsh-pm-set-dot', 'dsh-pm-set-limit-default'],
    dataAttrs: [['按阶段的数据行', 'data-stage']],
    order: [['屏标题', 'dsh-pm-set-pane-title'], ['阶段行', 'dsh-pm-set-limit-row'], ['阶段色点', 'dsh-pm-set-dot']],
  },
  /** 存储与数据库屏 */
  storage: {
    classes: ['dsh-pm-set-pane-storage', 'dsh-pm-set-seg', 'dsh-pm-set-pathedit', 'dsh-pm-set-grp-title', 'dsh-pm-set-steps'],
    dataAttrs: [['后端分段开关', 'data-backend']],
    order: [['屏标题', 'dsh-pm-set-pane-title'], ['分组标题', 'dsh-pm-set-grp-title'], ['迁移步骤', 'dsh-pm-set-steps']],
  },
  /** 系统记录屏 */
  records: {
    classes: ['dsh-pm-set-pane-records', 'dsh-pm-set-pane-title', 'dsh-pm-set-grp', 'dsh-pm-set-grp-title', 'dsh-pm-set-json'],
    // [契约名, 记号]：契约名给人读，记号是**在实现里定位的东西**（顺序不能反）
    // 这一屏没有自己的 data-*（取证时实测为空）——契约只有类名与顺序，那才是它真正的结构面
    dataAttrs: [],
    order: [['屏标题', 'dsh-pm-set-pane-title'], ['分组', 'dsh-pm-set-grp'], ['键值行', 'dsh-pm-set-kv']],
  },
  /** 通用屏 */
  general: {
    classes: ['dsh-pm-set-pane-general', 'dsh-pm-set-pane-title', 'dsh-pm-set-kv', 'dsh-pm-set-mono', 'dsh-pm-set-grp'],
    // 页头按钮在 pane 切片之外，屏内没有自己的 data-*——同上，只留类名与顺序
    dataAttrs: [],
    order: [['屏标题', 'dsh-pm-set-pane-title'], ['键值行', 'dsh-pm-set-kv']],
  },
} as const

/** 一次跑完三组契约，返回**人读**摘要（失败时点名契约与锚点，不是一句"不一致"）。 */
function parityReport(screen: keyof typeof CONTRACTS): string {
  const all = shell(screen === 'limits' ? { pane: 'limits', limits: limits() }
    : screen === 'storage' ? { pane: 'storage', storage: storage() }
      : screen === 'records' ? { pane: 'records', systemRecord: record() }
        : { pane: 'general', pluginVersion: '0.4.2', buildStamp: 'abc123' } as never)
  const impl = screen === 'shell' ? all : paneHtml(all, screen)
  const c = CONTRACTS[screen]
  return formatParityViolations(prototypeParityViolations(prototypeHtml(), impl, {
    classes: c.classes as unknown as readonly string[],
    dataAttrs: c.dataAttrs as unknown as readonly (string | readonly [string, string])[],
    order: c.order as unknown as readonly (string | readonly [string, string])[],
  }, REF(screen === 'shell' ? 'FR-1' : 'FR-1')))
}

describe('通用判据 · 需求配置驱动（FR-5）', () => {
  it('壳结构：三组契约零违规', () => {
    expect(parityReport('shell'), '契约违规会被逐条点名（含契约名与原型锚点）').toBe('无违规')
  })
  it('运行上限屏：三组契约零违规', () => {
    expect(parityReport('limits')).toBe('无违规')
  })
  it('存储与数据库屏：三组契约零违规', () => {
    expect(parityReport('storage')).toBe('无违规')
  })
  it('系统记录屏：三组契约零违规', () => {
    expect(parityReport('records')).toBe('无违规')
  })
  it('通用屏：三组契约零违规', () => {
    expect(parityReport('general')).toBe('无违规')
  })

  it('判据真的在量东西：把契约里的一个类名改坏 → 必须出违规', () => {
    const html = shell({ pane: 'limits', limits: limits() })
    const v = prototypeParityViolations(prototypeHtml(), paneHtml(html, 'limits'), {
      classes: ['dsh-pm-set-nonexistent'], dataAttrs: [], order: [],
    }, REF('FR-1'))
    expect(v, '改坏契约若仍零违规，说明这条判据没有在量任何东西').toHaveLength(1)
    expect(v[0]?.anchor).toBe(REF('FR-1'))
  })

  it('判据真的在量东西：把顺序契约反过来 → 必须出违规', () => {
    const html = shell({ pane: 'limits', limits: limits() })
    const v = prototypeParityViolations(prototypeHtml(), paneHtml(html, 'limits'), {
      classes: [], dataAttrs: [],
      order: [['色点', 'dsh-pm-set-dot'], ['阶段行', 'dsh-pm-set-limit-row']],
    }, REF('FR-1'))
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]?.contract).toBe('order')
  })
})

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

/**
 * ## 已知差异：命名体系不同（如实记录，不假装对齐）
 *
 * 原型（2026-10-04 定稿）用的是一套**裸类名**：`agent-box` / `badge` / `card` / `cf-list` /
 * `dlg-head` / `dsh-pm-btn` / `dsh-pm-input`……；实现用的是带前缀的 `dsh-pm-set-*` 体系
 * （`dsh-pm-set-agent` / `dsh-pm-set-badge` / `dsh-pm-set-table` …）。两边**语义能对上，
 * 字面量对不上**——所以上面那份契约写的是"实现必须有"，不是"照原型抄类名"。
 *
 * 下面两条断言把这个差异**量出来并锁住**，目的有两个：
 *   ① 谁想把契约改成"照原型抄类名"，这条会先红，逼人先裁定"以哪套名称为准"；
 *   ② 数量本身是读数：将来真要统一命名体系，这两个数字会变，人能看到变化。
 */
describe('已知差异：原型裸类名 vs 实现前缀类名（待裁定，不假装对齐）', () => {
  /** 原型独有的裸类名：去掉 `dsh-pm-*` 前缀与我们已经在契约里覆盖的，剩下的就是差异面。 */
  const bareClassesInPrototype = (): string[] => {
    const all = (prototypeHtml().match(/class="([^"]*)"/g) ?? [])
      .flatMap(m => m.slice(7, -1).split(/\s+/))
      .map(c => c.trim())
      .filter(c => c.length > 0 && !c.startsWith('dsh-pm'))
    return [...new Set(all)].sort()
  }

  it('原型里存在一批裸类名（差异面非空）——这是读数，不是缺陷', () => {
    const bare = bareClassesInPrototype()
    expect(bare.length, '若这条红了：原型已改用前缀体系，请把契约改成字面量对照').toBeGreaterThan(10)
    expect(bare).toContain('agent-box')
  })

  it('实现侧用的是 dsh-pm-set-* 体系（与原型字面不同）', () => {
    const html = shell({ pane: 'limits', limits: limits() })
    const prefixed = (html.match(/dsh-pm-set-[a-z0-9-]+/g) ?? []).length
    expect(prefixed).toBeGreaterThan(50)
    // 判据：把实现的类名**剥掉自己的前缀**之后，不该与原型裸类名撞上。
    // ⚠️ 必须剥前缀再比——直接 `toContain('badge')` 会被 `dsh-pm-set-badge` 命中，
    //    那是"实现有同类结构"，不是"实现用了原型的字面量"（本用例第一版就是这么误报的）。
    const implementedBare = new Set(
      (paneHtml(html, 'limits').match(/class="([^"]*)"/g) ?? [])
        .flatMap(m => m.slice(7, -1).split(/\s+/))
        .map(c => c.trim().replace(/^dsh-pm-set-/, '').replace(/^is-/, ''))
        .filter(c => c.length > 0),
    )
    // 原型裸类名 `badge` 在实现里对应 `dsh-pm-set-badge`：剥前缀后**会**相同，这是同义映射，不是缺陷。
    // 真正该锁的是「原型有、实现完全没有同义对应」的那批：这里点名几个结构性差异面。
    for (const bare of ['agent-box', 'cf-list', 'dlg-head', 'board-head']) {
      expect(implementedBare.has(bare), '实现里出现了原型裸类名 ' + bare + '：命名体系已变，请更新本节的读数').toBe(false)
    }
  })
})
