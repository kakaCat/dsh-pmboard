#!/usr/bin/env npx tsx
/**
 * 逐组件「计算样式 + 几何」快照 —— **判据一**（REQ-261007133149-0716 FR-3 / FR-5）
 *
 * 为什么需要它：本需求要把 2387 行样式分片并按组件归位，唯一的验收口径是
 * **用户可见外观一点不变**。比 CSS 文本不成立（文本相同不保证级联结果相同），
 * 所以这里比的是**浏览器算出来的那份**：每个组件的计算样式与几何。
 *
 * 用法：
 *   npx tsx scripts/report-style-snapshot.mts --write   # 写/更新基线（改外观时必须显式跑）
 *   npx tsx scripts/report-style-snapshot.mts --check    # 与基线比对（默认）
 *   npx tsx scripts/report-style-snapshot.mts --check --panel docs --width 1280
 *   npx tsx scripts/report-style-snapshot.mts --self-test   # R-1 反向验证：故意改一条组件规则必红（内存演练，不改文件）
 *
 * 退出码：0 = 全等；1 = 有差异（**点名到组件与属性**）；2 = 环境不可用（找不到 Chrome / 读不到 #diag）
 *
 * 口径（阈值与采样条件只放本文件，分片里不放）：
 *   · 采样对象：10 个组件的 DOM 根及其子树（未激活面板不在 DOM → 记 `absent`，不补 0）
 *   · 采样内容：① 代表节点的计算样式（口径属性表 PROPS）② 全部节点的几何（宽高、左上角）
 *   · 采样条件：7 个面板 × {1280,900} × {inflight,terminal}；固定 DSF=1、固定窗口高
 *   · 代表节点口径：组件根 + 每个「标签名.类集合」首次出现的节点（上限 32/组件）
 *     ——CSS 规则是按类生效的，同类的第一个代表节点足以捕获规则级变化
 *
 * 判据先行纪律（本卡在 t-208349 / t-d2d7d2 之前落地）：任何分片/归位改动都必须让
 * `--check` 保持退出码 0；红即回滚该分片，**不许改基线放过**。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WINDOW_HEIGHT, findChrome, specimenShell, specimenShellForPanel,
  type PanelSpecimenKey, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'
import { COMPONENT_MANIFEST } from '../src/client/styles/report/manifest.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'docs/requirements/REQ-261007133149-0716/evidence/style-snapshot.json')
const SCHEMA = 1

/** 组件清单：唯一真相在 `src/client/styles/report/manifest.ts`（FR-1 的组件归属清单），此处只取采样所需的两个字段。 */
const COMPONENTS: readonly { id: string; root: string; label: string }[] =
  COMPONENT_MANIFEST.map(c => ({ id: c.id, root: c.root, label: c.label }))

/** 口径属性表：外观可判 + 跨浏览器序列化稳定。顺序即报告顺序。 */
const PROPS: readonly string[] = [
  'display', 'position', 'color', 'background-color',
  'border-top-width', 'border-top-color', 'border-top-left-radius',
  'padding-top', 'padding-left', 'margin-top', 'margin-bottom',
  'font-size', 'font-weight', 'line-height', 'gap',
]

const WIDTHS: readonly number[] = [1280, 900]
const STATES: readonly SpecimenState[] = ['inflight', 'terminal']
const PANELS: readonly PanelSpecimenKey[] = ['docs', 'dag', 'dialogue', 'verify', 'token', 'prompts']

/**
 * 页内采样脚本：**不含任何断言**（断言在宿主侧），只回报读数。
 *
 * 体积纪律（基线是仓库产物）：计算样式走**样式池**（`pool` + 节点里的 `pi` 下标）；
 * 节点行压成定长数组 `[sig, pi, w, h, dx, dy]`，**不存结构路径**（差异报告时用当次采样的路径）；
 * 另给组件级布局摘要 `[节点数, 根宽, 根高, 子树高之和, 最大下边界]`，兜住"整块塌了/撑了"。
 * 几何口径：宽高 + **相对父盒**的偏移（取整），与 design/interfaces.md 一致。
 */
