/**
 * 错误码口径的**唯一实现**（REQ-261006201814-ac4f FR-1）。
 *
 * ## 为什么要有这个模块
 *
 * 本仓此前「错误码有多少个」是一句临时 grep，不同的人得到不同的数（129 / 128 / 125 都出现过）。
 * 口径不清，任何覆盖率读数都是假的。本模块把口径写成**可执行的代码**，并被清单守卫与矩阵共用——
 * 「同一规则只有一处实现」（INV-2），别处不得再写一份正则。
 *
 * ## 口径（逐字，与 fixtures/error-code-inventory.json 的 `_note` 同源）
 *
 * **码 = 在 `src/**\/*.ts` 中作为「独立字符串字面量」或「对象键」出现的 `REQBOARD_X`**，
 * 且满足：
 *   ① 左边界不是 `[A-Za-z0-9_]`——否则 `DSH_REQBOARD_NO_ITEM_RESULT` 里的片段会被误当成码；
 *   ② 所在行不是注释（`//` / `*` / `/*` 起头）；
 *   ③ 所在文件不是提示词文案（`*prompt*.ts` 与 `domain/prompt/generated/**`）——文案不是产生点；
 *   ④ 不是 {@link NOISE_TOKENS} 里的字样——它们是标识符 / 数值常量 / 目录名 / 环境变量后缀，
 *      **不是错误码**，被排除是事实而非补丁（扫描规则本身就不会命中它们，见 ①③）。
 *
 * **小写码**来自两张已存在的登记表，不靠猜正则：
 *   · `src/domain/errors.ts` 的 `REQBOARD_ERROR_CODES`（领域语义码，值为小写）；
 *   · `src/application/use-cases/MoveRequirement.ts` 的 `TRANSPORT_CODE_BY_INTERNAL`（门禁内部码）。
 * 未登记在表里的小写码**不在口径内**（这是刻意的下界：宁可漏，也不误伤散文）。
 *
 * @module dsh-pmboard/tests/helpers/error-code-scan
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（tests/helpers/ → 上溯两级）。 */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 生产码的字符形态（大写 + 下划线）。 */
const UPPER_CODE_RE = /(?<![A-Za-z0-9_])REQBOARD_[A-Z0-9_]+/g

/** 独立字符串字面量形态：引号紧贴码（含反引号，模板字面量里单独一个码也算）。 */
const QUOTED_RE = /(?<![A-Za-z0-9_])(['"`])(REQBOARD_[A-Z0-9_]+)\1/g

/** 对象键形态：`REQBOARD_X:`（前面不能是 `.`，否则 `foo.REQBOARD_X:` 这种成员访问会被误判）。 */
const OBJECT_KEY_RE = /(?<![A-Za-z0-9_.])(REQBOARD_[A-Z0-9_]+)\s*:/g

/** 产生形态的受控枚举（与 design/data-model.md 的 form 表逐条对应）。 */
export type CodeForm =
  | 'reject-helper'
  | 'throw-assign'
  | 'return-code'
  | 'store-coded'
  | 'tool-receipt'
  | 'refuse-helper'
  | 'http-fail'
  | 'http-status-key'
  | 'config-assembly'
  | 'client-error'
  | 'unclassified-form'

/** 可触发性分级（与 design/data-model.md 的 tier 表逐条对应）。 */
export type Tier = 'unclassified' | 'direct' | 'fixture' | 'fault'

/** 一个产生点的定位（抗行号漂移：匹配键是行原文，不是行号）。 */
export interface CodeSite {
  /** 工作区相对路径，如 `src/application/use-cases/Decompose.ts`。 */
  readonly file: string
  /** 该行去掉首尾空白后的原文。 */
  readonly anchor: string
}

/** 大写传输码的一条命中。 */
export interface UpperHit {
  readonly code: string
  readonly form: CodeForm
  readonly site: CodeSite
}

/** 小写领域码 / 门禁内部码的一条命中。 */
export interface LowerHit {
  readonly code: string
  readonly transport: string | null
  readonly site: CodeSite
}

/** 被显式排除的字样（噪声；不是错误码）。 */
export interface ExcludedToken {
  readonly token: string
  readonly why: string
}

export interface ScanResult {
  readonly uppercase: readonly UpperHit[]
  readonly lowercase: readonly LowerHit[]
  readonly excluded: readonly ExcludedToken[]
}

/**
 * 被排除的字样（事实清单，不是硬编码补丁）。
 *
 * 每一条都写清「它是什么」——扫描规则本来就不会把它们当码（裸标识符 / 注释 / 被左边界挡住），
 * 本清单的作用是**把这件事变成可断言的事实**：有人把它们删掉、或有人把它们误加进口径，都要红。
 */
export const NOISE_TOKENS: readonly ExcludedToken[] = [
  { token: 'REQBOARD_ERROR_CODES', why: '标识符：src/domain/errors.ts 的对象常量名，不是错误码' },
  { token: 'REQBOARD_XXX', why: '文案占位符：只出现在提示词/注释里（如 clause-criteria.ts），不是码' },
  { token: 'REQBOARD_DATA_ROOT', why: '目录名常量：值为字符串 reqboard（src/index.ts），不是错误码' },
  { token: 'REQBOARD_SCHEMA_VERSION', why: '数值常量：台账记录形态版本（= 9），不是错误码' },
  { token: 'REQBOARD_NO_ITEM_RESULT', why: '环境变量后缀：DSH_REQBOARD_NO_ITEM_RESULT，被左边界挡住故非码' },
]

/** 提示词文案文件（口径 ③）：其内容不是产生点。 */
function isPromptFile(rel: string): boolean {
  return /prompt\.ts$/.test(rel) || rel.startsWith('domain/prompt/generated/')
}

/** 注释行判定（口径 ②）。 */
function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

function walk(root: string, filter: (abs: string, rel: string) => boolean): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = []
  const rec = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name)
      if (e.isDirectory()) {
        rec(abs)
        continue
      }
      if (!e.name.endsWith('.ts')) continue
      const rel = relative(root, abs).replace(/\\/g, '/')
      if (filter(abs, rel)) out.push({ abs, rel })
    }
  }
  rec(root)
  return out
}

