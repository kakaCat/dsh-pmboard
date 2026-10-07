#!/usr/bin/env npx tsx
/**
 * 错误码清单的**自助修复入口**（REQ-261006201814-ac4f FR-1 / FR-9③）。
 *
 * ## 它解决什么
 *
 * 本仓是多窗口并发开发：别人加一个错误码是常态。若无自助路径，清单守卫就会变成
 * 「喊狼来了」——报红但没人知道怎么办，最后被无视（而喊狼来了的判据正是本需求要治的病）。
 * 故守卫报红时必须给一条可跑的命令，这就是那条命令。
 *
 * ## 两种模式
 *
 *   npx tsx tests/drill/refresh-error-code-inventory.mts              # 增量：重扫并合并
 *   npx tsx tests/drill/refresh-error-code-inventory.mts --bootstrap  # 首次建立清单（含分级首过）
 *
 * ## 不变量（防「刷新即洗绿」）
 *
 *   ① 已存在的 `code` 条目**不得被删除**——src 里消失的码不静默丢，而是**响亮报出**并保留条目，
 *      由人决定是「码被删了」还是「扫描口径坏了」；
 *   ② 新码一律以 `tier: "unclassified"` 追加——刷新**不代劳分级**，分级义务留在清单里（守卫要求
 *      `unclassified` 归零），于是刷新把红变「可解」，但不把红变「绿」；
 *   ③ **幂等**：内容无变化时不写盘（连跑两次第二次零写入）。
 *
 * @module dsh-pmboard/tests/drill/refresh-error-code-inventory
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REPO_ROOT, collectTestCoverage, scanErrorCodes, type CodeForm, type Tier,
} from '../helpers/error-code-scan.js'

const OUT = join(REPO_ROOT, 'tests/fixtures/error-code-inventory.json')

interface InventoryUpper {
  code: string
  form: CodeForm
  site: { file: string; anchor: string }
  tier: Tier
  covered: boolean
  coveredHow: 'literal' | 'const' | null
}
interface InventoryLower {
  code: string
  transport: string | null
  site: { file: string; anchor: string }
}
interface Inventory {
  _note: string
  generatedAt: string
  scanRule: string
  tierRule: string
  uppercase: InventoryUpper[]
  lowercase: InventoryLower[]
  excluded: { token: string; why: string }[]
}

/**
 * 零覆盖码的**分级首过表**（人工勘定，仅用于 `--bootstrap`）。
 *
 * 只覆盖「清单建立时实测零覆盖」的那一批——它们的分级是 t4/t5 的直接输入，必须准。
 * 已覆盖的码由下面的启发式兜底（它们的 tier 只作参考：已有测试即证明可触发）。
 */
const BOOTSTRAP_TIERS: Readonly<Record<string, Tier>> = {
  // 直调公开入口传非法入参即可触发
  REQBOARD_REQUIREMENT_NOT_FOUND: 'direct',
  REQBOARD_SEATS_MAX_INVALID: 'direct',
  REQBOARD_DOCS_ROOT_SOURCE_INVALID: 'direct',
  REQBOARD_STORE_INCONSISTENT: 'direct',
  // 需构造特定台账/文档状态
  REQBOARD_VERSION_MISMATCH: 'fixture',
  REQBOARD_NOT_SUBTASK: 'fixture',
  REQBOARD_DEPENDENCY_GATE: 'fixture',
  REQBOARD_FILE_CONFLICT: 'fixture',
  REQBOARD_DESIGN_COVERAGE_GATE: 'fixture',
  REQBOARD_IMPLEMENTATION_COVERAGE_GATE: 'fixture',
  REQBOARD_DESIGN_CONTENT_GATE: 'fixture',
  REQBOARD_DOC_INCOMPLETE: 'fixture',
  REQBOARD_ACCEPTANCE_NOT_EXECUTABLE: 'fixture',
  REQBOARD_AWAITING_MANUAL: 'fixture',
  REQBOARD_REQ_TERMINAL: 'fixture',
  REQBOARD_STAGES_INVALID: 'fixture',
  REQBOARD_SYSTEM_RECORD_INVALID: 'fixture',
  // 需故障注入（假端口 / 打桩让 I/O 失败）
  REQBOARD_DISPATCH_FAILED: 'fault',
  REQBOARD_HANDOFF_WRITE_FAILED: 'fault',
  REQBOARD_DRIVER_REQUIRED: 'fault',
  REQBOARD_NO_UI: 'fault',
  REQBOARD_SKILLS_INSTALL_FAILED: 'fault',
  REQBOARD_DETAIL_SETTLE_FAILED: 'fault',
  REQBOARD_NOT_AUTORUN: 'fault',
  REQBOARD_REQ_NOT_FOUND: 'fault',
}

/**
 * 分级启发式（仅用于 `--bootstrap`，且只覆盖「已覆盖的码」）。
 *
 * 口径写进 `tierRule` 字段，随清单一同冻结——避免「分级从哪来的」变成口口相传。
 * 判错也无害：这些码**已有测试**，可触发性已被事实证明；tier 对它们只作参考。
 */
function heuristicTier(form: CodeForm, file: string): Tier {
  if (form === 'config-assembly') return 'direct'
  if (file.startsWith('src/adapters/') || file.startsWith('src/repositories/')) return 'fault'
  if (form === 'store-coded' || form === 'client-error') return 'fault'
  return 'fixture'
}

