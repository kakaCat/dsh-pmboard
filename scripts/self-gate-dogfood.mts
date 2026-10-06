/**
 * Dogfood 复跑：拿**本需求自己的**文档与产物簿，喂本需求自己新增的三道门（REQ-261005105032-3b02 · t-ed8a64）。
 *
 * ## 为什么要有这个脚本
 *
 * 「门在夹具上绿」证明不了门在**真实输入**上会拦人。本需求的三道新门都拿自己做过 dogfood，
 * 但那三次是一次性探针（`.tmp-probe/*.mts`，跑完即弃），**没有可复跑的命令**，验收复核只能读转述。
 * 本脚本把它们固化成一条命令：同一份真文档、同一份真产物簿、同一批门函数，逐条打印判定。
 *
 * ## 三条 dogfood（与 `notes/execution-decisions.md` 的编号对齐）
 *
 * | # | 出处 | 事实 | 本脚本怎么复现 |
 * |---|---|---|---|
 * | A | §5 | 裁定门把本需求文档拒了（`decision_entry_invalid`，点名 D-14/D-15 的「影响 FR」写成「全 FR」）→ **改文档、不放宽门** → 放行 | 真文档跑门（应放行）→ 把 D-14 那格改回「全 FR」（真改盘）→ 门必红并点名 D-14 → 逐字节还原 → 再跑必放行 |
 * | B | §5c | 本需求声明 frontend 却没交原型 → 被自己的原型存在门判 `prototype_missing`（门真的在工作） | `contentGatesForMove(…, brainstorming → design)` 拿真需求跑，打印码与首条 gap；再打印 t9 适用性判据（`prototypeSectionVerdict`）的 `exempted: legacy` |
 * | C | §4e | 本需求曾被自己的**时序门**拦住（E2E 覆盖读数把「没有测试策略表」压成 `false` → 实施收尾判逾期）→ 读数口径修正为「没有表 = 未知不判」后放行 | 真需求跑 `implementing → accepting`（应放行）+ 打印 `e2eCoverageOf` 原始读数（应 `undefined`）→ 把 `e2eCoverageOf` 改回恒 `false`（真改盘）→ 门必判 `stage_gate_overdue` → 逐字节还原 |
 *
 * ## 纪律
 *   · 改盘一律**文件级备份 + sha256 复核**还原，并检测并发写入（他人改过就不回写，见 `reverse-drill-matrix.mts` 同款闸）；
 *   · 需求 id / 台账位置可换（`--req` / `DSH_HOME`），故本脚本不是"为这一条需求写死"的假证据；
 *   · 判定一律调**门本体**（`contentGatesForMove` 是唯一分派入口），本脚本只做取数 + 组装 + 呈现。
 *
 * 用法：
 *   npx tsx scripts/self-gate-dogfood.mts                 # 默认本需求（REQ-261005105032-3b02）
 *   npx tsx scripts/self-gate-dogfood.mts --req REQ-xxxxxx
 *   npx tsx scripts/self-gate-dogfood.mts --json
 *
 * 退出码：0 = 三条 dogfood 全部如预期；1 = 有判定不符（含"该红的没红"/"该放的没放"）；2 = 环境不可用
 * （台账记录 / 产物簿 / 需求文档缺，连"能不能判"都不成立）。
 *
 * @module dsh-pmboard/scripts/self-gate-dogfood
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { designDocPolicyFrom } from '../src/application/internal/category-doc-sets.js'
import { parseDocument } from '../src/application/internal/content-gates.js'
import { contentGatesForMove, e2eCoverageOf } from '../src/application/internal/content-gate-wiring.js'
import { checkDecisionLogGate } from '../src/application/internal/decision-gates.js'
import { PROTOTYPE_RULES_SINCE, prototypeSectionVerdict } from '../src/application/internal/rtm-health.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const DEFAULT_REQ = 'REQ-261005105032-3b02'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

interface Check {
  id: string
  what: string
  expected: string
  actual: string
  pass: boolean
}

const checks: Check[] = []
function record(id: string, what: string, expected: string, actual: string, pass: boolean): void {
  checks.push({ id, what, expected, actual, pass })
}

/* ── 台账取数（真记录，不是构造的替身） ─────────────────────────────────────── */

