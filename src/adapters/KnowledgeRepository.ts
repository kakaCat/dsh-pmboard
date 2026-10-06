/**
 * 知识层文件适配器（REQ-261001110934-3766 t2 / ports.ts KnowledgePort）。
 *
 * 只做「文件搬运 + 用 domain 的语法单点做解析/渲染」，**自己不开 fs**：一切 I/O 经 `DocRepository`，
 * 这样 t2 的用例可以用临时工作区（甚至内存实现）跑，且路径口径与既有产物读写完全一致。
 *
 * 幂等口径（design/interfaces.md）：同源条目（`req` + `kind` 相同）→ 复用既有 id，
 * 条目文件覆盖、索引行**原位替换**——归档重复提交不会把索引撑成两行。
 *
 * @module dsh-pmboard/adapters/KnowledgeRepository
 */
import {
  checkIndexBudget,
  countLines,
} from '../domain/knowledge/budget.js'
import { defaultExpires, parseEntryDoc, renderEntryDoc } from '../domain/knowledge/entry.js'
import { isEntryId, parseIndexDoc, renderIndexLine, sectionId, splitSectionId } from '../domain/knowledge/index-line.js'
import { sliceSection } from '../domain/knowledge/slug.js'
import {
  KB_INDEX_SECTIONS,
  KB_PATHS,
  KB_PAGE_PATHS,
  entryPath,
  pagePath,
  sectionTitleFor,
  type KbArtifact,
  type KbEntryMeta,
  type KbIndexRow,
  type KbPageName,
} from '../domain/knowledge/types.js'
import { domainError, REQBOARD_ERROR_CODES } from '../domain/errors.js'
import type {
  DocRepository,
  KbEntryDraft,
  KbIndexReadResult,
  KnowledgePort,
} from '../application/ports.js'

/** 条目 id 序号（kb-NNNN → N）。 */
function entrySeq(id: string): number {
  return Number(id.slice(3))
}

/** 序号 → 条目 id（四位补零）。 */
function entryIdOf(seq: number): string {
  return 'kb-' + String(seq).padStart(4, '0')
}

export class KnowledgeRepository implements KnowledgePort {
  private readonly docs: DocRepository

  constructor(docs: DocRepository) {
    this.docs = docs
  }

  async indexExists(): Promise<boolean> {
    return this.docs.exists(KB_PATHS.index)
  }

  /**
   * 读索引。**索引不存在是正常状态**（知识层未启用：注入侧据此保持老行为逐字节不变），
   * 因此返回空结果而不是抛错；「存在但超预算」才由 overflows 响亮报出。
   */
  async readIndex(): Promise<KbIndexReadResult> {
    if (!this.docs.exists(KB_PATHS.index)) {
      return { text: '', chars: 0, lines: 0, overflows: [] }
    }
    const text = await this.docs.read(KB_PATHS.index)
    return { text, chars: text.length, lines: countLines(text), overflows: checkIndexBudget(text) }
  }

  async readEntries(): Promise<{ rows: readonly KbIndexRow[]; issues: readonly import('../domain/knowledge/types.js').KbIssue[] }> {
    if (!this.docs.exists(KB_PATHS.index)) return { rows: [], issues: [] }
    const text = await this.docs.read(KB_PATHS.index)
    const parsed = parseIndexDoc(text)
    return { rows: parsed.rows, issues: parsed.issues }
  }

  async readEntry(id: string): Promise<string | undefined> {
    if (isEntryId(id)) {
      const path = entryPath(id)
      return this.docs.exists(path) ? await this.docs.read(path) : undefined
    }
    const section = splitSectionId(id)
    if (section === undefined) return undefined
    const path = KB_PAGE_PATHS[section.page as KbPageName]
    if (path === undefined || !this.docs.exists(path)) return undefined
    const md = await this.docs.read(path)
    return sliceSection(md, section.anchor)
  }

  async appendEntry(draft: KbEntryDraft): Promise<{ id: string; indexPath: string }> {
    if (draft.kind === 'map') {
      throw domainError(
        REQBOARD_ERROR_CODES.invalidInput,
        'map 类条目由生成器（scripts/kb-build.mts）产出，不接受运行时追加',
      )
    }
    if (!this.docs.exists(KB_PATHS.index)) {
      throw domainError(
        REQBOARD_ERROR_CODES.invalidInput,
        '知识索引不存在（' + KB_PATHS.index + '）：先跑 `npx tsx scripts/kb-build.mts --write` 生成骨架',
      )
    }
    const indexText = await this.docs.read(KB_PATHS.index)
    const { rows } = parseIndexDoc(indexText)
    const existing = await this.findSameOriginEntry(draft)
    const id = existing?.meta.id ?? this.allocateId(rows, await this.listEntryIds())
    const status = draft.status ?? 'active'
    const meta: KbEntryMeta = {
      id,
      kind: draft.kind,
      status,
      title: draft.title,
      oneLiner: draft.oneLiner,
      appliesWhen: draft.appliesWhen,
      pointer: draft.pointer,
      updated: draft.updated,
      expires: defaultExpires(draft.updated),
      ...(draft.req === undefined ? {} : { req: draft.req }),
      ...(draft.supersedes === undefined ? {} : { supersedes: draft.supersedes }),
    }
    // REQ-261006123819-3af3 FR-4 根因②：**先把索引行算出来（renderIndexLine 会校验 one_liner
    // 与指针语法），再写条目文件**。原顺序是先落 entries/<id>.md、再算索引行——一条非法
    // one_liner（含 `·`/`→` 或超 140）会让索引那一步抛错，留下「条目已落盘、索引没写」的孤儿
    // （kb-0043 / kb-0048 正是这么产生的：K5 报孤儿时，条目文件已是既成事实）。
    // 只有 active 才进索引（I-7）；非 active → 若既有行存在则移除（幂等：可反复回填）
    const next = status === 'active'
      ? upsertIndexRow(indexText, {
          id,
          kind: draft.kind,
          oneLiner: meta.oneLiner,
          pointer: 'entries/' + id + '.md',
        })
      : removeIndexRow(indexText, id)
    await this.docs.write(entryPath(id), renderEntryDoc(meta, draft.body))
    await this.docs.write(KB_PATHS.index, next)
    return { id, indexPath: KB_PATHS.index }
  }

