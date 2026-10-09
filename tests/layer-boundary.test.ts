/**
 * 层边界机械检查（REQ-47939a t1）——把 design/architecture.md 的依赖方向表变成**可失败的检查**。
 *
 * 为什么先立这个测试再搬代码：REQ-2e9473 的教训是"只测成功路径等于没测"。分层重构最容易
 * 无声跑偏的方式不是编译错误，而是某天有人顺手在 domain 里 \`import { readFileSync }\` 或
 * 在上层又写一遍 \`status === 'design'\` —— 编译、测试、review 全都不报，规则却已经两处实现。
 * 本测试就是那条会响的线。
 *
 * 口径对齐：design/architecture.md §2 依赖方向表 / INV-2。
 * 防假绿：末尾两条自检断言（扫描器命中文件数下限、import 抽取自检）——扫描器自身失效时
 * 必须让测试红，而不是安静通过（2026-09-17 契约扫描器踩过这个坑）。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { REQBOARD_ERROR_CODES, domainError } from '../src/domain/errors.js'
import { REQ_TRANSITIONS } from '../src/domain/requirement/RequirementStatus.js'
import { TASK_TRANSITIONS } from '../src/domain/task/TaskStatus.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 递归列出 .ts 文件（SRC 下的绝对路径）。 */
function listTs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTs(p))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 抽取 import 的模块说明符（静态 / 类型 / 动态 import / 副作用 import 全覆盖）。 */
function extractImports(text: string): string[] {
  const specs: string[] = []
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) specs.push(m[1]!)
  return specs
}

interface LayerRule { forbidden: RegExp[]; why: string }

