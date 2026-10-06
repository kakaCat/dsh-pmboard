/**
 * 卡面门读数「三态 + 降级」出图脚本（REQ-261006175040-12d4 · t9 / FR-7）。
 *
 * 对应设计 `design/test-cases.md` 的 **T-13**：真渲染 + 真 CSS 出 PNG，供人对照权威原型
 * `prototypes/card-gates.html`（T-14 的人评审）。
 *
 * ## 为什么必须出图（而不是只跑断言）
 *
 * 本次修的是"卡面说的与台账一致不一致"，断言能钉住**文本**，但钉不住"看起来是不是那张卡"——
 * 样式错位、chips 换行错乱、按钮跑到别处，断言全绿而人一眼看出不对。出图补上这一半。
 *
 * ## 两道失败线（出图前先断言"画的是对的东西"）
 *
 * 出图本身只证明"Chrome 拍到了一张图"。故本脚本在拍之前先在**渲染出的 HTML** 上断言该状态的
 * 标志性内容（例如"实施期必须有 ✓ 需求文档 与 门 3/4、必须没有确认按钮"；"降级态必须整块没有
 * chips 行"）——渲染坏了就退出码 1，不会交出一张"看着像但其实错"的图。
 *
 * ## 用法与产物
 *
 * ```
 * npx tsx scripts/card-gates-ui-shot.mts
 * ```
 * 产物（`SCALE` 倍图，覆盖写入——它不是"改动前基线"，而是**当前实现**的对照图）：
 *   docs/requirements/REQ-261006175040-12d4/evidence/card-gates-<状态>-1280-cards.png
 *
 * 退出码：**0** = 四张都出好了；**1** = 有图没出成 / 出的图不像话（尺寸或体量不对，响亮失败）；
 *         **2** = 环境不可用（找不到 Chrome），打修复指引，不静默跳过。
 *
 * @module dsh-pmboard/scripts/card-gates-ui-shot
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_CSS } from '../src/client/styles/base.js'
import { BOARD_CSS } from '../src/client/styles/board.js'
import { SUBTASK_CSS } from '../src/client/styles/subtask.js'
import { renderReqCard } from '../src/client/views/artifacts.js'
import type { GateReading, ReqCard, RequirementRecord } from '../src/client/types.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '../docs/requirements/REQ-261006175040-12d4/evidence')

/** 2 倍图：人看细节用（与既有出图脚本同口径）。 */
const SCALE = 2
const WIDTH = 1280
const HEIGHT = 900
/** 低于这个体量基本是白图 / 半张图（既有脚本同款下限思路）。 */
const MIN_PNG_BYTES = 8_000
/** 标本页只吃卡面需要的三段样式（真实页面吃什么，标本就吃什么——不额外注入"仅截图用 CSS"）。 */
const SPECIMEN_CSS = BASE_CSS + BOARD_CSS + SUBTASK_CSS

interface ShotState {
  readonly key: string
  readonly label: string
  readonly req: RequirementRecord
  /** 期望在渲染结果里出现的内容（缺一即判"画错"）。 */
  readonly mustContain: readonly string[]
  /** 期望**不**出现的内容（出现即判"画错"）。 */
  readonly mustNotContain: readonly string[]
}

const T0 = 1_791_262_857_854
const T1 = 1_791_280_122_935

function req(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-261006130057-7a43',
    title: 'PM 插件需求详情页 UI 优化（原型先行）',
    description: '',
    status: 'implementing',
    blocked: false,
    category: 'feature',
    comments: [],
    version: 89,
    createdAt: T0,
    updatedAt: T1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'agent' },
    ...over,
  }
}

const G = (kind: string, status: GateReading['status'], count: number): GateReading => ({ kind, status, count })

const STATES: readonly ShotState[] = [
  {
    key: 'analysis',
    label: '需求分析期：需求文档待确认（可点）· 门 0/4 · 确认产物按钮在场',
    req: req({
      status: 'brainstorming',
      gates: [G('requirement', 'pending', 1), G('design', 'missing', 0), G('decomposition', 'missing', 0), G('verification', 'missing', 0)],
    }),
    mustContain: ['⏳ 需求文档', '门 0/4', '确认产物', 'data-kind="requirement"'],
    mustNotContain: ['产物 0/6', '门待确认'],
  },
  {
    key: 'design-group',
    label: '设计期成组确认：6 份里 1 份未落章 ⇒ 设计门待确认 · 门 1/4 · 按钮写明份数',
    req: req({
      status: 'design',
      gates: [G('requirement', 'confirmed', 1), G('design', 'pending', 6), G('decomposition', 'missing', 0), G('verification', 'missing', 0)],
    }),
    mustContain: ['✓ 需求文档', '⏳ 设计文档', '确认产物（全部 6 份）', '门 1/4'],
    mustNotContain: ['产物 1/6'],
  },
  {
    key: 'implementing',
    label: '实施期：需求/设计/计划已落章 · 验收未交 · 门 3/4 · 无确认按钮',
    req: req({
      status: 'implementing',
      gates: [G('requirement', 'confirmed', 1), G('design', 'confirmed', 6), G('decomposition', 'confirmed', 1), G('verification', 'missing', 0)],
      planState: 'approved',
    }),
    mustContain: ['✓ 需求文档', '✓ 设计文档', '✓ 拆分计划', '✗ 验收材料', '门 3/4', '计划已批'],
    mustNotContain: ['确认产物', '产物 0/6'],
  },
  {
    key: 'degraded',
    label: '读数不可得（旧服务端）：门相关块整块不渲染 —— 读不到 ≠ 缺失',
    req: req({ status: 'implementing' }),
    mustContain: ['PM 插件需求详情页 UI 优化（原型先行）'],
    mustNotContain: ['dsh-pm-artifact-chips', 'dsh-pm-artifact-derived', '确认产物', '✗ ', '产物 0/6', '门 0/4'],
  },
]

