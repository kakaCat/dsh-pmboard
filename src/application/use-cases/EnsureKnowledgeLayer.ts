/**
 * 知识层自举用例（REQ-261004174324-4195 t2 / design/interfaces.md、use-cases.md）。
 *
 * 职责：**缺层就补**——索引不存在时生成骨架 + 全部可生成物；索引已存在时**一个字节都不动**
 * （正常态零读源码、零写盘），仅在生成物确实缺失时报「半残」并只补缺的那几份。
 *
 * 三条不变量：
 *  ① **先算后写**：全部目标内容先渲染完，再逐文件比对；（`drift` 模式只算不写）
 *  ② **手写页永不创建、永不覆盖**：`architecture/conventions/glossary.md` 不在目标集里；
 *  ③ **永不抛**：失败一律 `status:'failed'` + `failedPath` + `error`（宿主启动不得因自举中断）。
 *
 * @module dsh-pmboard/application/use-cases/EnsureKnowledgeLayer
 */
import {
  KbIndexStructureError,
  renderCodeMap,
  renderDesignTokens,
  replaceGeneratedSection,
  scaffoldIndex,
  type KbSourceFile,
} from '../../domain/knowledge/generate.js'
import { renderIndexLine } from '../../domain/knowledge/index-line.js'
import { KB_PAGE_PATHS, KB_PATHS } from '../../domain/knowledge/types.js'
import type { KbSourcePort, UseCaseDeps } from '../ports.js'
import { sameProjectRoot } from '../internal/support.js'

/** 自举未发生/失败的结构化原因。 */
export type KbEnsureReason = 'index-exists' | 'root-unknown' | 'root-drifted' | 'markers-missing' | 'disabled'

/** 自举结果（契约见 design/data-model.md「自举结果对象」）。 */
export interface KbEnsureResult {
  readonly status: 'created' | 'skipped' | 'failed'
  readonly root: string
  readonly created: readonly string[]
  readonly skipped: readonly { path: string; reason: 'same-content' | 'index-exists' }[]
  /** 仅 `mode='check'` 非空：每条 = 路径 + 首个差异定位（供 CLI 原样打印）。 */
  readonly drift: readonly string[]
  readonly reason?: KbEnsureReason
  readonly failedPath?: string
  readonly error?: string
  /**
   * 生成物计数（CLI 打印既有摘要行用）。
   * 为什么放进结果而不是让 CLI 自己再算一遍：算一遍就是第二份口径（本仓 INV-2 的反面）。
   */
  readonly stats?: {
    readonly symbols: number
    readonly colors: number
    readonly vars: number
    readonly breakpoints: number
    readonly classes: number
  }
}

export interface KbEnsureOptions {
  /**
   * 跳过「索引与生成物已齐备」的快捷返回（仍逐文件比对，内容相同不写）。
   * 用途：CLI `--write` 在源码改动后重算生成物；宿主自举**不要**传（正常态零读零写是硬指标）。
   */
  readonly force?: boolean
  readonly mode?: 'write' | 'check'
}

/** 源码根（与脚本搬迁前口径一致）。 */
const SOURCE_ROOT = 'src'

/** 递归收集 `<dir>/**\/*.ts`（经端口，测试可用内存实现）。 */
async function collectSourceFiles(src: KbSourcePort, dir: string, out: KbSourceFile[]): Promise<void> {
  for (const e of src.list(dir)) {
    const path = dir + '/' + e.name
    if (e.isFile !== false && e.name.endsWith('.ts')) {
      out.push({ path, text: await src.read(path) })
    } else if (e.isFile === false) {
      await collectSourceFiles(src, path, out)
    }
  }
}

/** 生成物清单（不含手写页）。 */
function generatedPaths(): readonly string[] {
  return [KB_PAGE_PATHS['code-map'], KB_PATHS.symbols, KB_PAGE_PATHS.tokens, KB_PATHS.classes]
}

/**
 * 漂移描述（与搬迁前脚本的 `[drift] … 首个差异在第 N 行` 同口径）。
 *
 * 为什么把「期望/实际那两行」留给 CLI：用例只回一句可读定位，正文片段由 CLI 按需打印，
 * 避免把可能很长的两行正文塞进结果对象（结果对象还会被宿主日志整体打印）。
 */
function describeDrift(path: string, cur: string, want: string): string {
  const curLines = cur.split('\n')
  const wantLines = want.split('\n')
  let i = wantLines.findIndex((l, n) => curLines[n] !== l)
  // 前缀全同、只是长度不同（多/少尾部行）：把差异定位到长度分界处，而不是报「第 0 行」
  if (i < 0) i = Math.min(wantLines.length, curLines.length)
  return path + '：首个差异在第 ' + String(i + 1) + ' 行（库内 ' + String(curLines.length) + ' 行 / 期望 ' + String(wantLines.length) + ' 行）'
}

