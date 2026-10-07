#!/usr/bin/env npx tsx
/**
 * 分片归属门禁 —— **判据二**（REQ-261007133149-0716 FR-1 / FR-2 / FR-5）
 *
 * ## 它回答什么问题
 *
 * 「这条样式规则，属不属于**它所在的那个分片**？」
 *
 * 详情页的样式今天按组件分片，但片尾的覆盖层（⑰ 收敛 / ⑲ 契约落地层 / ㉑ 卡片语汇）
 * 还横跨好几个组件、甚至住在别人的分片里。改一个组件的外观时，这些「住错地方」的规则
 * 会从别处把它拽住——门禁就是把这层推理变成一次静态扫描。
 *
 * ## 判定（判据与阈值只在本文件；分片里不放阈值）
 *
 * 1. **组件分片**（`report/{head,band,tabs}.ts` 与 `report/panels/*.ts`）：
 *    规则里的类名必须属于**本组件**；命中别的组件（或同时命中 ≥2 个组件）⇒
 *    「组件越界」，点名 `分片 · 选择器 · 它属于 X`。
 * 2. **公共层**（`report/{base,tokens,shared}.ts`）：
 *    - 宽选择器（不含任何组件类名）⇒ 允许；
 *    - 一条规则同时命中 **≥2 个组件** ⇒ 允许（一条声明块，组内口径天然逐字相同）；
 *    - 只服务**一个**组件 ⇒ 「公共层含具体组件取值」，点名 `分片 · 选择器 · 它属于 X`。
 * 3. **清单完整性**：真实渲染里每个组件子树的类名，要么被某个组件前缀认领，
 *    要么在下面的公共件白名单里——漏登记一个即红（防止「清单跟不上代码」）。
 * 4. **DOM 根**：清单 10 个组件根在七件标本页（`scripts/fixtures/req-detail-specimen.mts`）
 *    里逐个 `querySelector` 命中 ≥1，并集恒为 10（FR-1 判据）。
 *
 * ## 用法
 *
 * ```
 * npx tsx scripts/report-style-ownership.mts                  # 门禁（默认）
 * npx tsx scripts/report-style-ownership.mts --no-dom         # 只跑静态扫描（不启 Chrome）
 * npx tsx scripts/report-style-ownership.mts --list           # 逐条列出全部命中
 * npx tsx scripts/report-style-ownership.mts --write-baseline # 把当前命中登记成待归位基线
 * ```
 *
 * 退出码：`0` = 通过（未登记越界 0 处）；`1` = 有未登记越界（点名）；`2` = 环境不可用（找不到 Chrome）。
 *
 * ## 待归位基线（ratchet，不藏账）
 *
 * 判据先于归位（D-7）：`shared.ts` 里今天还住着若干「只服务一个组件」的规则、
 * `panels/docs.ts` 里住着验收面板的选择器、`panels/verify.ts` 尚未建——这些都是 **t4 的归位范围**。
 * 它们逐条登记在 `evidence/ownership-baseline.json`，此期间门禁照常退出 0，但：
 *
 * - 出现**未登记**的越界 ⇒ 退出码 1（新债不许悄悄欠）；
 * - 基线里**已清零**的条目 ⇒ 打印「可收紧」提示（t4 每归位一批就能看到进展）。
 *
 * 归位清零后基线清空，门禁输出即为「组件越界 0 处 / 公共层含具体组件取值 0 处」。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPONENT_MANIFEST, PUBLIC_SHARDS, REPORT_EXPORT, componentsOfClass,
  type ComponentId,
} from '../src/client/styles/report/manifest.js'
import {
  WINDOW_HEIGHT, findChrome, specimenShell, specimenShellForPanel,
  type PanelSpecimenKey, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'docs/requirements/REQ-261007133149-0716/evidence/ownership-baseline.json')
const BASELINE_SCHEMA = 1

/** 分片目录（出口 `report.ts` 与清单 `manifest.ts` 不是分片）。 */
const SHELL_DIR = 'src/client/styles/report'
const SHARD_DIRS: readonly string[] = [SHELL_DIR, `${SHELL_DIR}/panels`]
const NOT_A_SHARD = new Set(['report.ts', 'manifest.ts'])

