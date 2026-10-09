/**
 * prompt 文案里出现的错误码 ⊆ 注册表（REQ-261007230908-5ccb FR-3 · IF-3）。
 *
 * ## 这个用例在防什么
 *
 * 体检报告 §3.2：prompt 里列的码与实现所抛的码常年对不上——漏码（有人照 prompt 排障，
 * 拿到一个 prompt 里根本没提的码）与幽灵码（prompt 列了实现不会抛的码）都只能靠人眼抽查。
 * 有了注册表（FR-1）之后，这条检查变成机械的：**文案面出现的码必须在注册表里**。
 *
 * ## 口径（与 error-code-scan 同源，D-2）
 *
 * - **收集面**：`isPromptFile` 判定的文案文件（`*prompt*.ts` + `domain/prompt/generated/**`）
 *   —— 该函数从 helpers 导出复用，不在本用例另写一份正则（两份真相 = 改一处漏一处）；
 * - **形态**：只认字符串字面量里的 `REQBOARD_[A-Z0-9_]+`（散文里的 `REQBOARD_*` 通配写法
 *   不匹配字面量形态，天然豁免）；NOISE_TOKENS（占位 REQBOARD_XXX 等）不计（D-1）。
 *
 * ## 定位（D-3）
 *
 * 这是**子集断言**：不预设 prompt 里必须列码。G5 走「补全清单」时它守住补全的正确性；
 * 若改走「不列码、只列场景」，本用例自然空集通过——两种走向下语义都成立。
 *
 * @module dsh-pmboard/tests/prompt-error-codes
 *
 * serves: FR-3（prompt 文案面出现的码 ⊆ 注册表）
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NOISE_TOKENS, REPO_ROOT, isPromptFile } from './helpers/error-code-scan.js'
import { REQBOARD_CODE_SET } from '../src/shared/error-code-registry.js'

/**
 * 文案面出现的码 token。
 *
 * 为什么用 token 级而不是「引号紧贴字面量」：实测 prompt 里的码**嵌在中文句子里**
 * （`'错误码：REQBOARD_SKILLS_DISABLED（开关关了）/ …'`），紧贴引号的写法一个都扫不到——
 * 那会让本用例形同虚设（首版实测只命中 1 个码）。故按 token 收集，只剔除两类非码：
 *   · NOISE_TOKENS（占位 REQBOARD_XXX、标识符、目录名等，D-1）；
 *   · 模板拼码 `REQBOARD_${…}`（运行时拼接的裸前缀，非字面量码）。
 */
const CODE_TOKEN_RE = /REQBOARD_[A-Z0-9_]*/g

/** 取一行里的码 token（剔模板拼码与噪声字样）。 */
function codesOnLine(line: string, noise: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const m of line.matchAll(CODE_TOKEN_RE)) {
    const token = m[0]
    // 模板拼码：`REQBOARD_${…}` —— 码尾紧跟 `${`（token 本身以 _ 结尾且后随 $）
    const after = line.slice((m.index ?? 0) + token.length, (m.index ?? 0) + token.length + 2)
    if (after.startsWith('${')) continue
    if (token === 'REQBOARD_' || noise.has(token)) continue
    out.push(token)
  }
  return out
}

/** 递归收集 src 下的文案文件行（rel 与 isPromptFile 口径一致）。 */
function promptFiles(root: string): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = []
  const rec = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const abs = join(dir, e)
      if (statSync(abs).isDirectory()) {
        rec(abs)
        continue
      }
      if (!e.endsWith('.ts')) continue
      const rel = relative(root, abs).replace(/\\/g, '/')
      if (isPromptFile(rel)) out.push({ abs, rel })
    }
  }
  rec(root)
  return out
}

describe('① prompt 文案里的码必须已在注册表登记', () => {
  it('收集面非空（口径没坏：扫到 0 个文案文件时不得静默通过）', () => {
    const files = promptFiles(join(REPO_ROOT, 'src'))
    expect(files.length, '文案面扫到 0 个文件 ⇒ 口径或目录结构坏了，不是「没有码」').toBeGreaterThan(0)
  })

  it('每个 prompt 文件里出现的码都在注册表内；违规逐条点名文件与码', () => {
    const noise = new Set(NOISE_TOKENS.map(n => n.token))
    const violations: string[] = []
    for (const { abs, rel } of promptFiles(join(REPO_ROOT, 'src'))) {
      const lines = readFileSync(abs, 'utf8').split('\n')
      for (const line of lines) {
        for (const code of codesOnLine(line, noise)) {
          if (!REQBOARD_CODE_SET.has(code)) violations.push('src/' + rel + ' → ' + code)
        }
      }
    }
    const unique = [...new Set(violations)].sort()
    expect(
      unique,
      'prompt 文案里出现了未注册的码（幽灵码——照它排障会扑空）：\n  ' + unique.join('\n  ')
      + '\n补齐：要么在 src/shared/error-code-registry.ts 注册（确认实现确实会抛），要么删掉该文案',
    ).toEqual([])
  })

  it('读数打印：文案面出现的码数与去重数（供 G5 核对，非门禁）', () => {
    const noise = new Set(NOISE_TOKENS.map(n => n.token))
    const seen = new Set<string>()
    for (const { abs } of promptFiles(join(REPO_ROOT, 'src'))) {
      for (const line of readFileSync(abs, 'utf8').split('\n')) {
        for (const code of codesOnLine(line, noise)) seen.add(code)
      }
    }
    console.log('[读数] prompt 文案面出现的大写码 ' + seen.size + ' 个（全部已注册）')
  })
})
