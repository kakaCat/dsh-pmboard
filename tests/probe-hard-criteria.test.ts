/**
 * 探针族「判据必须硬」的**源码级**断言（REQ-261005105032-3b02 · 卡 t-ed8a64 · FR-4 / 验收标准 8）。
 *
 * ## 它解决什么问题
 *
 * `scripts/req-report-probe.mts` 这类探针把真实渲染读成一组**几何量**（Tab 栏 top、评论列表整块高、
 * 三格高度……）。这些量曾经有一段时期只出现在 `line('[诊断] …')` 里——**只打印、不判失败**：
 * 页面把 Tab 栏顶到 1118px（首屏看不到六个 Tab）时探针照样绿。缺陷修好之后，"打印行"随时可能
 * 再次长回来（新增一个几何量、顺手打印一下看看）——**靠自觉守不住**，所以这里把它变成会失败的检查。
 *
 * ## 判据（机械可核验，不看人）
 *
 * ① **观测量注册表**：从探针源码的 `interface Diag` 里机械提取**数值型**字段（叶子名）。
 *    阈值（`tabsTopMax` / `commentListMaxH` / …）按命名后缀 `Max…|Limit…` 排除——它们是**判据本身**，
 *    不是被观测的量；计数诊断（`scanned` / `tabCount`）显式登记在 `NON_GEOMETRY` 并写明理由
 *    （它们的判据落在派生清单/布尔上：`bad.length === 0`、`a1.tabs`）。
 * ② **每个观测量都必须有失败分支**：源码里必须存在**一行**同时含有该量（`.名字`）与失败标记
 *    （`problems.push` / `bad.push` / `failures.push` / `throw` / `process.exit` / `console.error`）。
 *    命中数必须为 **0**。
 * ③ **环境判据必须在位**（卡面点名的另外两条）：无 Chrome → `process.exit(2)`（不许静默跳过）；
 *    `--window-size` 回读校验（实际视口宽 ≠ 期望即报错；否则量出来的几何量可能整体作废）。
 * ④ **既有硬上限保留**：`TABS_TOP_MAX = 713`。
 *
 * ## 为什么要给扫描器本身做逆验证（`describe('扫描器自检')`）
 *
 * 一个恒返回「无命中」的扫描器是最容易写出来的**空转判据**（它会让上面三条全绿）。
 * 故这里用合成片段喂同一个扫描函数：只有打印的必须命中，有失败分支的必须不命中。
 *
 * @module tests/probe-hard-criteria
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPTS_DIR = join(process.cwd(), 'scripts')

/** 失败标记：出现即视为"这一行会红"（把几何量送进失败路径，而不是只打印）。 */
const FAILURE_MARKERS = [
  'problems.push', 'bad.push', 'failures.push',
  'throw ', 'process.exit', 'console.error',
] as const

/**
 * 计数诊断（**不是**几何量）：判据落在它们派生的布尔/清单上，故不要求自身出现在失败分支里。
 * 每条都写清"判据落在哪"，避免这份名单变成"想放过就加一条"的后门。
 */
const NON_GEOMETRY: Readonly<Record<string, string>> = {
  scanned: 'A3 的扫描计数：判据落在 bad 清单长度上（diag.a3.bad.length === 0）',
  tabCount: 'A1 的 Tab 计数：判据落在派生布尔 a1.tabs（tabCount === 6）上，且页内脚本逐条点名实得个数',
}

interface Inspection {
  /** 观测量注册表（叶子名，已排除阈值与计数诊断） */
  quantities: string[]
  /** 阈值字段（按 Max|Limit 后缀排除，登记出来供人核对） */
  thresholds: string[]
  /** 有失败分支的观测量 */
  judged: string[]
  /** 只打印、无失败分支的观测量（**命中**，必须为空） */
  violations: string[]
}