function samplerScript(panel: string, state: SpecimenState): string {
  return `<script>
(function () {
  var PROPS = ${JSON.stringify(PROPS)};
  var COMPONENTS = ${JSON.stringify(COMPONENTS)};
  var pool = [];
  var poolIndex = {};
  var sigs = [];
  var sigIndex = {};
  function propCells(cs) {
    var cells = [];
    for (var i = 0; i < PROPS.length; i++) cells.push(cs.getPropertyValue(PROPS[i]));
    return cells;
  }
  function sigId(sig) {
    if (sigIndex[sig] === undefined) { sigIndex[sig] = sigs.length; sigs.push(sig); }
    return sigIndex[sig];
  }
  function poolId(cells) {
    var key = cells.join('|');
    if (poolIndex[key] === undefined) { poolIndex[key] = pool.length; pool.push(cells); }
    return poolIndex[key];
  }
  function boxOf(el) {
    var r = el.getBoundingClientRect();
    var pr = el.parentElement ? el.parentElement.getBoundingClientRect() : { left: 0, top: 0 };
    return [Math.round(r.width), Math.round(r.height), Math.round(r.left - pr.left), Math.round(r.top - pr.top)];
  }
  var out = { panel: ${JSON.stringify(panel)}, state: ${JSON.stringify(state)},
    w: window.innerWidth, h: window.innerHeight, sigs: sigs, pool: pool, components: {} };
  for (var ci = 0; ci < COMPONENTS.length; ci++) {
    var c = COMPONENTS[ci];
    var root = document.querySelector(c.root);
    if (!root) { out.components[c.id] = { absent: true }; continue; }
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    var seen = {};
    var nodes = [];
    var sumH = 0;
    var maxBottom = 0;
    var rootTop = root.getBoundingClientRect().top;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      sumH += r.height;
      if (r.bottom - rootTop > maxBottom) maxBottom = r.bottom - rootTop;
      var cls = el.getAttribute('class') || '';
      var sig = el.tagName.toLowerCase() + (cls.length > 0 ? '.' + cls : '');
      // 覆盖纪律：**每个不同类集合都采样**（不设条数上限）。曾经设过"前 32 个"上限，
      // 结果带边框的节点排在 32 名之外 → 改描边颜色判据仍绿（漏测）。覆盖优先，体积靠池化压。
      if (el === root || seen[sig] === undefined) {
        seen[sig] = 1;
        var cs = getComputedStyle(el);
        var b = boxOf(el);
        nodes.push([sigId(sig), poolId(propCells(cs)), b[0], b[1], b[2], b[3]]);
      }
    }
    var rr = root.getBoundingClientRect();
    out.components[c.id] = {
      nodeCount: all.length,
      nodes: nodes,
      layout: [all.length, Math.round(rr.width), Math.round(rr.height), Math.round(sumH), Math.round(maxBottom)],
    };
  }
  var d = document.createElement('div');
  d.id = 'diag';
  d.textContent = JSON.stringify(out);
  document.body.appendChild(d);
})();
</script>`
}

/** 从 `--dump-dom` 的 DOM 文本里取 `#diag` 的 JSON（文本节点里的转义还原后再 parse）。 */
function parseDiag(dom: string): CaseSample | undefined {
  const m = /<div id="diag">([\s\S]*?)<\/div>/.exec(dom)
  if (m === null) return undefined
  const raw = m[1]!
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  try {
    return JSON.parse(raw) as CaseSample
  } catch {
    return undefined
  }
}