interface Loaded {
  req: RequirementRecord
  artifacts: StageArtifact[]
  recordPath: string
  artifactsPath: string
}

function loadRequirement(reqId: string): Loaded | string {
  const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  const dir = join(home, 'reqboard', 'requirements', reqId)
  const recordPath = join(dir, 'record.json')
  const artifactsPath = join(dir, 'artifacts.json')
  if (!existsSync(recordPath)) return `台账里没有 ${reqId} 的记录：${recordPath}`
  if (!existsSync(artifactsPath)) return `台账里没有 ${reqId} 的产物簿：${artifactsPath}`
  const raw = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>
  const artifacts = JSON.parse(readFileSync(artifactsPath, 'utf8')) as StageArtifact[]
  return {
    req: { ...raw, artifacts } as unknown as RequirementRecord,
    artifacts,
    recordPath,
    artifactsPath,
  }
}

/* ── 改盘实验的安全外壳（备份 + 还原 + sha256 + 并发写入检测） ─────────────── */

interface MutationResult { ok: boolean; note: string; actual: string }

/* ── 子进程取一次门判定（**源码级**改坏必须在全新进程里跑） ──────────────────
   为什么不能在本进程里跑：ESM 模块在进程启动时就已求值，改盘上的 `.ts` 源码对**已经加载**的模块
   毫无影响——本进程内改 `content-gate-wiring.ts` 再调门，跑的仍是旧代码（会得到"没红"的假结论）。
   故"改源码 → 判据必红"这一类实验一律 spawn 一个 `npx tsx` 子进程重跑，由它重新 import。 */
function runChildGate(from: string, to: string, reqId: string): { code: string; gaps: string[] } | string {
  const r = spawnSync('npx', ['tsx', 'scripts/self-gate-dogfood.mts', '--child-gate', from, to, '--req', reqId], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  })
  const out = String(r.stdout ?? '') + String(r.stderr ?? '')
  const m = /CHILD_GATE (\{.*\})/.exec(out)
  if (m === null) return `子进程没给出判定（exit ${String(r.status ?? -1)}）：${out.split('\n').join(' ').slice(0, 200)}`
  try {
    return JSON.parse(m[1]!) as { code: string; gaps: string[] }
  } catch {
    return '子进程判定不是合法 JSON：' + m[1]!
  }
}

/** 真改盘 → 跑 `probe()` → 逐字节还原；跑判据期间若被他人改写则放弃回写。 */
async function withBrokenFile<T>(
  file: string,
  from: string,
  to: string,
  probe: () => Promise<T>,
  describe: (r: T) => string,
): Promise<MutationResult> {
  const before = readFileSync(file)
  const beforeHash = sha(file)
  const text = before.toString('utf8')
  if (!text.includes(from)) {
    return { ok: false, note: `改坏点未命中（源码已漂移）：${file}`, actual: '（未跑）' }
  }
  writeFileSync(file, text.replace(from, to))
  const brokenHash = sha(file)
  let actual = '（未跑）'
  let concurrent = false
  try {
    actual = describe(await probe())
  } finally {
    if (sha(file) !== brokenHash) concurrent = true
    else writeFileSync(file, before)
  }
  if (concurrent) return { ok: false, note: `检测到并发写入：${file} 已被他人改写，放弃还原（不覆盖他人改动）`, actual }
  const restored = sha(file) === beforeHash
  return { ok: restored, note: restored ? `已逐字节还原，sha256 复核一致（${beforeHash.slice(0, 12)}…）` : `**还原失败**：${file}`, actual }
}