/** 从 `interface Diag { … }` 文本里取数值型字段的叶子名（含 `number[]`）。 */
function numericLeaves(ifaceText: string): string[] {
  const out: string[] = []
  for (const m of ifaceText.matchAll(/(?:^|[\s{;])([A-Za-z_]\w*)\??:\s*(number\[\]|number)\b/gm)) {
    const name = m[1]
    if (name !== undefined && !out.includes(name)) out.push(name)
  }
  return out
}

/** 取 `interface Diag {` 起至同名层级收尾 `}` 的接口文本（探针源码里的唯一一处）。 */
function diagInterfaceText(src: string): string {
  const start = src.indexOf('interface Diag {')
  expect(start, '探针源码里找不到 `interface Diag {`——观测量注册表无从推导').toBeGreaterThanOrEqual(0)
  const end = src.indexOf('\n}', start)
  expect(end, '`interface Diag {` 没有找到收尾的顶层 `}`').toBeGreaterThan(start)
  return src.slice(start, end + 2)
}

/** 该观测量是否在源码某一行里被送进失败路径（行级即可：判据行与量写在同一行是本文的书写约定）。 */
function hasJudgedLine(src: string, name: string): boolean {
  const path = new RegExp('\\.' + name + '\\b')
  return src.split('\n').some(line => path.test(line) && FAILURE_MARKERS.some(mk => line.includes(mk)))
}

/** 扫描器本体（纯函数，供用例与「扫描器自检」共用同一份实现）。 */
function inspect(src: string): Inspection {
  const leaves = numericLeaves(diagInterfaceText(src))
  const thresholds: string[] = []
  const quantities: string[] = []
  for (const name of leaves) {
    if (/(?:Max|Limit)\w*$/.test(name)) thresholds.push(name)
    else if (NON_GEOMETRY[name] === undefined) quantities.push(name)
  }
  const judged = quantities.filter(name => hasJudgedLine(src, name))
  const violations = quantities.filter(name => !judged.includes(name))
  return { quantities, thresholds, judged, violations }
}

/** 参与扫描的探针（卡面口径：`scripts/req-*-probe.mts`）。 */
function probeFiles(): string[] {
  return readdirSync(SCRIPTS_DIR)
    .filter(f => /^req-.*-probe\.mts$/.test(f))
    .sort()
}

describe('探针族几何量硬判据（源码级）', () => {
  it('扫描对象存在：scripts/req-*-probe.mts 至少一份（本次口径 = req-report-probe.mts）', () => {
    const files = probeFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain('req-report-probe.mts')
  })

  for (const file of probeFiles()) {
    const src = readFileSync(join(SCRIPTS_DIR, file), 'utf8')

    it(`${file}：每个几何量都有断言分支（只打印不判 = 命中 0）`, () => {
      const r = inspect(src)
      // 注册表非平凡：推导不出来就是判据空转（这条防"我把注册表写空了"）
      expect(r.quantities.length, '观测量注册表为空 ⇒ 本判据空转').toBeGreaterThanOrEqual(15)
      // 命中即失败：打印了却没有任何失败分支
      expect(r.violations, `只打印、无断言分支的几何量：${r.violations.join('、')}`).toEqual([])
      // 打印出来（失败时的可读日志）
      console.log(`[${file}] 观测量 ${String(r.quantities.length)} 项全部有失败分支：`
        + r.quantities.join('、'))
      console.log(`[${file}] 阈值（判据本身，不要求自证）：${r.thresholds.join('、')}`)
      console.log(`[${file}] 计数诊断（判据落在派生读数上）：${Object.keys(NON_GEOMETRY).join('、')}`)
    })

    it(`${file}：无 Chrome 环境必须 exit 2（响亮失败，不许静默跳过）`, () => {
      expect(src).toMatch(/找不到 Chrome/)
      expect(src).toMatch(/process\.exit\(2\)/)
      // exit 2 与 exit 1 必须是**两条**分支（一个去装浏览器、一个去看页面）
      expect((src.match(/process\.exit\(2\)/g) ?? []).length).toBeGreaterThanOrEqual(1)
      expect(src).toMatch(/process\.exit\(1\)/)
    })

    it(`${file}：回读校验实际视口宽 == 期望（--window-size 未生效即报错）`, () => {
      expect(src).toContain('--window-size=')
      expect(src).toMatch(/diag\.w\s*!==\s*width/)
      expect(src).toMatch(/--window-size 未生效/)
    })

    it(`${file}：既有硬上限 TABS_TOP_MAX = 713 保留`, () => {
      expect(src).toMatch(/const TABS_TOP_MAX = 713/)
      expect(src).toMatch(/tabsTop > diag\.tabsTopMax/)
      expect(src).toMatch(/tabsTop <= TABS_TOP_MAX/)
    })
  }
})

describe('扫描器自检（判据不许空转）', () => {
  const IFACE = 'interface Diag {\n  geom: { tabsTop: number; headH: number }\n}\n'

  it('只打印、无失败分支 → 必须命中', () => {
    const src = IFACE + "line(`[诊断] Tab 栏@${String(diag.geom.tabsTop)} 头部 ${String(diag.geom.headH)}`)\n"
    const r = inspect(src)
    expect(r.violations.sort()).toEqual(['headH', 'tabsTop'])
  })

  it('同一行有失败分支 → 必须不命中', () => {
    const src = IFACE
      + "if (diag.geom.tabsTop > diag.tabsTopMax) bad.push('Tab 栏不在首屏内 top ' + String(diag.geom.tabsTop))\n"
      + "if (diag.geom.headH > diag.geom.vh) bad.push('头部整块装不下 ' + String(diag.geom.headH))\n"
    const r = inspect(src)
    expect(r.violations).toEqual([])
  })

  it('阈值字段（Max…/Limit… 后缀）不进注册表：它们是判据本身', () => {
    const src = 'interface Diag {\n  tabsTopMax: number\n  commentListMaxH: number\n  tabsTop: number\n}\n'
    const r = inspect(src)
    expect(r.thresholds.sort()).toEqual(['commentListMaxH', 'tabsTopMax'])
    expect(r.quantities).toEqual(['tabsTop'])
  })

  it('计数诊断不因"没进失败分支"而命中（但名单里必须写明判据落在哪）', () => {
    const src = 'interface Diag {\n  a3: { scanned: number }\n}\nconsole.log(String(diag.a3.scanned))\n'
    const r = inspect(src)
    expect(r.quantities).toEqual([])
    for (const why of Object.values(NON_GEOMETRY)) expect(why.length).toBeGreaterThan(0)
  })
})