/** 自举一次（幂等；永不抛）。 */
export async function ensureKnowledgeLayer(
  deps: Pick<UseCaseDeps, 'docs'>,
  opts: KbEnsureOptions = {},
): Promise<KbEnsureResult> {
  const docs = deps.docs
  const mode = opts.mode ?? 'write'
  const root = typeof docs.workspaceRoot === 'function' ? docs.workspaceRoot() : ''
  const empty = (status: KbEnsureResult['status'], reason?: KbEnsureReason): KbEnsureResult => ({
    status, root, created: [], skipped: [], drift: [], ...(reason === undefined ? {} : { reason }),
  })
  if (typeof root !== 'string' || root.length === 0) return empty('skipped', 'root-unknown')

  const indexExists = docs.exists(KB_PATHS.index)
  const missingGenerated = generatedPaths().filter((p) => !docs.exists(p))

  // 正常态（索引在 + 生成物齐）→ 零读源码、零写盘。
  // `force` 只跳过这条**快捷返回**（逐文件内容比对照旧），供 CLI 在源码改动后重算生成物；
  // `mode='check'` 必须真算（门禁就是来比对漂移的）。
  if (indexExists && missingGenerated.length === 0 && mode === 'write' && opts.force !== true) {
    return empty('skipped', 'index-exists')
  }

  const created: string[] = []
  const skipped: Array<{ path: string; reason: 'same-content' | 'index-exists' }> = []
  const drift: string[] = []
  try {
    const files: KbSourceFile[] = []
    await collectSourceFiles(docs as unknown as KbSourcePort, SOURCE_ROOT, files)
    const codeMap = renderCodeMap(files)
    const tokens = renderDesignTokens(files)

    const targets: Array<{ path: string; content: string }> = [
      { path: KB_PAGE_PATHS['code-map'], content: codeMap.page },
      { path: KB_PATHS.symbols, content: codeMap.symbolsTsv },
      { path: KB_PAGE_PATHS.tokens, content: tokens.page },
      { path: KB_PATHS.classes, content: tokens.classesTsv },
    ]

    // 索引：缺 → 建骨架；在 → 只替换生成区（手写行一字不动）。
    // 半残态（索引在、生成物缺）**不动索引**：那是人手写的锚点文件，只补缺的生成物。
    const writeIndex = !indexExists
    if (writeIndex) {
      targets.push({ path: KB_PATHS.index, content: scaffoldIndex() })
    } else {
      const indexText = await docs.read(KB_PATHS.index)
      let next = indexText
      next = replaceGeneratedSection(next, '前端令牌', [
        renderIndexLine({ id: 'kb-tokens-colors', kind: 'tokens', oneLiner: '颜色表与变量入口', pointer: 'design-tokens.md#colors' }),
      ])
      next = replaceGeneratedSection(next, '代码地图', [
        renderIndexLine({ id: 'kb-code-map-modules', kind: 'map', oneLiner: '模块级地图与符号检索入口', pointer: 'code-map.md#modules' }),
      ])
      if (mode === 'check' || opts.force === true) targets.push({ path: KB_PATHS.index, content: next })
    }

    for (const t of targets) {
      // 根漂移保护：捕获时的根与当前根不是同一个项目 → 立即中止（不写错项目）。
      if (!sameProjectRoot(docs.workspaceRoot(), root)) {
        return { ...empty('failed', 'root-drifted'), created, skipped }
      }
      const exists = docs.exists(t.path)
      const cur = exists ? await docs.read(t.path) : ''
      if (cur === t.content) {
        skipped.push({ path: t.path, reason: 'same-content' })
        continue
      }
      if (mode === 'check') {
        drift.push(describeDrift(t.path, cur, t.content))
        continue
      }
      await docs.write(t.path, t.content)
      created.push(t.path)
    }
    const stats = {
      symbols: codeMap.symbolCount,
      colors: tokens.counts.colors,
      vars: tokens.counts.vars,
      breakpoints: tokens.counts.breakpoints,
      classes: tokens.counts.classes,
    }
    if (mode === 'check') {
      return { status: drift.length === 0 ? 'skipped' : 'created', root, created: [], skipped, drift, stats, ...(drift.length === 0 ? { reason: 'index-exists' as const } : {}) }
    }
    return { status: 'created', root, created, skipped, drift: [], stats }
  } catch (err) {
    const structural = err instanceof KbIndexStructureError
    return {
      ...empty('failed', structural ? 'markers-missing' : undefined),
      created,
      skipped,
      ...(err instanceof Error ? { error: err.message } : { error: String(err) }),
      failedPath: structural ? (err as KbIndexStructureError).section : KB_PATHS.root,
    }
  }
}