/** 跑一件标本页，回报该页的逐组件读数（失败返回可读错误，不抛）。 */
function sampleCase(
  chrome: string, dir: string, panel: string, width: number, state: SpecimenState,
  extraCss = '',
): CaseSample | { error: string } {
  // extraCss 只给 `--self-test` 用：在标本 CSS 之后塞一条合成规则，看判据认不认
  const script = (extraCss.length === 0 ? '' : '<style>' + extraCss + '</style>') + samplerScript(panel, state)
  const html = panel === 'trunk'
    ? specimenShell(width, state, script)
    : specimenShellForPanel(width, state, panel as PanelSpecimenKey, script)
  const page = join(dir, `${panel}-${String(width)}-${state}.html`)
  writeFileSync(page, html)
  const res = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check',
    `--window-size=${String(width)},${String(WINDOW_HEIGHT)}`, '--dump-dom', `file://${page}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (res.status !== 0 && (res.stdout ?? '').length === 0) {
    return { error: `Chrome 调用失败：${(res.stderr ?? '').split('\n')[0]!.slice(0, 160)}` }
  }
  const diag = parseDiag(res.stdout ?? '')
  if (diag === undefined) return { error: '未读到 #diag（标本页脚本未执行？）' }
  return { ...diag, key: `${panel}-${String(width)}-${state}` }
}

function chromeVersion(chrome: string): string {
  const res = spawnSync(chrome, ['--version'], { encoding: 'utf8' })
  return (res.stdout ?? '').trim() || 'unknown'
}

type NodeRow = readonly [string, number, number, number, number, number] // [sig, 样式池下标, w, h, dx, dy]
interface CompSample {
  readonly absent?: true
  readonly nodeCount?: number
  readonly nodes?: readonly NodeRow[]
  readonly layout?: readonly number[] // [节点数, 根宽, 根高, 子树高之和, 最大下边界]
  sigs?: readonly string[]
  pool?: readonly (readonly string[])[]
}
interface CaseSample {
  readonly key: string
  readonly panel: string
  readonly width: number
  readonly state: SpecimenState
  sigs?: readonly string[]
  pool?: readonly (readonly string[])[]
  components: Record<string, CompSample>
}
interface Baseline {
  readonly schema: number
  readonly env: Record<string, unknown>
  readonly props: readonly string[]
  readonly sigs: readonly string[]
  readonly pool: readonly (readonly string[])[]
  readonly cases: readonly CaseSample[]
}

/**
 * 把各 case 的**签名池**与**样式池**并入全局池（节点下标就地改写）。
 * `--check` 时传入的是基线的池副本，于是当次新出现的取值会被追加进池——差异照报（下标不同即差异）。
 */
function adoptPools(cases: CaseSample[], sigPool: string[], propPool: string[][]): void {
  const sigIdx = new Map(sigPool.map((v, i) => [v, i]))
  const propIdx = new Map(propPool.map((p, i) => [p.join('|'), i]))
  for (const c of cases) {
    const sigMap = (c.sigs ?? []).map((sig) => {
      let id = sigIdx.get(sig)
      if (id === undefined) { id = sigPool.length; sigIdx.set(sig, id); sigPool.push(sig) }
      return id
    })
    const propMap = (c.pool ?? []).map((cells) => {
      const key = cells.join('|')
      let id = propIdx.get(key)
      if (id === undefined) { id = propPool.length; propIdx.set(key, id); propPool.push([...cells]) }
      return id
    })
    for (const s of Object.values(c.components)) {
      if (s.absent === true || s.nodes === undefined) continue
      s.nodes = s.nodes.map(n => [sigMap[n[0]] ?? -1, propMap[n[1]] ?? -1, n[2], n[3], n[4], n[5]] as NodeRow)
    }
    delete c.sigs
    delete c.pool
  }
}

const LAYOUT_FIELDS = ['节点数', '根宽', '根高', '子树高之和', '最大下边界'] as const

function diffCase(base: CaseSample, cur: CaseSample, sigPool: readonly string[], pool: readonly (readonly string[])[], out: string[]): number {
  let n = 0
  const ids = [...new Set([...Object.keys(base.components), ...Object.keys(cur.components)])].sort()
  for (const id of ids) {
    const b = base.components[id]
    const c = cur.components[id]
    const at = `${base.key} · ${id}`
    if (b === undefined || c === undefined) { out.push(`${at} · 组件在场性变化`); n++; continue }
    if (b.absent === true || c.absent === true) {
      if (b.absent !== c.absent) {
        out.push(`${at} · 组件在场性变化（absent 基线=${String(b.absent === true)} 现=${String(c.absent === true)}）`)
        n++
      }
      continue
    }
    const bl = b.layout ?? []
    const cl = c.layout ?? []
    for (let i = 0; i < LAYOUT_FIELDS.length; i++) {
      if (bl[i] !== cl[i]) { out.push(`${at} · 布局 · ${LAYOUT_FIELDS[i]} · ${String(bl[i])} → ${String(cl[i])}`); n++ }
    }
    const bn = b.nodes ?? []
    const cn = c.nodes ?? []
    for (let i = 0; i < Math.max(bn.length, cn.length); i++) {
      const x = bn[i]
      const y = cn[i]
      if (x === undefined || y === undefined) {
        out.push(`${at} · 代表节点 #${String(i)} · 增删（${x === undefined ? '' : sigPool[x[0]] ?? ''}）`)
        n++
        continue
      }
      const sigX = sigPool[x[0]] ?? '(未知签名)'
      const sigY = sigPool[y[0]] ?? '(未知签名)'
      const where = `${at} · 代表节点 #${String(i)} ${sigY}`
      if (x[0] !== y[0]) { out.push(`${where} · 选择器签名 · ${sigX} → ${sigY}`); n++ }
      if (x[1] !== y[1]) {
        const bc = pool[x[1]] ?? []
        const cc = pool[y[1]] ?? []
        let reported = false
        for (let k = 0; k < PROPS.length; k++) {
          if (bc[k] !== cc[k]) {
            out.push(`${where} · ${PROPS[k] ?? ''} · ${bc[k] ?? '(缺)'} → ${cc[k] ?? '(缺)'}`)
            n++
            reported = true
          }
        }
        if (!reported) { out.push(`${where} · 样式池下标变化但取值相同`); n++ }
      }
      const bx = [x[2], x[3], x[4], x[5]].join(',')
      const cy = [y[2], y[3], y[4], y[5]].join(',')
      if (bx !== cy) { out.push(`${where} · 几何(w,h,dx,dy) · ${bx} → ${cy}`); n++ }
    }
  }
  return n
}

