/**
 * 知识层生成器 CLI（REQ-261001110934-3766 t3 起源 / REQ-261004174324-4195 t3 改为薄包装）。
 *
 * **本文件不再含生成规则**：解析 argv → 构造文档仓储 → 调 `ensureKnowledgeLayer` → 打印。
 * 生成逻辑单点在 `src/domain/knowledge/generate.ts` + `src/application/use-cases/EnsureKnowledgeLayer.ts`
 * （宿主自举与手动命令走同一份实现，避免"脚本和宿主各写一套"）。
 *
 * 跑法：
 *   npx tsx scripts/kb-build.mts --write [--root <dir>]   # 写入/覆盖生成物（内容相同不写）
 *   npx tsx scripts/kb-build.mts --check [--root <dir>]   # 只比对，有漂移 → 退出码 1（CI 门禁）
 *   npx tsx scripts/kb-build.mts --backfill [--ledger <path>]
 *
 * @module dsh-pmboard/scripts/kb-build
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.ts'
import { ensureKnowledgeLayer } from '../src/application/use-cases/EnsureKnowledgeLayer.ts'
import { KB_LIMITS } from '../src/domain/knowledge/budget.ts'
import { KB_PATHS } from '../src/domain/knowledge/types.ts'

const args = process.argv.slice(2)
const check = args.includes('--check')
const backfill = args.includes('--backfill')
const root = ((): string => {
  const i = args.indexOf('--root')
  const v = i >= 0 ? args[i + 1] : undefined
  return typeof v === 'string' && v.length > 0 ? v : process.cwd()
})()

const docs = new FileDocRepository({ workspaceRoot: root })
const result = await ensureKnowledgeLayer({ docs }, { mode: check ? 'check' : 'write', force: !check })

if (result.status === 'failed') {
  console.error('[error] ' + (result.error ?? '未知失败') + (result.failedPath === undefined ? '' : '（' + result.failedPath + '）'))
  process.exit(1)
}

let driftCount = result.drift.length
if (check) {
  for (const d of result.drift) console.error('[drift] ' + d)
  if (driftCount > 0) console.error('  取期望内容：跑 `npx tsx scripts/kb-build.mts --write` 后看 git diff')
} else {
  for (const p of result.created) {
    const text = readFileSync(join(root, p), 'utf8')
    console.log(`[write] ${p}（${String(text.length)} 字符 / ${String(text.split('\n').length)} 行）`)
  }
  for (const s of result.skipped) {
    if (s.reason === 'same-content') console.log(`[skip] ${s.path}（内容一致）`)
  }
  if (result.reason === 'index-exists') console.log('[skip] 知识层已就绪（索引与生成物齐备，未重算）')
}

// INDEX 行数预算（与搬迁前脚本同口径：超限计入漂移 → check 退出码 1）。
const indexPath = join(root, KB_PATHS.index)
const indexExists = existsSync(indexPath)
const indexLines = indexExists ? readFileSync(indexPath, 'utf8').split('\n').length : 0
if (indexExists && indexLines > KB_LIMITS.indexMaxLines) {
  console.error(`[over-budget] INDEX.md 行数 ${String(indexLines)} > ${String(KB_LIMITS.indexMaxLines)}`)
  driftCount += 1
}

if (result.stats !== undefined) {
  console.log(
    `kb-build: 符号 ${String(result.stats.symbols)} 条 · 颜色 ${String(result.stats.colors)} · 变量 ${String(result.stats.vars)} `
    + `· 断点 ${String(result.stats.breakpoints)} · 类名 ${String(result.stats.classes)} · INDEX ${String(indexLines)} 行`,
  )
}

// ── --backfill：把台账里已归档需求的 indexEntry 回填成知识条目（幂等：同源复用 id） ──
// 与生成器无关，仍留在脚本内（它需要台账文件与 KnowledgeRepository，不属"生成规则"）。
if (backfill) {
  const { KnowledgeRepository } = await import('../src/adapters/KnowledgeRepository.ts')
  const ledgerPath = (() => {
    const i = args.indexOf('--ledger')
    const v = i >= 0 ? args[i + 1] : undefined
    return typeof v === 'string' && v.length > 0 ? v : join(process.env['HOME'] ?? '', '.dsh/dsh-reqboard.json')
  })()
  if (!existsSync(ledgerPath)) {
    console.error('[backfill] 台账不存在：' + ledgerPath + '（用 --ledger <path> 指定）')
    process.exit(1)
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
    requirements?: Array<{
      id?: string
      title?: string
      status?: string
      archive?: { indexEntry?: string; mergedInto?: string[]; dir?: string; docs?: Array<{ kind?: string }>; submittedAt?: number }
    }>
  }
  const kb = new KnowledgeRepository(docs)
  if (!(await kb.indexExists())) {
    console.error('[backfill] 知识索引不存在：先跑 --write 生成骨架')
    process.exit(1)
  }
  let created = 0
  let skipped = 0
  for (const r of ledger.requirements ?? []) {
    const entryText = r.archive?.indexEntry ?? ''
    if (r.id === undefined || entryText.length === 0) continue
    if (r.status !== 'archived' && r.status !== 'done') continue
    const hasRetro = (r.archive?.docs ?? []).some((d) => d.kind === 'retro')
    const merged = r.archive?.mergedInto ?? []
    const updated = new Date(r.archive?.submittedAt ?? Date.now()).toISOString().slice(0, 10)
    const dirRel = (r.archive?.dir ?? '').replace(/^agent-dh\//, '')
    const candidates = [merged[0], dirRel.length > 0 ? dirRel + '/verification.md' : undefined]
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
    const pointer = candidates.find((c) => existsSync(join(root, c))) ?? ''
    const unresolved = pointer.length === 0 && candidates.length > 0 ? candidates[0]! : ''
    const res = await kb.appendEntry({
      kind: hasRetro ? 'pitfall' : 'decision',
      ...(hasRetro ? { status: 'stale' as const } : {}),
      title: (r.title ?? r.id).slice(0, 120),
      oneLiner: entryText.slice(0, 140),
      appliesWhen: '同类需求再次出现时（先读这条，别重复踩坑）',
      pointer,
      updated,
      req: r.id,
      body: [
        '## 结论', entryText, '',
        '## 适用条件', '同类需求再次出现时', '',
        '## 证据', '台账归档记录：' + r.id
          + (unresolved.length > 0 ? '（原始合并去向在本工作区不可解析：' + unresolved + '——已降级为无指针，待人工补）' : ''), '',
        '## 失效条件', '相关实现被重构或被新条目 supersede', '',
        '## 相关', pointer.length > 0 ? pointer : '（无合并去向）',
      ].join('\n'),
    })
    if (hasRetro) skipped += 1
    else created += 1
    console.log('[backfill] ' + r.id + ' → ' + res.id + (hasRetro ? '（stale：有复盘，待人复核）' : ''))
  }
  console.log(`[backfill] 完成：入库 ${String(created)} 条（active）、待复核 ${String(skipped)} 条（stale）；台账 ${ledgerPath}`)
}

if (check) {
  console.log(driftCount === 0 ? '[verify] 生成物与库内一致（零漂移）' : `[verify] 检测到 ${String(driftCount)} 处漂移`)
  process.exit(driftCount === 0 ? 0 : 1)
}