/**
 * 公共**规则**白名单（同样逐条带理由）：某些规则住在公共层是**设计的**，不是越界。
 *
 * 与 `PUBLIC_CLASSES` 的区别：那个按「类名」豁免（跨组件零件），这个按「整条规则」豁免
 * （选择器 + 分片），用于公共层被设计成要承载的既有契约。
 */
const PUBLIC_RULES: readonly { shard: string; selector: string; why: string; owner: 'shared' }[] = [
  {
    shard: 'src/client/styles/report/base.ts',
    selector: '.dsh-pm-msg[hidden],\n.dsh-pm-msg[data-msg-hit="0"]',
    why: '⓪ 基底契约「[hidden] 必须真隐藏」：对话面板的消息行是 display:flex，会盖掉浏览器默认的 [hidden]{display:none}，故必须在基底里钉死（设计 frontend.md 的 base 允许项 / 原型 dialogue 卡已点明「本面板专属契约」）',
    owner: 'shared',
  },
  {
    shard: 'src/client/styles/report/base.ts',
    selector: '.dsh-pm-detail[data-report-shell] .dsh-pm-msg[hidden],\n.dsh-pm-detail[data-report-shell] .dsh-pm-msg[data-msg-hit="0"]',
    why: '同上，岛级前缀版本（两段是同一契约的宽 / 窄两条写法）',
    owner: 'shared',
  },
]

/**
 * 公共件白名单（**逐条带理由**，不许宽泛豁免——宽泛豁免等于把这条判据关掉）。
 *
 * 只收「跨组件的零件」：状态词 / 无障碍工具类 / ⑤ 公共件的板块零件。
 * 判据：这些类名不服务任何单一组件，故不进任何组件的前缀。
 */