const LAYER_RULES: Record<string, LayerRule> = {
  domain: {
    forbidden: [
      /^node:/, /^@deepseek-ai\//, /^@pi-investment\//,
      /^\.\.\/(application|adapters|tools|http|client|host|shared)\//,
    ],
    why: 'domain 是最内层：不许碰 I/O（node:）、框架（@deepseek-ai）、上层模块与 shared',
  },
  application: {
    forbidden: [
      /^node:/, /^@deepseek-ai\//, /^@pi-investment\//,
      /^\.\.\/(adapters|tools|http|client|host)\//,
    ],
    why: 'application 只依赖 domain 与 shared 的**类型**；一切 I/O 走端口',
  },
  shared: {
    forbidden: [/^node:/, /^\.\.\/(application|adapters|tools|http|client|host)\//],
    why: 'shared 是 host 与 client 共用的契约层，不得依赖任何一侧实现',
  },
}

const allTs = listTs(SRC)
const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/')

// ---------------------------------------------------------------------------
// 豁免面（REQ-261008020617-088f RF-7）
//
// 为什么需要它：这门此前**没有任何豁免出口**——任何一处"当期确不修、但另有用例/需求承接"的越界，
// 唯一结果就是这条用例永久红，而永久红等于没人看（15 处越界里那三份同构克隆就是"红了没人看"的产物）。
// 出口一旦存在就必须**能被机械审计**，故四条判据全部落在本文件里，台账只是数据：
//   ① 双向相等：每条豁免必须仍命中一处真实越界（实现修好后忘了删 → 过期豁免即红）；
//   ② 残量归零：剔掉已豁免项后，未豁免的越界必须为空；
//   ③ 理由非空：reason / plan 各 ≥ 20 字（空话/空白即红）；
//   ④ 只减不增：frozenCount === entries.length 且 ≤ 下面这条**测试内硬上界**——单改 JSON 数字会红。
// ---------------------------------------------------------------------------

/** 豁免台账路径。 */
const EXEMPT_PATH = fileURLToPath(new URL('./fixtures/layer-boundary-exempt.json', import.meta.url))

/** 硬上界（只减不增）：台账条目数不得超过它；本次需求自身 0 条，故为 0。 */
export const EXEMPT_CEILING = 0

/** 理由与整改计划的最短长度（防空话占位）。 */
const EXEMPT_MIN_REASON_CHARS = 20

/** 一条豁免：`file` 与 `import` 逐字相等才认（不做前缀匹配——前缀会让一条豁免吞掉一片）。 */
export interface LayerExemption {
  file: string
  import: string
  reason: string
  plan: string
}

interface ExemptionLedger {
  frozenCount: number
  entries: LayerExemption[]
}

/** 越界条目与豁免条目的**唯一匹配口径**（三处共用，避免"同一件事两个写法"）。 */
export function violationKeyOf(file: string, spec: string): string {
  return file + ' -> ' + spec
}

/**
 * 判据①的纯函数：台账里**用不上**的条目（其指向的越界已经不存在 ⇒ 过期豁免，必须删）。
 *
 * 导出是为了能用**合成输入**证伪这条判据本身：不必真去改产线文件，就能证明"指向已修好文件的
 * 台账条目会被点名"。返回的是条目原文（`file -> import`），人一眼能定位该删哪条。
 */
export function unusedExemptions(bad: readonly string[], entries: readonly LayerExemption[]): string[] {
  const unused: string[] = []
  for (const e of entries) {
    if (!bad.includes(violationKeyOf(e.file, e.import))) unused.push(violationKeyOf(e.file, e.import))
  }
  return unused
}

/** 台账条目（形状不对/坏 JSON → 空数组：形状问题由「豁免面」用例逐条点名，这里只做消费）。 */
function readExemptionEntries(): LayerExemption[] {
  const { raw } = readExemptionLedger()
  if (raw === null || typeof raw !== 'object') return []
  const entries = (raw as ExemptionLedger).entries
  return Array.isArray(entries) ? entries : []
}

/** 读台账原文（不吞解析错误：坏 JSON 要在用例里响亮点名，而不是当空台账放行）。 */
function readExemptionLedger(): { raw?: unknown; error?: string } {
  try {
    return { raw: JSON.parse(readFileSync(EXEMPT_PATH, 'utf8')) as unknown }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** 台账形状体检（形状问题逐条点名，供判据③④使用；解析失败单独报）。 */
function ledgerShapeProblems(raw: unknown): string[] {
  const out: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return ['台账不是对象：' + JSON.stringify(raw)]
  const obj = raw as Record<string, unknown>
  const entries = obj['entries']
  if (!Array.isArray(entries)) return ['台账缺 entries 数组']
  for (const [i, e] of entries.entries()) {
    if (e === null || typeof e !== 'object') { out.push('第 ' + String(i) + ' 条不是对象'); continue }
    const row = e as Record<string, unknown>
    for (const k of ['file', 'import', 'reason', 'plan']) {
      if (typeof row[k] !== 'string' || (row[k] as string).trim().length === 0) out.push('第 ' + String(i) + ' 条缺 ' + k)
    }
    for (const k of ['reason', 'plan']) {
      const v = row[k]
      if (typeof v === 'string' && v.trim().length > 0 && v.trim().length < EXEMPT_MIN_REASON_CHARS) {
        out.push('第 ' + String(i) + ' 条的 ' + k + ' 太短（< ' + String(EXEMPT_MIN_REASON_CHARS) + ' 字）')
      }
    }
  }
  const frozen = obj['frozenCount']
  if (typeof frozen !== 'number') out.push('台账缺 frozenCount（数字）')
  else if (frozen !== entries.length) out.push('frozenCount(' + String(frozen) + ') !== entries.length(' + String(entries.length) + ')')
  else if (frozen > EXEMPT_CEILING) out.push('frozenCount(' + String(frozen) + ') 超过测试内硬上界 ' + String(EXEMPT_CEILING))
  if (entries.length > EXEMPT_CEILING) out.push('entries 条数(' + String(entries.length) + ') 超过硬上界 ' + String(EXEMPT_CEILING))
  return out
}

/** 某层的越界清单（`file -> spec`）。三条层规则共用同一份扫描。 */
function violationsOf(layer: string): string[] {
  const rule = LAYER_RULES[layer]!
  const out: string[] = []
  for (const f of allTs.filter(p => rel(p).startsWith(layer + '/'))) {
    for (const spec of extractImports(readFileSync(f, 'utf8'))) {
      if (rule.forbidden.some(re => re.test(spec))) out.push(violationKeyOf(rel(f), spec))
    }
  }
  return out
}

describe('层边界：依赖方向（architecture.md §2）', () => {
  it('扫描器自检：至少扫到 20 个 .ts 文件（防目录写错而静默通过）', () => {
    expect(allTs.length).toBeGreaterThanOrEqual(20)
  })

  it('扫描器自检：extractImports 能抽出说明符', () => {
    const sample = "import a from 'pkg-a'\nimport type { B } from '../shared/protocol.js'\nimport('dyn')\nimport './side.js'"
    expect(extractImports(sample)).toEqual(['pkg-a', '../shared/protocol.js', 'dyn', './side.js'])
  })

  for (const layer of Object.keys(LAYER_RULES)) {
    const rule = LAYER_RULES[layer]!
    it(layer + '/ 不得 import 禁止项（' + rule.why + '）', () => {
      const files = allTs.filter(p => rel(p).startsWith(layer + '/'))
      if (layer === 'domain' || layer === 'application') {
        expect(files.length, layer + '/ 下应有文件（骨架已立）').toBeGreaterThanOrEqual(1)
      }
      const bad = violationsOf(layer)
      // 残量归零：未豁免的越界必须为空（"过期豁免"由下面「豁免面」那条用例一次性判——
      // 一条过期条目只该报一次，不该在三个层的用例里各红一遍，那是噪音）
      const exempted = new Set(readExemptionEntries().map(e => violationKeyOf(e.file, e.import)))
      const residual = bad.filter(b => !exempted.has(b))
      expect(residual, layer + '/ 出现未豁免的越界 import：\n' + residual.join('\n')).toEqual([])
    })
  }

  it('domain/ 内不得使用 Date.now() / Math.random()（时间与 ID 一律注入，保证用例可复现）', () => {
    const bad: string[] = []
    for (const f of allTs.filter(p => rel(p).startsWith('domain/'))) {
      const text = readFileSync(f, 'utf8')
      if (/Date\.now\s*\(/.test(text)) bad.push(rel(f) + ' -> Date.now()')
      if (/Math\.random\s*\(/.test(text)) bad.push(rel(f) + ' -> Math.random()')
    }
    expect(bad, 'domain/ 出现非确定性来源：\n' + bad.join('\n')).toEqual([])
  })

  it('tools/ 与 http/ 内不得出现状态字面量（比较式与判定器实参都不行——状态判断只在 domain）', () => {
    // 2026-09-17 修洞：原实现只匹配 `===`，于是 `status !== 'accepting'` / `'pending'` 全部漏过，
    // 而实测 src/http/ 有 8 处这种 `!==` 比较 —— 门禁绿灯只是因为它没看。同一类事故（"门禁失效而假绿"）
    // 本轮已出现多次，故此处同时覆盖：① 任意比较算子 ② 判定器实参里的字面量。
    const NAMES = [
      ...Object.keys(REQ_TRANSITIONS), ...Object.keys(TASK_TRANSITIONS),
      'pending', 'passed', 'failed', // 验收单项状态（VerificationItem.status）
    ].join('|')
    // 三层口径，逐层收紧（每条都是实测踩出来的洞）：
    //  ① 比较式任意算子（原实现只查 ===，漏了 src/http/ 的 8 处 !==）
    //  ② 判定器实参（statusIs(x, 'accepting') 只是把运算符搬进 domain，规则仍在适配层）
    //  ③ **任何独立的状态名字面量**（countStatus(items,'passed') / isEveryStatus(...) 这类也漏）
    const CMP = new RegExp("status\\s*(?:[!=]==|[!=]=)\\s*'(" + NAMES + ")'")
    const ARG = new RegExp("\\bstatus(?:Is|In|NotEquals|Equals)\\s*\\([^)]*'(" + NAMES + ")'")
    const LIT = new RegExp("'(" + NAMES + ")'")
    const bad: string[] = []
    for (const layer of ['tools', 'http']) {
      for (const f of allTs.filter(p => rel(p).startsWith(layer + '/'))) {
        const text = readFileSync(f, 'utf8')
        if (CMP.test(text) || ARG.test(text) || LIT.test(text)) bad.push(rel(f))
      }
    }
    expect(bad, layer0Msg(bad)).toEqual([])
  })
})

function layer0Msg(bad: string[]): string {
  return bad.length === 0 ? '' : '适配层出现状态判断（应改为调用 domain 的判定函数）：\n' + bad.join('\n')
}

describe('t1 骨架产物存在且可用（本测试直接引用，防"文件在但没用上"）', () => {
  it('src/domain/errors.ts：错误码表 + domainError 构造器', () => {
    expect(existsSync(join(SRC, 'domain/errors.ts'))).toBe(true)
    expect(REQBOARD_ERROR_CODES.invalidTransition).toBe('invalid_transition')
    expect(REQBOARD_ERROR_CODES.humanGate).toBe('human_gate')
    expect(REQBOARD_ERROR_CODES.doneEvidenceMissing).toBe('done_evidence_missing')
    const err = domainError(REQBOARD_ERROR_CODES.bulkClose, 'x')
    expect((err as { code?: string }).code).toBe('bulk_close')
  })

  it('src/application/ports.ts：端口接口齐备（B12 阶段⑤：旧单册端口 ReqboardRepository 已删）', () => {
    const p = join(SRC, 'application/ports.ts')
    expect(existsSync(p)).toBe(true)
    const text = readFileSync(p, 'utf8')
    for (const name of ['RequirementStore', 'DocRepository', 'Clock', 'IdFactory', 'SessionProbe', 'UserQuestionPort']) {
      expect(text, '缺少端口 ' + name).toContain('export interface ' + name)
    }
  })
})

describe('层边界豁免面（REQ-261008020617-088f RF-7）', () => {
  it('台账形状与棘轮：reason/plan 非空且够长、frozenCount 与条数一致且不超硬上界', () => {
    const ledger = readExemptionLedger()
    expect(ledger.error, '台账读不出来（坏 JSON）：' + String(ledger.error)).toBeUndefined()
    expect(ledgerShapeProblems(ledger.raw)).toEqual([])
  })

  it('双向相等：每条豁免都必须仍命中一处真实越界（过期豁免即红）', () => {
    const bad = Object.keys(LAYER_RULES).flatMap(layer => violationsOf(layer))
    const unused = unusedExemptions(bad, readExemptionEntries())
    expect(unused, '台账里有指向"已不存在的越界"的条目（实现修好后必须同步删条）：\n' + unused.join('\n')).toEqual([])
  })

  it('可证伪：合成输入下，指向已修好文件的台账条目被点名为过期豁免', () => {
    // 该文件**不在** bad 里 ⇒ 它指向的越界已经不存在 ⇒ 应被点名
    const bad = ['application/still-bad.ts -> node:fs']
    const stale: LayerExemption = {
      file: 'application/already-fixed.ts',
      import: 'node:fs',
      reason: '（合成输入：这条豁免的越界已经修好了，只用来证明判据会响）',
      plan: '（合成输入：无需整改，删除本条即可）',
    }
    const live: LayerExemption = {
      file: 'application/still-bad.ts',
      import: 'node:fs',
      reason: '（合成输入：这条仍然命中，不该被点名）',
      plan: '（合成输入：留待后续需求修）',
    }
    expect(unusedExemptions(bad, [stale, live])).toEqual(['application/already-fixed.ts -> node:fs'])
    // 反向：两条都命中真越界时，一条都不点名（防"永远点名"的假响）
    expect(unusedExemptions(bad, [live])).toEqual([])
  })
})