/** 行内命中的全部码（去重），按「字面量优先于对象键」定形态。 */
function codesOnLine(line: string): { code: string; form: 'quoted' | 'key' }[] {
  const found = new Map<string, 'quoted' | 'key'>()
  for (const m of line.matchAll(QUOTED_RE)) {
    const code = m[2]
    if (code !== undefined) found.set(code, 'quoted')
  }
  for (const m of line.matchAll(OBJECT_KEY_RE)) {
    const code = m[1]
    if (code !== undefined && !found.has(code)) found.set(code, 'key')
  }
  return [...found].map(([code, form]) => ({ code, form }))
}

/** 判定产生形态（保守：拿不准给 unclassified-form，不猜）。 */
function formOf(line: string, how: 'quoted' | 'key', code: string): CodeForm {
  const l = line
  if (how === 'key') return 'http-status-key'
  if (/\brefuse\s*\(/.test(l)) return 'refuse-helper'
  if (/\bfail\s*\(/.test(l)) return 'http-fail'
  if (/\breject\s*\(/.test(l)) return 'reject-helper'
  if (/Object\.assign/.test(l) || /\bthrow\b/.test(l)) return 'throw-assign'
  if (/code\s*[:=]/.test(l) && /\breturn\b|=>/.test(l)) return 'return-code'
  if (/\bcoded\s*\(/.test(l) || /_ERROR\s*[.:]/.test(l)) return 'store-coded'
  if (/success\s*:\s*false/.test(l)) return 'tool-receipt'
  if (/settings?\s*\(|Setting\s*\(/.test(l)) return 'config-assembly'
  if (code && /client\//.test(l)) return 'client-error'
  return 'unclassified-form'
}

/**
 * 扫描 src，抽出大写码 / 小写码 / 排除清单。
 *
 * @param srcRoot 绝对路径（缺省 `<repo>/src`）
 * @throws Error（码 `TEST_SCAN_ROOT_MISSING`）—— 根不存在时**响亮失败**：
 *         绝不把「扫不到」当成「没有码」，那是判据最危险的失效形态。
 */
export function scanErrorCodes(srcRoot?: string): ScanResult {
  const root = srcRoot ?? join(REPO_ROOT, 'src')
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw Object.assign(
      new Error('错误码扫描根不存在：' + root + '（TEST_SCAN_ROOT_MISSING）——拒绝把「扫不到」当成「没有码」'),
      { code: 'TEST_SCAN_ROOT_MISSING' },
    )
  }

  const noise = new Set(NOISE_TOKENS.map(n => n.token))
  const upper = new Map<string, UpperHit>()
  for (const { abs, rel } of walk(root, (_a, r) => !isPromptFile(r))) {
    const lines = readFileSync(abs, 'utf8').split('\n')
    for (const raw of lines) {
      const trimmed = raw.trim()
      if (isCommentLine(trimmed)) continue
      for (const hit of codesOnLine(raw)) {
        if (noise.has(hit.code)) continue
        if (upper.has(hit.code)) continue // 首个产生点即代表点
        upper.set(hit.code, {
          code: hit.code,
          form: formOf(raw, hit.form, hit.code),
          site: { file: 'src/' + rel, anchor: trimmed },
        })
      }
    }
  }

  return {
    uppercase: [...upper.values()].sort((a, b) => a.code.localeCompare(b.code)),
    lowercase: collectLowercaseCodes(root),
    excluded: [...NOISE_TOKENS],
  }
}

/** 正则转义（避免用用户输入构造正则）。 */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 取 `marker` 之后那个**对象字面量的正文**（从它的 `{` 到第一个顶格 `}`）。
 *
 * 为什么必须截断：早先直接 `slice(marker)` 取到文件尾，把文件里**别处**的
 * `{ code: 'REQBOARD_TASK_INCOMPLETE' }`（`MoveRequirement.ts:208`）也吃进了映射表，
 * 于是小写码清单里凭空多出一个 `code`。截断到对象体内才只认登记表本身。
 */
function objectBodyAfter(text: string, marker: string): string {
  const at = text.indexOf(marker)
  if (at < 0) return ''
  const open = text.indexOf('{', at)
  if (open < 0) return ''
  const rest = text.slice(open + 1)
  const end = rest.search(/\n\}/)
  return end < 0 ? rest : rest.slice(0, end)
}

/**
 * 小写码来自两张**已存在的登记表**（不猜正则）：
 *   · `src/domain/errors.ts` → `REQBOARD_ERROR_CODES = { key: 'value' }` 的 value；
 *   · `src/application/use-cases/MoveRequirement.ts` → `TRANSPORT_CODE_BY_INTERNAL` 的 key + value。
 * `transport` = 该小写码对应的大写传输码；无孪生（大写形态不在 src）时为 null。
 */
export function collectLowercaseCodes(srcRoot?: string): LowerHit[] {
  const root = srcRoot ?? join(REPO_ROOT, 'src')
  const out = new Map<string, LowerHit>()

  // ── ① 领域语义码（值为小写） ─────────────────────────────────────────────
  const errorsFile = join(root, 'domain/errors.ts')
  const domainCodes: string[] = []
  if (existsSync(errorsFile)) {
    const body = objectBodyAfter(readFileSync(errorsFile, 'utf8'), 'REQBOARD_ERROR_CODES')
    for (const m of body.matchAll(/:\s*'([a-z][a-z0-9_]*)'/g)) {
      if (m[1] !== undefined) domainCodes.push(m[1])
    }
  }

  // ── ② 门禁内部码 → 传输码（显式映射表） ──────────────────────────────────
  const moveFile = join(root, 'application/use-cases/MoveRequirement.ts')
  const gatePairs: { code: string; transport: string | null }[] = []
  if (existsSync(moveFile)) {
    const body = objectBodyAfter(readFileSync(moveFile, 'utf8'), 'TRANSPORT_CODE_BY_INTERNAL')
    for (const m of body.matchAll(/([a-z][a-z0-9_]*)\s*:\s*'(REQBOARD_[A-Z0-9_]+)'/g)) {
      if (m[1] !== undefined && m[2] !== undefined) gatePairs.push({ code: m[1], transport: m[2] })
    }
  }

  // 大写集合用于判定「有无孪生」
  const upperSet = new Set<string>()
  for (const { abs } of walk(root, (_a, r) => !isPromptFile(r))) {
    const lines = readFileSync(abs, 'utf8').split('\n')
    for (const raw of lines) {
      if (isCommentLine(raw.trim())) continue
      for (const m of raw.matchAll(UPPER_CODE_RE)) {
        if (m[0] !== undefined) upperSet.add(m[0])
      }
    }
  }

  /**
   * 在文件里找该小写码所在的**真实行原文**（anchor 必须取自磁盘，不能拼）。
   *
   * 踩过的坑：早先按 `key: 'value'` 的形态**拼**一个 anchor（`invalid_input: 'invalid_input',`），
   * 而 errors.ts 里真实写法是 `invalidInput: 'invalid_input',`（键是驼峰、值是下划线）——
   * 拼出来的 anchor 在文件里根本不存在，守卫一上线就会把自己判红。
   */
  const siteOf = (abs: string, rel: string, needle: RegExp): CodeSite | undefined => {
    const lines = readFileSync(abs, 'utf8').split('\n')
    for (const raw of lines) {
      if (needle.test(raw)) return { file: 'src/' + rel, anchor: raw.trim() }
    }
    return undefined
  }

  for (const code of domainCodes) {
    const guess = 'REQBOARD_' + code.toUpperCase()
    const site = siteOf(errorsFile, 'domain/errors.ts', new RegExp(":\\s*'" + esc(code) + "'"))
    if (site !== undefined) {
      out.set(code, { code, transport: upperSet.has(guess) ? guess : null, site })
    }
  }
  for (const p of gatePairs) {
    if (out.has(p.code)) continue
    const site = siteOf(
      moveFile,
      'application/use-cases/MoveRequirement.ts',
      new RegExp(esc(p.code) + "\\s*:\\s*'" + esc(String(p.transport)) + "'"),
    )
    if (site !== undefined) out.set(p.code, { code: p.code, transport: p.transport, site })
  }

  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * 常量别名表：`JOURNAL_ERROR.COUNT_EXCEEDS_LINES` → `REQBOARD_JOURNAL_COUNT_EXCEEDS_LINES`。
 *
 * 为什么必须采（FR-1④ 的假阴性自检）：改前实测有 **7 个码**测试其实**已经断言了**，
 * 只是引用定义处常量而不是字面量——只按字面量统计会把它们记成「零覆盖」，
 * 于是拿 7 条并不存在的工作量去凑数，而凑数正是本需求要治的病。
 */
export function collectConstAliases(srcRoot?: string): ReadonlyMap<string, string> {
  const root = srcRoot ?? join(REPO_ROOT, 'src')
  const out = new Map<string, string>()
  for (const { abs } of walk(root, (_a, r) => !isPromptFile(r))) {
    const text = readFileSync(abs, 'utf8')
    for (const m of text.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([\s\S]*?)\n\}/g)) {
      const symbol = m[1]
      const body = m[2]
      if (symbol === undefined || body === undefined) continue
      for (const kv of body.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'(REQBOARD_[A-Z0-9_]+)'/g)) {
        const key = kv[1]
        const code = kv[2]
        if (key !== undefined && code !== undefined) out.set(symbol + '.' + key, code)
      }
    }
  }
  return out
}

/**
 * 测试侧的覆盖实况（**双形态**）。
 *
 * @returns Map<码, 'literal' | 'const'>；同码既有字面量又有常量时取 `literal`
 */
export function collectTestCoverage(testsRoot?: string): ReadonlyMap<string, 'literal' | 'const'> {
  const root = testsRoot ?? join(REPO_ROOT, 'tests')
  const aliases = collectConstAliases()
  const byCode = new Map<string, 'literal' | 'const'>()
  if (!existsSync(root)) return byCode

  for (const { abs } of walk(root, (_a, r) => r.endsWith('.test.ts'))) {
    const text = readFileSync(abs, 'utf8')
    // ① 字面量形态
    for (const m of text.matchAll(/(?<![A-Za-z0-9_])REQBOARD_[A-Z0-9_]+/g)) {
      const code = m[0]
      if (code !== undefined && byCode.get(code) !== 'literal') byCode.set(code, 'literal')
    }
    // ② 常量形态（引定义处常量）
    for (const [alias, code] of aliases) {
      if (new RegExp('(?<![A-Za-z0-9_.])' + esc(alias) + '(?![A-Za-z0-9_])').test(text)) {
        if (!byCode.has(code)) byCode.set(code, 'const')
      }
    }
  }
  return byCode
}