const PUBLIC_CLASSES: readonly { selector: string; why: string; owner: 'shared' }[] = [
  { selector: '.completed', why: '阶段条状态词（原型 .stage.done）：状态修饰，不承载组件外观', owner: 'shared' },
  { selector: '.current', why: '阶段条状态词（原型 .stage.cur）：同上', owner: 'shared' },
  { selector: '.danger', why: '状态修饰词（红档）：跨组件语义色名，不是某个组件的类名前缀', owner: 'shared' },
  { selector: '.active', why: 'Tab 激活态修饰词：状态修饰，外观由 .dsh-pm-tab（tabs）承载', owner: 'shared' },
  { selector: '.is-archived', why: '状态修饰词（终态归档）：窗口胶囊的状态，外观由组件自己的规则承载', owner: 'shared' },
  { selector: '.is-missing', why: '状态修饰词（缺件）：跨面板语义，⑤ 公共件口径', owner: 'shared' },
  { selector: '.is-on', why: '状态修饰词（开关态）：DAG 工具行按钮的状态，外观由 .dsh-pm-dag-btn 承载', owner: 'shared' },
  { selector: '.is-prefilled', why: '状态修饰词（预填）：验收单的状态，外观由 .dsh-pm-vsheet 承载', owner: 'shared' },
  { selector: '.sm', why: '尺寸档缩写：跨组件尺寸修饰（原型 .sm）', owner: 'shared' },
  { selector: '.primary', why: '按钮主色修饰词：跨组件语义档，不是某个组件的类名前缀', owner: 'shared' },
  { selector: '.dsh-pm-sr-only', why: '无障碍工具类（视觉隐藏）：⑤ 公共件口径，任何组件都会用', owner: 'shared' },
  { selector: '.dsh-pm-muted', why: '弱化文字（原型 .mut）：⑤ 公共件，跨面板复用', owner: 'shared' },
  { selector: '.dsh-pm-hint', why: '提示文字（原型 .hint）：⑤ 公共件，跨面板复用', owner: 'shared' },
  { selector: '.dsh-pm-note', why: '注解文字（原型 .note）：⑤ 公共件，跨面板复用', owner: 'shared' },
  { selector: '.dsh-pm-empty', why: '空态（原型 .empty）：⑤ 公共件，每个面板都可能出空态', owner: 'shared' },
  { selector: '.dsh-pm-btn', why: '按钮（原型 button）：⑤ 公共件，跨面板复用', owner: 'shared' },
  { selector: '.dsh-pm-chip', why: '芯片（原型 .dchip）：⑤ 公共件，跨面板复用', owner: 'shared' },
  { selector: '.dsh-pm-evidence', why: '证据指针（原型 .evidence）：⑤ 公共件，表格与列表共用', owner: 'shared' },
  { selector: '.dsh-pm-fold', why: '折叠块（原型 details.summary）：⑤ 公共件，跨面板复用', owner: 'shared' },
  { selector: '.dsh-pm-fold-body', why: '折叠块正文：同上，⑤ 公共件', owner: 'shared' },
  { selector: '.dsh-pm-fold-count', why: '折叠块计数徽标：同上，⑤ 公共件', owner: 'shared' },
  { selector: '.dsh-pm-block', why: '板块（原型 .blk）：⑤ 公共件，任何面板板块都套它', owner: 'shared' },
  { selector: '.dsh-pm-block-head', why: '板块标题行（原型 .blk-h）：⑤ 公共件', owner: 'shared' },
  { selector: '.dsh-pm-block-title', why: '板块标题（原型 .blk-title）：⑤ 公共件', owner: 'shared' },
  { selector: '.dsh-pm-block-path', why: '板块路径行（原型 .blk-path）：⑤ 公共件，任何面板板块都会用', owner: 'shared' },
  { selector: '.dsh-pm-block-summary', why: '板块摘要行（原型 .blk-sum）：⑤ 公共件，任何面板板块都会用', owner: 'shared' },
]

// ── 分片读取与规则解析 ────────────────────────────────────────────────────────

interface ParsedRule {
  readonly shard: string
  readonly selector: string
  readonly body: string
}

/** 取 TS 分片文件里的模板字面量正文（分片是纯字符串常量：无反引号转义、无插值）。 */
function cssOf(file: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const a = src.indexOf('`', i)
    if (a < 0) break
    const b = src.indexOf('`', a + 1)
    if (b < 0) break
    out.push(src.slice(a + 1, b))
    i = b + 1
  }
  return out.join('\n')
}

