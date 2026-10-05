/**
 * 知识层只读路由（REQ-261001110934-3766 t5）—— 看板「知识库」页的数据源。
 *
 * 只做协议转换：查询参数 → `executeQueryKnowledge`（application 用例）→ JSON 信封。
 * **只读**：本模块不写任何东西；裁决/写入全部在别的入口（归档沉淀走 reqboard_submit）。
 * 与工具**同构**（同一用例），保证「会话里问到的」与「看板上看到的」是同一份知识。
 *
 * @module dsh-pmboard/http/routers/knowledge
 */
import type { ServerResponse } from 'node:http'
import { executeQueryKnowledge } from '../../application/use-cases/QueryKnowledge.js'
import { countLines } from '../../domain/knowledge/budget.js'
import { KB_PAGE_PATHS } from '../../domain/knowledge/types.js'
import type { RouterCtx } from './shared.js'

/** 页面清单（看板页头显示「4 份页面各多少行」，让人一眼看到预算余量）。 */
async function pageInventory(docs: { exists(p: string): boolean; read(p: string): Promise<string> } | undefined): Promise<Array<{ path: string; lines: number }>> {
  if (docs === undefined) return []
  const out: Array<{ path: string; lines: number }> = []
  for (const path of Object.values(KB_PAGE_PATHS)) {
    if (!docs.exists(path)) continue
    out.push({ path, lines: countLines(await docs.read(path)) })
  }
  return out
}

export function createKnowledgeRouter(ctx: RouterCtx) {
  const { ok, fail, deps } = ctx

  /**
   * GET /dashboard/api/reqboard/kb?query=&kind=&id=&limit=&budget_chars=
   * 返回与 `reqboard_kb` 同构的检索结果，另附 `pages[]`（页面路径与行数）。
   * 知识层未装配 → 空集 + hint（看板不因此变红）；参数非法 → 既有错误映射（400）。
   */
  async function handleKb(res: ServerResponse, url: URL): Promise<void> {
    const appDeps = deps.applicationDeps
    const pages = await pageInventory(deps.docs)
    if (appDeps === undefined || appDeps.knowledge === undefined) {
      ok(res, { items: [], total: 0, truncated: false, budgetChars: 0, hint: '知识层未装配（applicationDeps.knowledge 缺失）', pages })
      return
    }
    const hasSelector = ['query', 'kind', 'id'].some((k) => (url.searchParams.get(k) ?? '').length > 0)
    try {
      const result = await executeQueryKnowledge(appDeps, {
        // 看板页默认「列全部」；工具侧不传选择器仍会被拒（见 QueryKnowledge 的 list 说明）
        ...(hasSelector ? {} : { list: true }),
        ...(url.searchParams.get('list') === '1' ? { list: true } : {}),
        ...(url.searchParams.get('query') ?? '' ? { query: url.searchParams.get('query')! } : {}),
        ...(url.searchParams.get('kind') ?? '' ? { kind: url.searchParams.get('kind')! } : {}),
        ...(url.searchParams.get('id') ?? '' ? { id: url.searchParams.get('id')! } : {}),
        ...(url.searchParams.get('limit') ?? '' ? { limit: Number(url.searchParams.get('limit')) } : {}),
        ...(url.searchParams.get('budget_chars') ?? '' ? { budgetChars: Number(url.searchParams.get('budget_chars')) } : {}),
      })
      ok(res, { ...result, pages })
    } catch (err) {
      fail(res, err)
    }
  }

  return { handleKb }
}