function countKeys(s: CompSample | undefined): number {
  if (s === undefined || s.absent === true) return 0
  return (s.nodes?.length ?? 0) * PROPS.length + LAYOUT_FIELDS.length
}

/** 逐组件「键数 / 不同键数」——门禁报告的粒度就是组件（FR-3 要求点名到组件）。 */
function perComponentSummary(base: Baseline, cases: readonly CaseSample[], sigPool: readonly string[], pool: readonly (readonly string[])[], baseSigPool: readonly string[]): Map<string, { keys: number; diffs: number }> {
  const acc = new Map<string, { keys: number; diffs: number }>()
  const byKey = new Map(base.cases.map(c => [c.key, c]))
  for (const cur of cases) {
    const b = byKey.get(cur.key)
    if (b === undefined) continue
    for (const id of Object.keys(b.components)) {
      const a = acc.get(id) ?? { keys: 0, diffs: 0 }
      a.keys += countKeys(b.components[id])
      acc.set(id, a)
    }
    const lines: string[] = []
    diffCase(b, cur, baseSigPool, pool, lines)
    for (const line of lines) {
      const id = line.split(' · ')[1] ?? ''
      const a = acc.get(id)
      if (a !== undefined) a.diffs++
    }
  }
  return acc
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

/**
 * 判据一的反向验证（R-1）：**故意改一条组件规则，快照必须红且点名到组件与属性**。
 *
 * 为什么要在内存里演练而不是临时改文件：改文件再还原既慢又容易漏（门禁腐化的代价就是没人再跑它）。
 * 这里把同一件标本页采两遍——一遍原样、一遍在页面里塞一条合成规则（`.dsh-pm-trunk-title` 改色），
 * 用**同一套比对逻辑**跑；两条断言：
 *   · 合成规则命中的组件必须红，且差异点名到 该组件 · 该属性 · 基线值 → 现值（R-1 的判据本体）；
 *   · 塞一条**匹配不到任何元素**的规则必须**不红**（无辜不红，防"瞎报"）。
 * 通过 = 退出码 0；任何一条不符 = 退出码 1（门禁成了装饰品的信号）。
 */
function selfTest(chrome: string, dir: string): number {
  const cases: readonly { id: string; css: string; expectDiffs: boolean; expectComponent: string; expectProp: string }[] = [
    {
      id: 'R-1 改一条组件规则的值（trunk 标题改色）',
      css: '.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-title { color: rgb(1, 2, 3) !important; }',
      expectDiffs: true, expectComponent: 'trunk', expectProp: 'color',
    },
    {
      id: 'R-1 反例（合成规则匹配不到任何元素 = 不许红）',
      css: '.dsh-pm-detail[data-report-shell] .dsh-pm-no-such-class-xyz { color: rgb(9, 9, 9) !important; }',
      expectDiffs: false, expectComponent: '', expectProp: '',
    },
  ]
  let bad = 0
  console.log(`[snapshot] --self-test：反向验证 ${String(cases.length)} 条（合成规则只进标本页，不改仓库文件）`)
  for (const c of cases) {
    const clean = sampleCase(chrome, dir, 'trunk', 1280, 'inflight')
    const mutated = sampleCase(chrome, dir, 'trunk', 1280, 'inflight', c.css)
    if ('error' in clean || 'error' in mutated) {
      console.error(`  ✗ ${c.id}：采样失败（${'error' in clean ? clean.error : (mutated as { error: string }).error}）`)
      bad++
      continue
    }
    const sigPool: string[] = []
    const propPool: string[][] = []
    adoptPools([clean, mutated], sigPool, propPool)
    const lines: string[] = []
    diffCase(clean, mutated, sigPool, propPool, lines)
    const named = lines.some(l => l.includes(' · ' + c.expectComponent + ' · ') && l.includes(c.expectProp))
    if (!c.expectDiffs) {
      if (lines.length === 0) console.log(`  ✅ ${c.id}：按预期不红`)
      else { console.error(`  ✗ ${c.id}：不该红却红了（${String(lines.length)} 处，首条：${lines[0] ?? ''}）`); bad++ }
      continue
    }
    if (lines.length > 0 && named) {
      console.log(`  ✅ ${c.id}：红灯 · ${lines[0] ?? ''}`)
    } else {
      console.error(`  ✗ ${c.id}：该红却没红，或没点名到 ${c.expectComponent}.${c.expectProp}（差异 ${String(lines.length)} 处）`)
      for (const l of lines.slice(0, 5)) console.error('      ' + l)
      bad++
    }
  }
  if (bad > 0) {
    console.error(`[snapshot] FAIL：反向验证有 ${String(bad)} 条不符（门禁是装饰品的信号）`)
    return 1
  }
  console.log('[snapshot] PASS：两条反向验证全对（故意改必红、无辜不红）')
  return 0
}

function main(): number {
  const argv = process.argv.slice(2)
  const write = argv.includes('--write')
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const allDiffs = argv.includes('--all-diffs')
  const onlyPanel = opt('--panel')
  const onlyWidth = opt('--width') === undefined ? undefined : Number(opt('--width'))

  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('[snapshot] 环境不可用：找不到 Chrome（设 CHROME_BIN 或用 --check 在装有 Chrome 的机器上跑）')
    return 2
  }
  const dir = mkdtempSync(join(tmpdir(), 'pm-style-snapshot-'))
  if (argv.includes('--self-test')) return selfTest(chrome, dir)
  const panels: readonly string[] = onlyPanel === undefined ? ['trunk', ...PANELS] : [onlyPanel]
  const widths = onlyWidth === undefined ? WIDTHS : [onlyWidth]

  const cases: CaseSample[] = []
  for (const panel of panels) {
    for (const width of widths) {
      for (const state of STATES) {
        const r = sampleCase(chrome, dir, panel, width, state)
        if ('error' in r) {
          console.error(`[snapshot] ${panel} w=${String(width)} ${state}：${r.error}`)
          return 2
        }
        cases.push(r)
        const present = Object.entries(r.components).filter(([, s]) => s.absent !== true).map(([id]) => id)
        console.log(`  ${r.key}：在场组件 [${present.join(' ')}]`)
      }
    }
  }

  const env = { chrome: chromeVersion(chrome), dsf: 1, viewportHeight: WINDOW_HEIGHT }
  const writeSigPool: string[] = []
  const writePropPool: string[][] = []
  if (write) adoptPools(cases, writeSigPool, writePropPool)
  const fresh: Baseline = { schema: SCHEMA, env, props: PROPS, sigs: writeSigPool, pool: writePropPool, cases }

  if (write) {
    mkdirSync(dirname(BASELINE), { recursive: true })
    writeFileSync(BASELINE, JSON.stringify(fresh, null, 1) + '\n')
    console.log(`[snapshot] --write 已更新基线：${BASELINE.replace(ROOT + '/', '')}`)
    console.log(`  schema=${String(SCHEMA)} chrome=${String(env.chrome)} cases=${String(cases.length)}`
    + ` 签名池=${String(writeSigPool.length)} 样式池=${String(writePropPool.length)}`)
    return 0
  }

  if (!existsSync(BASELINE)) {
    console.error(`[snapshot] 环境不可用：基线不存在（${BASELINE.replace(ROOT + '/', '')}）——先跑 --write`)
    return 2
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline
  if (base.schema !== SCHEMA) {
    console.error(`[snapshot] 基线 schema=${String(base.schema)} 与本脚本 schema=${String(SCHEMA)} 不符——按新口径重跑 --write 并说明差异`)
    return 2
  }

  // --check：把当次读数并入**基线池的副本**（新取值会被追加），保证签名/取值都能按名字报出来
  const sigPool: string[] = [...(base.sigs ?? [])]
  const propPool: string[][] = base.pool.map(p => [...p])
  adoptPools(cases, sigPool, propPool)

  // 设计纪律（interfaces.md）：跨浏览器版本差异必须**显式登记**，不许静默比对——
  // 版本变了就喊话（本脚本仍会照比，但读数差异从此有一等嫌疑解释，不会被当成"外观被改了"藏起来）。
  const baseChrome = String((base.env as { chrome?: unknown }).chrome ?? 'unknown')
  if (baseChrome !== env.chrome) {
    console.log(`[snapshot] ⚠ 环境变化（显式登记，不静默）：基线 chrome=${baseChrome} · 本次 chrome=${env.chrome}`)
    console.log('  若差异集中在序列化形式上（如颜色 alpha 精度），先按归一化规则处理并在此写明，再考虑 --write。')
  }

  const byKey = new Map(base.cases.map(c => [c.key, c]))
  const diffs: string[] = []
  let compared = 0
  for (const cur of cases) {
    const b = byKey.get(cur.key)
    if (b === undefined) { diffs.push(`${cur.key} · 基线里没有这个采样条件（条件集变了？）`); continue }
    compared++
    diffCase(b, cur, base.sigs ?? [], propPool, diffs)
  }
  const perComp = perComponentSummary(base, cases, sigPool, propPool, base.sigs ?? [])

  console.log('[snapshot] 逐组件读数（键数 / 不同键数）：')
  for (const id of COMPONENTS.map(c => c.id)) {
    const s = perComp.get(id)
    if (s === undefined) continue
    console.log(`  ${id.padEnd(9)} 键数=${String(s.keys).padStart(5)} 不同键数=${String(s.diffs)}`)
  }

  if (diffs.length === 0) {
    console.log(`[snapshot] PASS：${String(compared)} 个采样条件、逐组件不同键数全 0（外观零变更）`)
    return 0
  }
  console.log(`[snapshot] FAIL：${String(diffs.length)} 处差异${allDiffs ? '' : '（前 40 条，--all-diffs 看全量）'}`)
  for (const d of diffs.slice(0, allDiffs ? diffs.length : 40)) console.log('  ✗ ' + d)
  return 1
}

process.exit(main())