  async listArtifacts(): Promise<readonly KbArtifact[]> {
    const out: KbArtifact[] = []
    if (this.docs.exists(KB_PATHS.index)) out.push({ path: KB_PATHS.index, role: 'index' })
    for (const path of Object.values(KB_PAGE_PATHS)) {
      if (this.docs.exists(path)) out.push({ path, role: 'page' })
    }
    for (const id of await this.listEntryIds()) {
      out.push({ path: entryPath(id), role: 'entry' })
    }
    for (const path of [KB_PATHS.symbols, KB_PATHS.classes]) {
      if (this.docs.exists(path)) out.push({ path, role: 'machine' })
    }
    return out
  }

  /** 目录里的条目 id（按文件名，不读正文）。 */
  private async listEntryIds(): Promise<readonly string[]> {
    return this.docs
      .list(KB_PATHS.entriesDir)
      .filter((e) => e.isFile && isEntryId(e.name.replace(/\.md$/, '')))
      .map((e) => e.name.replace(/\.md$/, ''))
      .sort()
  }

  /** 同源条目（req + kind 相同）→ 复用其 id（幂等）。 */
  private async findSameOriginEntry(draft: KbEntryDraft): Promise<{ meta: KbEntryMeta } | undefined> {
    if (draft.req === undefined) return undefined
    for (const id of await this.listEntryIds()) {
      const text = await this.docs.read(entryPath(id))
      try {
        const { meta } = parseEntryDoc(text)
        if (meta.req === draft.req && meta.kind === draft.kind) return { meta }
      } catch {
        // 坏条目由自检报出；这里跳过，不让一条坏文件挡住写入
        continue
      }
    }
    return undefined
  }

  /** 分配下一个条目序号：取索引行与目录文件名里的最大号 +1。 */
  private allocateId(rows: readonly KbIndexRow[], fileIds: readonly string[]): string {
    const seqs = [
      ...rows.filter((r) => isEntryId(r.id)).map((r) => entrySeq(r.id)),
      ...fileIds.map((id) => entrySeq(id)),
    ]
    const max = seqs.length === 0 ? 0 : Math.max(...seqs)
    return entryIdOf(max + 1)
  }
}

/**
 * 索引行的原位替换 / 分节追加（导出以便单测直接锁住边界行为）。
 * 规则：同 id 已存在 → 替换该行；否则插到该 kind 分节的**生成区之后、下一个 `##` 之前**。
 */
export function upsertIndexRow(text: string, row: KbIndexRow): string {
  const line = renderIndexLine(row)
  const lines = text.split('\n')
  const prefix = '- ' + row.id + ' ·'
  const existing = lines.findIndex((l) => l.startsWith(prefix))
  if (existing >= 0) {
    lines[existing] = line
    return lines.join('\n')
  }
  const title = sectionTitleFor(row.kind)
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').replace(/`/g, '').trim() === title)
  if (start < 0) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '索引缺少分节「' + title + '」：应为 ' + KB_INDEX_SECTIONS.map((s) => s.title).join(' / '),
    )
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i]!)) {
      end = i
      break
    }
  }
  let insertAt = end
  const genEnd = lines.findIndex((l, i) => i > start && i < end && l.trim() === KB_PATHS.generatedEnd)
  if (genEnd >= 0) insertAt = genEnd + 1
  else while (insertAt > start + 1 && lines[insertAt - 1]!.trim() === '') insertAt -= 1
  lines.splice(insertAt, 0, line)
  return lines.join('\n')
}

/** 从索引里移除某 id 的行（非 active 条目不该留在索引里）。 */
export function removeIndexRow(text: string, id: string): string {
  const prefix = '- ' + id + ' ·'
  const lines = text.split('\n').filter((l) => !l.startsWith(prefix))
  return lines.join('\n')
}

/** 页面小节 id 构造（供写入端在页面里登记规则时复用同一口径）。 */
export { sectionId, pagePath }