/** 去掉注释（分片里没有放在字符串里的花括号，故不必动字符串字面量——动了反而会毁掉属性选择器的值）。 */
function clean(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 递归解析规则（`@media` / `@supports` / `@layer` 进去；`@keyframes` 等跳过）。 */
function parseRules(shard: string, css: string, out: ParsedRule[]): void {
  let i = 0
  let start = 0
  while (i < css.length) {
    const ch = css.charAt(i)
    if (ch === '{') {
      const prelude = css.slice(start, i).trim()
      // 找配对的 }
      let depth = 1
      let j = i + 1
      while (j < css.length && depth > 0) {
        const c = css.charAt(j)
        if (c === '{') depth++
        else if (c === '}') depth--
        j++
      }
      const body = css.slice(i + 1, depth === 0 ? j - 1 : j)
      if (prelude.startsWith('@')) {
        const name = prelude.slice(1).split(/[\s(]/)[0]!.toLowerCase()
        if (name === 'media' || name === 'supports' || name === 'layer' || name === 'container') {
          parseRules(shard, body, out)
        }
      } else if (prelude.length > 0) {
        out.push({ shard, selector: prelude, body })
      }
      i = j
      start = j
    } else {
      i++
    }
  }
}

const CLASS_RE = /\.([A-Za-z_][-A-Za-z0-9_]*)/g

function classesOf(selector: string): string[] {
  const out: string[] = []
  for (const m of selector.matchAll(CLASS_RE)) out.push(m[1]!)
  return out
}

// ── 判定 ──────────────────────────────────────────────────────────────────────

interface Hit {
  readonly kind: 'component-cross' | 'public-layer-value' | 'missing-shard'
  readonly shard: string
  readonly selector: string
  readonly owner: string
  readonly why: string
}

interface Attribution {
  readonly rule: ParsedRule
  readonly owners: ComponentId[]
}

function attribute(rules: readonly ParsedRule[]): Attribution[] {
  return rules.map((rule) => {
    const owners = new Set<ComponentId>()
    for (const cls of classesOf(rule.selector)) {
      for (const o of componentsOfClass(cls)) owners.add(o)
    }
    return { rule, owners: [...owners].sort() }
  })
}

function componentOfShard(shard: string): ComponentId | undefined {
  return COMPONENT_MANIFEST.find(c => c.shard === shard)?.id
}

function isPublicShard(shard: string): boolean {
  return PUBLIC_SHARDS.some(p => p.shard === shard)
}

function judge(attrs: readonly Attribution[]): Hit[] {
  const hits: Hit[] = []
  for (const a of attrs) {
    const { shard, selector } = a.rule
    const me = componentOfShard(shard)
    if (me !== undefined) {
      if (a.owners.length === 0) continue
      if (a.owners.length === 1 && a.owners[0] === me) continue
      hits.push({
        kind: 'component-cross', shard, selector,
        owner: a.owners.join('+'),
        why: `它属于 ${a.owners.join(' + ')}`,
      })
      continue
    }
    if (isPublicShard(shard)) {
      if (a.owners.length !== 1) continue
      const owner = a.owners[0]!
      hits.push({
        kind: 'public-layer-value', shard, selector, owner,
        why: `它属于 ${owner}（公共层只许写宽选择器与跨 ≥2 个组件的成组规则）`,
      })
    }
  }
  return hits
}

// ── 真实渲染：DOM 根 + 组件子树类名 ───────────────────────────────────────────

interface DomSample {
  /** 组件 id → 命中该根的标本页数 */
  readonly rootHits: Map<string, number>
  /** 组件 id → 子树里出现过的类名 */
  readonly classSets: Map<string, Set<string>>
  /** 七件标本页的根并集 */
  readonly rootUnion: number
}

function domScript(): string {
  return `<script>(function(){
var C = ${JSON.stringify(COMPONENT_MANIFEST.map(c => ({ id: c.id, root: c.root })))};
var out = {};
for (var i=0;i<C.length;i++){
  var r = document.querySelector(C[i].root);
  if(!r){ out[C[i].id] = null; continue; }
  var els = [r].concat(Array.prototype.slice.call(r.querySelectorAll('*')));
  var set = {};
  for (var j=0;j<els.length;j++){
    var cls = (els[j].getAttribute('class')||'').split(/\\s+/);
    for (var k=0;k<cls.length;k++){ if(cls[k]) set[cls[k]]=1; }
  }
  out[C[i].id] = Object.keys(set);
}
var d=document.createElement('div'); d.id='diag'; d.textContent=JSON.stringify(out); document.body.appendChild(d);
})()</script>`
}

function sampleDom(chrome: string, dir: string, panel: string, state: SpecimenState, script: string): Record<string, string[] | null> | string {
  const html = panel === 'trunk'
    ? specimenShell(1280, state, script)
    : specimenShellForPanel(1280, state, panel as PanelSpecimenKey, script)
  const page = join(dir, `${panel}-${state}.html`)
  writeFileSync(page, html)
  const res = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check',
    `--window-size=1280,${String(WINDOW_HEIGHT)}`, '--dump-dom', `file://${page}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const m = /<div id="diag">([\s\S]*?)<\/div>/.exec(res.stdout ?? '')
  if (m === null) return `未读到 #diag（标本页脚本未执行？page=${panel}/${state}）`
  const raw = m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  try {
    return JSON.parse(raw) as Record<string, string[] | null>
  } catch {
    return `#diag 不是合法 JSON（page=${panel}/${state}）`
  }
}

function collectDom(chrome: string): DomSample | string {
  const dir = mkdtempSync(join(tmpdir(), 'pm-ownership-'))
  const script = domScript()
  const panels: readonly string[] = ['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts']
  const states: readonly SpecimenState[] = ['inflight', 'terminal']
  const rootHits = new Map<string, number>()
  const classSets = new Map<string, Set<string>>()
  const union = new Set<string>()
  for (const panel of panels) {
    for (const state of states) {
      const r = sampleDom(chrome, dir, panel, state, script)
      if (typeof r === 'string') return r
      for (const [id, list] of Object.entries(r)) {
        if (list === null) continue
        union.add(id)
        rootHits.set(id, (rootHits.get(id) ?? 0) + 1)
        const s = classSets.get(id) ?? new Set<string>()
        for (const c of list) s.add(c)
        classSets.set(id, s)
      }
    }
  }
  return { rootHits, classSets, rootUnion: union.size }
}

// ── 反向验证（R-1~R-3：门禁必须「故意违规必红」，否则就是恒绿装饰） ──────────────

/**
 * 在内存里注入三条合成规则，断言判定的方向与点名都对：
 *
 * - R-1：验收面板的选择器写进 **docs 分片** ⇒ 必须红，且点名「它属于 verify」；
 * - R-2：组件规则写进 **shared 公共层** ⇒ 必须红，且点名「它属于 verify」；
 * - R-3（反例）：**本组件**的选择器写进本组件分片 ⇒ 必须**不**红（否则门禁在瞎报）。
 *
 * 三条都不碰磁盘文件（注入的是解析后的内存规则），所以 drill 可以随便跑。
 */
function runSelfTest(rules: readonly ParsedRule[]): number {
  const DOCS = `${SHELL_DIR}/panels/docs.ts`
  const SHARED = `${SHELL_DIR}/shared.ts`
  const cases: readonly { id: string; rule: ParsedRule; expectKind: Hit['kind'] | 'none'; expectOwner: string }[] = [
    {
      id: 'R-1 组件越界（verify 的选择器写进 docs 分片）',
      rule: { shard: DOCS, selector: '.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table', body: 'x:y;' },
      expectKind: 'component-cross', expectOwner: 'verify',
    },
    {
      id: 'R-2 公共层含具体组件取值（组件规则写进 shared）',
      rule: { shard: SHARED, selector: '.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table', body: 'x:y;' },
      expectKind: 'public-layer-value', expectOwner: 'verify',
    },
    {
      id: 'R-3 反例（本组件选择器写进本组件分片 = 不许红）',
      rule: { shard: DOCS, selector: '.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path', body: 'x:y;' },
      expectKind: 'none', expectOwner: '',
    },
  ]
  let bad = 0
  console.log(`[ownership] --self-test：反向验证 ${String(cases.length)} 条（注入内存规则，不改磁盘）`)
  for (const c of cases) {
    const h = judge([...attribute(rules), ...attribute([c.rule])]).find(x => key(x) === key(c.rule))
    if (c.expectKind === 'none') {
      if (h === undefined) console.log(`  ✅ ${c.id}：按预期不红`)
      else { console.error(`  ✗ ${c.id}：不该红却红了（${h.why}）`); bad++ }
      continue
    }
    if (h === undefined) { console.error(`  ✗ ${c.id}：该红却没红`); bad++; continue }
    if (h.kind !== c.expectKind || h.owner !== c.expectOwner) {
      console.error(`  ✗ ${c.id}：判成了 kind=${h.kind} owner=${h.owner}（期望 kind=${c.expectKind} owner=${c.expectOwner}）`)
      bad++
      continue
    }
    console.log(`  ✅ ${c.id}：红灯 · ${h.shard} · ${h.selector} · ${h.why}`)
  }
  if (bad > 0) {
    console.error(`[ownership] FAIL：反向验证有 ${String(bad)} 条不符（门禁是装饰品的信号）`)
    return 1
  }
  console.log('[ownership] PASS：三条反向验证全对（故意违规必红、无辜不红）')
  return 0
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

interface BaselineEntry {
  readonly kind: Hit['kind']
  readonly shard: string
  readonly selector: string
  readonly owner: string
  /** 同一 (分片, 选择器) 在文件里出现的次数——带次数才算得准「是不是新欠的」。 */
  readonly count: number
}

interface Baseline {
  readonly schema: number
  readonly note: string
  readonly entries: readonly BaselineEntry[]
}

/** 把命中按 (分片, 选择器) 归并并计数：只比集合会漏掉「同一选择器又被抄了一份」。 */
function groupHits(hits: readonly (Hit & { count?: number })[]): Map<string, BaselineEntry> {
  const m = new Map<string, BaselineEntry>()
  for (const h of hits) {
    const k = key(h)
    const prev = m.get(k)
    if (prev === undefined) m.set(k, { kind: h.kind, shard: h.shard, selector: h.selector, owner: h.owner, count: 1 })
    else m.set(k, { ...prev, count: prev.count + 1 })
  }
  return m
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** 一条登记的债「为什么是债」（列表与红灯共用同一句说法）。 */
function whyOf(e: { kind: Hit['kind']; owner: string }): string {
  if (e.kind === 'missing-shard') return `分片缺失：${e.owner} 的外观今天住在别的分片里`
  if (e.kind === 'component-cross') return `它属于 ${e.owner}`
  return `它属于 ${e.owner}（公共层只许写宽选择器与跨 ≥2 个组件的成组规则）`
}
const key = (h: { shard: string; selector: string }): string => `${h.shard}\u0000${norm(h.selector)}`

function main(): number {
  const argv = process.argv.slice(2)
  const noDom = argv.includes('--no-dom')
  const list = argv.includes('--list')
  const writeBaseline = argv.includes('--write-baseline')
  const selfTest = argv.includes('--self-test')

  // ① 读分片、解析规则
  const shardFiles: string[] = []
  for (const dir of SHARD_DIRS) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const f of readDirRec(abs)) {
      if (!f.endsWith('.ts') || NOT_A_SHARD.has(f.split('/').pop()!)) continue
      const rel = f.replace(ROOT + '/', '')
      if (!shardFiles.includes(rel)) shardFiles.push(rel)
    }
  }
  const rules: ParsedRule[] = []
  for (const f of shardFiles) {
    const rel = f.replace(ROOT + '/', '')
    parseRules(rel, clean(cssOf(rel)), rules)
  }
  const attrs = attribute(rules)
  const allowedRules = new Set(PUBLIC_RULES.map(r => key(r)))
  const allHits = judge(attrs)
  const waived = allHits.filter(h => allowedRules.has(key(h)))
  const hits = allHits.filter(h => !allowedRules.has(key(h)))
  const cross = hits.filter(h => h.kind === 'component-cross')
  const publicLayer = hits.filter(h => h.kind === 'public-layer-value')

  if (selfTest) return runSelfTest(rules)

  // ② 分片缺失（清单里有、磁盘上没有——今天只有 verify）
  const missing: Hit[] = []
  for (const c of COMPONENT_MANIFEST) {
    if (!existsSync(join(ROOT, c.shard))) {
      missing.push({
        kind: 'missing-shard', shard: c.shard, selector: '(分片缺失)',
        owner: c.id, why: `${c.id} 的分片尚未建：它的外观今天住 ${c.tailIn.join(' / ')}`,
      })
    }
  }

  // ③ 真实渲染（DOM 根 + 组件子树类名）
  let dom: DomSample | undefined
  let domError: string | undefined
  if (!noDom) {
    const chrome = findChrome()
    if (chrome === undefined) {
      console.error('[ownership] 环境不可用：找不到 Chrome（设 CHROME_BIN，或用 --no-dom 只跑静态扫描）')
      return 2
    }
    const r = collectDom(chrome)
    if (typeof r === 'string') { domError = r } else { dom = r }
  }

  // ④ 清单完整性：组件子树里的类名必须被前缀或公共白名单认领
  const named = new Set(PUBLIC_CLASSES.map(p => p.selector.replace(/^\./, '')))
  const unregisteredClasses: { className: string; components: string[] }[] = []
  if (dom !== undefined) {
    const byClass = new Map<string, string[]>()
    for (const [id, set] of dom.classSets) {
      for (const c of set) {
        if (componentsOfClass(c).length > 0) continue
        if (named.has(c)) continue
        byClass.set(c, [...(byClass.get(c) ?? []), id])
      }
    }
    for (const [className, ids] of [...byClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      unregisteredClasses.push({ className, components: ids.sort() })
    }
  }

  // ⑤ 与基线比对（ratchet）
  const baseline: Baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline
    : { schema: BASELINE_SCHEMA, note: '', entries: [] }
  if (baseline.schema !== BASELINE_SCHEMA) {
    console.error(`[ownership] 基线 schema=${String(baseline.schema)} 与本脚本 schema=${String(BASELINE_SCHEMA)} 不符——按新口径重跑 --write-baseline 并说明差异`)
    return 2
  }
  const registered = new Map(baseline.entries.map(e => [key(e), e]))
  const actual = groupHits([...cross, ...publicLayer, ...missing])
  const unregistered: { hit: BaselineEntry; baseCount: number }[] = []
  for (const [k, a] of actual) {
    const b = registered.get(k)
    if (b === undefined) unregistered.push({ hit: a, baseCount: 0 })
    else if (a.count > b.count) unregistered.push({ hit: { ...a, count: a.count - b.count }, baseCount: b.count })
  }
  const cleared = baseline.entries.filter(e => !actual.has(key(e)))

  if (writeBaseline) {
    const note = '判据二（分片归属门禁）的待归位基线：这些规则住错了分片，由 t4「覆盖层按组件归位」清空。'
      + '本文件由 npx tsx scripts/report-style-ownership.mts --write-baseline 生成；判据与白名单在脚本里，本文件只记「已知的债」。'
      + 'count = 同一 (分片, 选择器) 的出现次数——实际次数超过它即判「新欠的」并红灯。'
    const entries: BaselineEntry[] = [...actual.values()]
      .map(e => ({ kind: e.kind, shard: e.shard, selector: e.selector, owner: e.owner, count: e.count }))
      .sort((a, b) => (a.shard + a.selector).localeCompare(b.shard + b.selector))
    mkdirSync(dirname(BASELINE), { recursive: true })
    writeFileSync(BASELINE, JSON.stringify({ schema: BASELINE_SCHEMA, note, entries }, null, 1) + '\n')
    console.log(`[ownership] --write-baseline 已更新：${BASELINE.replace(ROOT + '/', '')}（登记 ${String(entries.length)} 条 · 合计 ${String(entries.reduce((n, e) => n + e.count, 0))} 处）`)
    return 0
  }

  // ⑥ 报告
  console.log(`[ownership] 扫描 ${String(shardFiles.length)} 个分片 · ${String(rules.length)} 条规则 · 清单 ${String(COMPONENT_MANIFEST.length)} 个组件`)
  console.log(`[ownership] 组件越界 ${String(cross.length)} 处 / 公共层含具体组件取值 ${String(publicLayer.length)} 处`)
  console.log(`[ownership] 待归位基线：登记 ${String(baseline.entries.length)} 条 · 已清零 ${String(cleared.length)} 条 · 未登记 ${String(unregistered.length)} 条`)
  console.log(`[ownership] 逐条白名单放行：类名 ${String(PUBLIC_CLASSES.length)} 条 · 规则 ${String(waived.length)} 条（理由写在脚本里）`)
  if (missing.length > 0) {
    for (const h of missing) console.log(`[ownership] ⚠ ${h.shard}：${h.why}`)
  }
  if (list) {
    for (const [k, h] of actual) {
      const b = registered.get(k)
      const tag = b === undefined ? '未登记' : (h.count > b.count ? '加量未登记' : '待归位')
      console.log(`  [${tag}] ${h.shard} · ${h.selector} · ${whyOf(h)}${h.count > 1 ? `（×${String(h.count)}）` : ''}`)
    }
  }
  if (cleared.length > 0) {
    console.log(`[ownership] 可收紧：基线里 ${String(cleared.length)} 条已不再是越界（归位有进展），跑 --write-baseline 收紧基线`)
    if (list) for (const e of cleared) console.log(`  [已清零] ${e.shard} · ${e.selector}`)
  }

  if (domError !== undefined) {
    console.error(`[ownership] 环境不可用：${domError}`)
    return 2
  }
  if (dom !== undefined) {
    const missingRoots = COMPONENT_MANIFEST.filter(c => (dom.rootHits.get(c.id) ?? 0) === 0)
    const unionOk = dom.rootUnion === COMPONENT_MANIFEST.length
    console.log(`[ownership] DOM 根：七件标本页并集 componentRootCount = ${String(dom.rootUnion)}（期望 ${String(COMPONENT_MANIFEST.length)}）`)
    if (missingRoots.length > 0 || !unionOk) {
      console.error('[ownership] FAIL：以下组件根在真实渲染里一次都没命中——' + missingRoots.map(c => `${c.id}(${c.root})`).join('、'))
      return 1
    }
    console.log(`[ownership] 清单完整性：组件子树类名 ${String([...dom.classSets.values()].reduce((n, s) => n + s.size, 0))} 个${unregisteredClasses.length === 0 ? '，全部已被前缀或公共白名单认领' : `，其中 ${String(unregisteredClasses.length)} 个未登记`}`)
    if (unregisteredClasses.length > 0) {
      console.error('[ownership] FAIL：真实渲染里出现了清单没登记的类名（要么进 manifest 前缀，要么进 PUBLIC_CLASSES 白名单并写理由）：')
      for (const c of unregisteredClasses) console.error(`  ✗ ${c.components.join('+')} · .${c.className}`)
      return 1
    }
  }

  if (unregistered.length > 0) {
    console.error(`[ownership] FAIL：未登记越界 ${String(unregistered.reduce((n, u) => n + u.hit.count, 0))} 处（新债不许悄悄欠；若确属 t4 范围，跑 --write-baseline 显式登记）：`)
    for (const u of unregistered) {
      console.error(`  ✗ ${u.hit.shard} · ${u.hit.selector} · ${whyOf(u.hit)}`
        + (u.baseCount > 0 ? `（基线已登记 ${String(u.baseCount)} 次，实际多出 ${String(u.hit.count)} 次）` : ''))
    }
    return 1
  }

  console.log(`[ownership] PASS：组件越界 ${String(cross.length)} 处 / 公共层含具体组件取值 ${String(publicLayer.length)} 处 —— 全部已在待归位基线登记（未登记 0 处）`)
  if (cross.length > 0 || publicLayer.length > 0 || missing.length > 0) {
    console.log(`[ownership] 下一步：t4「覆盖层按组件归位」按基线逐条清零；清完跑 --write-baseline 收紧，输出即为 0 处 / 0 处`)
  }
  return 0
}

function readDirRec(abs: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(abs)) {
    const p = join(abs, name)
    if (name.endsWith('.ts')) out.push(p)
    else if (!name.includes('.')) out.push(...readDirRec(p))
  }
  return out
}

process.exit(main())