/**
 * 真实卡片 markup（`renderReqCard`）。
 *
 * 内容断言只在这一段上做：整页 HTML 还含 `<style>` 里的**选择器名**（`.dsh-pm-artifact-chips` 等），
 * 拿整页断言会把"样式表里有这个类"误判成"卡片渲染了这一块"（本脚本第一版就踩了，degraded 那条假红）。
 */
function cardHtmlOf(state: ShotState): string {
  // 四态用**同一组**进度计数（26/38，取自被截图那条需求的真实读数）：
  // 这样图上唯一的差异就是门读数本身（单变量对照，与原型 B/D 两区的做法一致）。
  const card: ReqCard = { req: state.req, tasks: [], doneCount: 26, totalCount: 38, readyIds: [], blocked: false }
  return renderReqCard(card, T1 + 120_000)
}

/** 出图用的一屏：真实卡片 markup + 真实 CSS + 一行说明。 */
function page(state: ShotState, html: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${state.label}</title>
<style>${SPECIMEN_CSS}
  body { margin: 0; padding: 24px; background: var(--dsw-bg-primary, #fff); }
  .shot-note { font: 12px/1.6 system-ui, sans-serif; color: #666; margin-bottom: 12px; }
  .dsh-pm-lane { width: 360px; }
</style></head>
<body>
  <div class="shot-note">REQ-261006175040-12d4 · 卡面门读数 · <b>${state.label}</b>（对照权威原型 prototypes/card-gates.html）</div>
  <div class="dsh-pm-lane">${html}</div>
</body></html>`
}

/** Chrome 可执行文件（与既有出图脚本同一份候选表，避免两处各写一套落点）。 */
function findChrome(): string | undefined {
  const candidates = [
    process.env['CHROME_BIN'],
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)
  return candidates.find(p => existsSync(p))
}

/** PNG 像素宽高（读 IHDR；读不出 → undefined）。 */
function pngSize(file: string): { width: number; height: number } | undefined {
  const buf = readFileSync(file)
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return undefined
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** 跑一次 headless Chrome（只在"进程起不来"时重试一次，与既有脚本同口径）。 */
function shoot(chrome: string, args: string[]): void {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      execFileSync(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
      return
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    console.error('本机常见落点：/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    process.exit(2)
  }
  console.log(`卡面门读数出图（真实渲染 · ${String(SCALE)} 倍图 · ${String(WIDTH)}×${String(HEIGHT)}）`)
  console.log(`Chrome：${chrome}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const dir = mkdtempSync(join(tmpdir(), 'pm-card-gates-shot-'))
  const failures: string[] = []

  try {
    for (const state of STATES) {
      const html = cardHtmlOf(state)
      // ① 先断言"画的是对的东西"——只在**卡片 markup** 上断言（不含样式表），渲染坏了就响亮失败
      for (const needle of state.mustContain) {
        if (!html.includes(needle)) failures.push(`${state.key}：卡片渲染缺「${needle}」`)
      }
      for (const needle of state.mustNotContain) {
        if (html.includes(needle)) failures.push(`${state.key}：卡片渲染不该出现「${needle}」`)
      }
      if (failures.some(f => f.startsWith(state.key + '：'))) continue
      const payload = page(state, html)

      const pageFile = join(dir, `${state.key}.html`)
      const out = join(OUT_DIR, `card-gates-${state.key}-1280-cards.png`)
      writeFileSync(pageFile, payload)
      rmSync(out, { force: true }) // 先删旧图：Chrome 没写出文件时不会被上一轮旧图冒充
      try {
        shoot(chrome, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars',
          `--force-device-scale-factor=${String(SCALE)}`,
          '--no-first-run', '--no-default-browser-check',
          '--run-all-compositor-stages-before-draw',
          `--window-size=${String(WIDTH)},${String(HEIGHT)}`,
          `--screenshot=${out}`, `file://${pageFile}`,
        ])
      } catch (e) {
        failures.push(`${state.key}：Chrome 出图失败（${(e as Error).message.split('\n')[0]!.slice(0, 160)}）`)
        continue
      }
      if (!existsSync(out)) {
        failures.push(`${state.key}：截图文件没生成（${out}）`)
        continue
      }
      const bytes = statSync(out).size
      const px = pngSize(out)
      if (px === undefined) { failures.push(`${state.key}：不是合法 PNG（IHDR 读不出宽高）`); continue }
      if (bytes < MIN_PNG_BYTES) { failures.push(`${state.key}：图体量 ${String(bytes)}B < ${String(MIN_PNG_BYTES)}B（像白图）`); continue }
      if (px.width !== WIDTH * SCALE) { failures.push(`${state.key}：图宽 ${String(px.width)}px ≠ ${String(WIDTH * SCALE)}px（倍率口径不符）`); continue }
      console.log(`  OK ${state.key} → ${out}（${String(bytes)} B · ${String(px.width)}×${String(px.height)}）`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('SHOT FAIL（退出码 1）：')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log(`全部 ${String(STATES.length)} 张出图成功 → ${OUT_DIR}`)
}

main()