const SCAN_RULE =
  '码 = src/**/*.ts 中作为「独立字符串字面量」（引号紧贴）或「对象键」（REQBOARD_X:）出现的 '
  + 'REQBOARD_X，且：① 左边界不是 [A-Za-z0-9_]（否则 DSH_REQBOARD_NO_ITEM_RESULT 的片段会被误当码）；'
  + '② 所在行不是注释；③ 所在文件不是 *prompt*.ts 或 domain/prompt/generated/**（文案不是产生点）；'
  + '④ 不是 excluded 里的字样。小写码只认两张已存在的登记表：domain/errors.ts 的 REQBOARD_ERROR_CODES '
  + '与 use-cases/MoveRequirement.ts 的 TRANSPORT_CODE_BY_INTERNAL。'

const TIER_RULE =
  'tier：unclassified = 刷新写入的临时态（守卫要求归零）；direct = 传非法入参或走到已存在的公开入口即可触发；'
  + 'fixture = 需构造特定台账/文档状态；fault = 需故障注入（假 store / 假适配器 / 打桩让 I/O 失败）。'
  + '--bootstrap 的首过：零覆盖码走人工勘定表，已覆盖码走启发式（config-assembly→direct，'
  + 'adapters/repositories 或 store-coded/client-error→fault，其余→fixture）。tier 对已覆盖码只作参考。'

function loadExisting(): Inventory | undefined {
  if (!existsSync(OUT)) return undefined
  try {
    return JSON.parse(readFileSync(OUT, 'utf8')) as Inventory
  } catch {
    // 清单坏了要响亮：静默当成「没有清单」会把损坏洗成「首次建立」
    console.error('[refresh] 现有清单无法解析：' + OUT + ' —— 拒绝在损坏件上增量合并')
    process.exit(2)
  }
}

function main(): void {
  const bootstrap = process.argv.includes('--bootstrap')
  const scan = scanErrorCodes()
  const coverage = collectTestCoverage()
  const prev = loadExisting()
  const prevUpper = new Map((prev?.uppercase ?? []).map(u => [u.code, u]))
  const prevLower = new Map((prev?.lowercase ?? []).map(l => [l.code, l]))

  const disappeared: string[] = []
  const newlyAdded: string[] = []

  const uppercase: InventoryUpper[] = scan.uppercase.map(u => {
    const old = prevUpper.get(u.code)
    if (old === undefined && prev !== undefined) newlyAdded.push(u.code)
    const coveredHow = coverage.get(u.code) ?? null
    const tier: Tier = old?.tier
      ?? (bootstrap ? (BOOTSTRAP_TIERS[u.code] ?? heuristicTier(u.form, u.site.file)) : 'unclassified')
    return {
      code: u.code,
      form: u.form,
      site: u.site,
      tier,
      covered: coveredHow !== null,
      coveredHow,
    }
  })

  // ① 已存在但 src 里扫不到的码：**保留条目 + 响亮报出**（不静默丢）
  const nowCodes = new Set(scan.uppercase.map(u => u.code))
  for (const code of prevUpper.keys()) {
    if (!nowCodes.has(code)) disappeared.push(code)
  }

  const lowercase: InventoryLower[] = scan.lowercase.map(l => ({
    code: l.code,
    transport: l.transport,
    // 一律取本次扫描的真实行原文：早先保留旧值会把拼错的 anchor 一起留住（见 error-code-scan 的 siteOf 注释）
    site: l.site,
  }))

  const next: Inventory = {
    _note: 'REQ-261006201814-ac4f FR-1 的口径产物：本清单是「什么是错误码」的冻结事实。'
      + '由 tests/drill/refresh-error-code-inventory.mts 生成（--bootstrap 首次建立）。'
      + '守卫见 tests/error-code-inventory.test.ts。缺失的码由保守下界给出，宁可漏也不误伤散文。',
    // 已有清单时**保留原时间戳**：否则 --bootstrap 每次重跑都会因时间戳变化而写盘，
    // 幂等检查（连跑两次第二次零写入）就永远过不了——而幂等是本卡验收的一部分。
    generatedAt: prev?.generatedAt ?? new Date().toISOString(),
    scanRule: SCAN_RULE,
    tierRule: TIER_RULE,
    uppercase,
    lowercase,
    excluded: [...scan.excluded],
  }

  const text = JSON.stringify(next, null, 2) + '\n'
  const unchanged = prev !== undefined && readFileSync(OUT, 'utf8') === text
  if (unchanged) {
    console.log('[refresh] 清单无变化（幂等：未写盘）')
  } else {
    writeFileSync(OUT, text, 'utf8')
    console.log('[refresh] 已写入 ' + OUT.replace(REPO_ROOT + '/', ''))
  }

  const unclassified = uppercase.filter(u => u.tier === 'unclassified')
  const zero = uppercase.filter(u => !u.covered)
  console.log('[refresh] 大写码 ' + uppercase.length
    + '（零覆盖 ' + zero.length + '）· 小写码 ' + lowercase.length
    + ' · 排除 ' + next.excluded.length)
  if (newlyAdded.length > 0) console.log('[refresh] 新增码 ' + newlyAdded.length + '：' + newlyAdded.join('、'))
  if (unclassified.length > 0) {
    console.log('[refresh] ⚠️ 待分级（unclassified）' + unclassified.length + ' 个：' + unclassified.map(u => u.code).join('、'))
    console.log('[refresh] 分级后守卫才会转绿——刷新把红变「可解」，但不把红变「绿」')
  }
  if (disappeared.length > 0) {
    console.error('[refresh] ❗ src 里已扫不到但清单仍保留的码 ' + disappeared.length + ' 个：' + disappeared.join('、'))
    console.error('[refresh] 它们**未被删除**：请人判断是「码真的被删了」还是「扫描口径坏了」，不要静默丢')
  }
}

main()