/* ── 主流程 ────────────────────────────────────────────────────────────────── */

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const ri = argv.indexOf('--req')
  const reqId = ri >= 0 ? (argv[ri + 1] ?? DEFAULT_REQ) : DEFAULT_REQ
  const workspace = process.cwd()
  const docs = new FileDocRepository({ workspaceRoot: workspace })

  // 子进程模式：只跑一次转移门并把判定打成一行机器可读输出（父进程在"源码被改坏"期间调它）。
  const ci = argv.indexOf('--child-gate')
  if (ci >= 0) {
    const from = argv[ci + 1] ?? ''
    const to = argv[ci + 2] ?? ''
    const childLoaded = loadRequirement(reqId)
    if (typeof childLoaded === 'string') {
      console.error(childLoaded)
      return 2
    }
    const gate = await contentGatesForMove(
      docs, childLoaded.req,
      from as Parameters<typeof contentGatesForMove>[2],
      to as Parameters<typeof contentGatesForMove>[3],
    )
    console.log('CHILD_GATE ' + JSON.stringify(gate === undefined ? { code: '', gaps: [] } : { code: gate.code, gaps: gate.gaps ?? [] }))
    return 0
  }

  const loaded = loadRequirement(reqId)
  if (typeof loaded === 'string') {
    console.error(`环境不可用（exit 2）：${loaded}`)
    return 2
  }
  const { req, recordPath, artifactsPath } = loaded
  const reqDocRel = 'docs/requirements/' + reqId + '/requirement.md'
  const reqDocAbs = resolve(workspace, reqDocRel)
  if (!existsSync(reqDocAbs)) {
    console.error(`环境不可用（exit 2）：需求文档不在盘上：${reqDocRel}`)
    return 2
  }
  const reqText = readFileSync(reqDocAbs, 'utf8')
  const frontmatter = parseDocument(reqText).frontmatter
  const sides = designDocPolicyFrom(frontmatter).sides
  const prototypeArtifacts = loaded.artifacts.filter(a => a.kind === 'prototype')

  if (!asJson) {
    console.log('== Dogfood 复跑：本需求自己的文档 × 本需求自己新增的门 ==')
    console.log(`需求：${req.id}（category=${String(req.category)}，sides=[${sides.join(', ')}]，createdAt=${String(req.createdAt)}）`)
    console.log(`台账：${recordPath}`)
    console.log(`产物簿：${artifactsPath}（${String(loaded.artifacts.length)} 条，其中 kind=prototype ${String(prototypeArtifacts.length)} 条）`)
    console.log(`需求文档：${reqDocRel}`)
  }

  /* ── A 裁定门：改文档、不放宽门（§5） ───────────────────────────────────── */
  const gateA0 = await checkDecisionLogGate(docs, req, { trace: false })
  record('A-1', '本需求文档过裁定门（改文档后的现状）', '放行（undefined）',
    gateA0 === undefined ? '放行（undefined）' : `拒：${String(gateA0.code)} ${gateA0.gaps[0] ?? ''}`,
    gateA0 === undefined)

  // 把 D-14 的「影响 FR」改回历史缺陷形态（写「全 FR」而不是编号）→ 门必须点名 D-14。
  const d14From = '| D-14 | 用户：「都按你建议改」（针对自评 #6） | 验收标准按三组重排（原型门禁 / 裁定保真 / 同源与校验），保留可跑命令 | FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7、FR-8、FR-9、FR-10、FR-11 |'
  const d14To = '| D-14 | 用户：「都按你建议改」（针对自评 #6） | 验收标准按三组重排（原型门禁 / 裁定保真 / 同源与校验），保留可跑命令 | 全 FR |'
  const mutA = await withBrokenFile(reqDocAbs, d14From, d14To,
    () => checkDecisionLogGate(docs, req, { trace: false }),
    r => r === undefined ? '放行（undefined）——**没红**' : `${String(r.code)}；gaps=[${r.gaps.join(' ｜ ')}]`)
  record('A-2', '把 D-14 的「影响 FR」改回「全 FR」（历史缺陷形态）', 'decision_entry_invalid 且点名 D-14',
    mutA.actual, mutA.ok && mutA.actual.includes('decision_entry_invalid') && mutA.actual.includes('D-14'))
  if (!asJson) console.log(`  A-2 还原：${mutA.note}`)

  const gateA2 = await checkDecisionLogGate(docs, req, { trace: false })
  record('A-3', '还原后再跑裁定门（证明"改文档"而非"放宽门"）', '放行（undefined）',
    gateA2 === undefined ? '放行（undefined）' : `拒：${String(gateA2.code)}`, gateA2 === undefined)

  /* ── B 原型门：门真的在工作 + 存量豁免（§5c） ───────────────────────────── */
  const gateB = await contentGatesForMove(docs, req, 'brainstorming', 'design')
  record('B-1', '本需求（声明 frontend、0 条 prototype 产物）过 brainstorming → design', 'prototype_missing',
    gateB === undefined ? '放行（undefined）——**没红**' : `${String(gateB.code)}；首条 gap：${gateB.gaps[0] ?? ''}`,
    gateB !== undefined && gateB.code === 'prototype_missing')

  const rtmPath = join(workspace, 'docs/requirements', reqId, 'rtm-brainstorming.yml')
  const verdict = prototypeSectionVerdict({
    reqId,
    createdAt: req.createdAt,
    sides,
    brainstormingText: existsSync(rtmPath) ? readFileSync(rtmPath, 'utf8') : undefined,
  })
  record('B-2', 't9 适用性判据（存量豁免）：createdAt < 规则生效日', "exempted: 'legacy' 且 required=false",
    `exempted=${String(verdict.exempted)} required=${String(verdict.required)} gaps=${String(verdict.gaps.length)}`,
    verdict.exempted === 'legacy' && !verdict.required)

  /* ── C 时序门：读数口径修正（§4e） ──────────────────────────────────────── */
  const e2e = await e2eCoverageOf(docs, req)
  record('C-1', 'E2E 覆盖原始读数（本需求没有「测试策略（层级…）」表）', 'undefined（读数未知，不判）',
    String(e2e), e2e === undefined)

  const gateC0 = await contentGatesForMove(docs, req, 'implementing', 'accepting')
  record('C-2', '本需求过 implementing → accepting（口径修正后）', '放行（undefined）',
    gateC0 === undefined ? '放行（undefined）' : `拒：${String(gateC0.code)} ${gateC0.gaps[0] ?? ''}`,
    gateC0 === undefined)

  const wiringAbs = resolve(workspace, 'src/application/internal/content-gate-wiring.ts')
  const mutC = await withBrokenFile(wiringAbs,
    '  if (!hasLevelTable) return undefined',
    '  if (!hasLevelTable) return false // 逆验证：读数口径改回"压成布尔"',
    async () => runChildGate('implementing', 'accepting', reqId),
    r => typeof r === 'string' ? r : r.code === '' ? '放行（undefined）——**没红**' : `${r.code}；gaps=[${r.gaps.join(' ｜ ')}]`)
  record('C-3', '把 e2eCoverageOf 改回「没有表也压成 false」', 'stage_gate_overdue（本需求被自己的时序门拦住）',
    mutC.actual, mutC.ok && mutC.actual.includes('stage_gate_overdue'))
  if (!asJson) console.log(`  C-3 还原：${mutC.note}`)

  const gateC3 = await contentGatesForMove(docs, req, 'implementing', 'accepting')
  record('C-4', '还原后再跑 implementing → accepting', '放行（undefined）',
    gateC3 === undefined ? '放行（undefined）' : `拒：${String(gateC3.code)}`, gateC3 === undefined)

  /* ── 呈现 ───────────────────────────────────────────────────────────────── */
  const failed = checks.filter(c => !c.pass)
  if (asJson) {
    console.log(JSON.stringify({ reqId, prototypeRulesSince: PROTOTYPE_RULES_SINCE, checks, allOk: failed.length === 0 }, null, 2))
  } else {
    for (const c of checks) {
      console.log((c.pass ? '✅' : '❌') + ' [' + c.id + '] ' + c.what)
      console.log('     期望：' + c.expected)
      console.log('     实得：' + c.actual)
    }
    console.log(failed.length === 0
      ? `\n[通过] ${String(checks.length)}/${String(checks.length)} 条 dogfood 判定如预期`
        + '（A 裁定门：改文档放行、改回缺陷形态必红；B 原型门：真拦 + 存量豁免；C 时序门：口径修正后放行、改回必红）'
      : `\n[失败] ${String(failed.length)}/${String(checks.length)} 条判定不符：${failed.map(c => c.id).join('、')}`)
  }
  return failed.length === 0 ? 0 : 1
}

main().then(code => { process.exitCode = code }, err => {
  console.error('脚本异常（exit 2）：' + (err instanceof Error ? err.message : String(err)))
  process.exitCode = 2
})
