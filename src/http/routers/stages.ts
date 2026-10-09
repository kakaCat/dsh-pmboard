/**
 * Stages 路由（REQ-47939a t7）——从 host/routes.ts 的 createReqboardHandler 内联处理器**逐字搬入**。
 *
 * 只做协议转换（请求体 → 用例/领域判定 → JSON 信封）；状态字面量比较一律经 domain 判定函数
 * （layer-boundary INV-2）。错误 → HTTP 状态码映射集中在本目录 shared.ts 的 fail()。
 *
 * @module dsh-pmboard/http/routers/Stages
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveDocRoot } from './shared.js'
import { homedir } from 'node:os'
import {
  asStageKey,
  totalTokens,
  windowCodeFromSessionId,
  type RequirementRecord,
  type RequirementTokenView,
} from '../../shared/protocol.js'
import { syncAllReqArtifacts, syncReqArtifacts } from '../../adapters/ArtifactSync.js'
import { assembleStageDetail, assembleStageOverview } from '../../application/query/QueryStageDetail.js'
import { designDocPolicyOf } from '../../application/internal/design-docs.js'
// REQ-261007223647-da5d t6（FR-5 / 设计 IF-5）：挂起确认票投影——看板首屏的「有人在你门口等着」。
import { pendingBoardRowsOf, type PendingBoardRow } from '../../application/internal/pending-board.js'
import { seatsOf } from '../../application/internal/window.js'
// REQ-261006201841-944d t8（FR-7）：来源三态派生的**唯一实现**（纯函数，判据不落在路由里）。
import { requirementOriginsOf } from '../../application/internal/requirement-origins.js'
import { assembleRequirementToken, requirementTotalTokens } from '../../application/query/QueryRequirementToken.js'
import { assembleRequirementMarks } from '../../application/query/QueryRequirementMarks.js'
import { FileDocRepository } from '../../adapters/FileDocRepository.js'
import {
  injectionWindowsOf,
  summarizeInjections,
  summarizeSystemPrompt,
  unavailableSystemPromptCost,
} from '../../application/internal/prompt-cost.js'
import {
  countDoneTasks,
  countUnfinishedTasks,
  isActiveRequirement,
  isOpenRequirement,
  liveCountOf,
  liveReadyTasks,
  liveTasksOf,
} from '../../domain/status/Predicates.js'
import { TASK_STATUS_ORDER } from '../../domain/task/TaskStatus.js'
import { fmt } from '../../domain/text/fmt.js'
import { clientBuildStamp } from '../client-build.js'
import type { RouterCtx } from './shared.js'

export function createStagesRouter(ctx: RouterCtx) {
  // B12 阶段④-2-③：本文件的读与订阅已全部迁到 `ctx.requirementStore` ⇒ 旧口不再需要
  const { taskStore, ok, fail, deps } = ctx

  /**
   * B12 阶段④-2-③：整册读改走新端口。裁决①（对话）＝本卡**保持载荷形状**：
   * 摘要列 id → 逐条取全文（读放大治理与 /state 契约变更按设计 interfaces.md:119-125 **另开卡**）。
   */
  async function readAll(): Promise<{ revision: number; requirements: RequirementRecord[] }> {
    const st = ctx.requirementStore
    const items = (await st.listSummaries({ scope: 'all' })).items
    const requirements = (await Promise.all(items.map(async (i) => await st.get(i.id))))
      .filter((r): r is RequirementRecord => r !== undefined)
      // 新端口的摘要序是 updatedAt 倒序（分页规范序）；旧台账是**追加序**。
      // 裁决①要求本卡**保载荷逐字节** ⇒ 这里按 createdAt 升序（同级按 id）还原追加序。
      .sort((a, b) => (a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
    const { revision } = await st.head()
    return { revision, requirements }
  }

  /**
   * 看板 pending 票投影（REQ-261007223647-da5d t6 · serves: FR-5 / 设计 interfaces.md IF-5）。
   *
   * 治什么：确认票超时/中断后仍然挂着，人却看不到——看板首屏必须能一眼发现「有门在等我」。
   *
   * 三条口径：
   *  ① **口径同源**：逐条筛选（台账已落章 / 是不是门 / 有没有可落章产物）走
   *     `application/internal/pending-board.ts`，与 agent 侧 `reqboard_status.pending_confirms` 同一组谓词；
   *  ② **只对本页需求算**（≤ limit 条），且**只在真有未作答票时才回读全文**（多数请求零额外读盘）；
   *  ③ **键恒在**：无票回空数组，**不省略键**（client 用 `[]` 渲染 = 不占首屏；缺键是"老服务端"的兼容口径，
   *     二者必须可区分）。
   *
   * 读口未装配（`pendingConfirms` 缺省）→ 空数组：本部署组合根恒装配它，缺装配属于配置问题，
   * 但看板不能因此 500（其余读数照常可用）。
   */
  async function pendingBoardOf(ids: readonly string[]): Promise<PendingBoardRow[]> {
    const port = deps.pendingConfirms
    if (port === undefined) return []
    // 时刻取自路由 ctx 的时钟（`deps.now`）——不直取 Date.now()：剩余时间是要被断言的读数，
    // 注入时钟后测试才能断言公式，而不是靠运气（与 pending-guard 的 now 注入同款）。
    const now = ctx.now()
    const rows: PendingBoardRow[] = []
    // 兼容只装配 `pendingForWindow` 的端口：按需求席位逐窗口查、只留指向本需求的（与报告首屏同口径）。
    const needsSeatScan = port.pendingForRequirement === undefined && port.pendingForWindow !== undefined
    for (const id of ids) {
      let recs: readonly import('../../shared/protocol.js').PendingConfirmation[]
      let req: RequirementRecord | undefined
      if (port.pendingForRequirement !== undefined) {
        recs = port.pendingForRequirement(id)
        if (recs.length === 0) continue
        // 只有真有票时才回读全文（谓词要看 plan / artifacts，摘要里没有）
        req = await ctx.requirementStore.get(id)
      } else if (needsSeatScan) {
        req = await ctx.requirementStore.get(id)
        if (req === undefined) continue
        const seen = new Map<string, import('../../shared/protocol.js').PendingConfirmation>()
        for (const seat of seatsOf(req)) {
          const found = port.pendingForWindow!(seat.windowKey)
          if (found !== undefined && found.requirementId === id) seen.set(found.ticket, found)
        }
        recs = [...seen.values()]
        if (recs.length === 0) continue
      } else {
        continue
      }
      rows.push(...pendingBoardRowsOf(req, recs, now))
    }
    return rows.sort((a, b) => (a.remaining_ms - b.remaining_ms) || (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0))
  }

  /**
   * GET /（含 `/state`）——**摘要 + 分页**载荷（REQ-261002161439-277d B12 阶段⑥-①）。
   *
   * 改前两处随数据量放大：① 每请求 `syncAllReqArtifacts` 全量扫需求目录；
   * ② 先用摘要取 id 再逐条 `get` 回**全文**（含 comments/artifacts/plan/archive）塞进响应
   * —— 实测 A9 夹具（35 条、33 归档）单次响应 **2,768,960 字节**。
   * 改后：只回摘要（计数代替本体），产物扫描移到 `POST /artifacts/scan`，详情走 `GET /requirements/:id`。
   */
  async function handleState(res: ServerResponse, url: URL): Promise<void> {
    const scopeRaw = url.searchParams.get('scope')
    const scope: 'active' | 'archived' | 'all' =
      scopeRaw === 'all' || scopeRaw === 'archived' ? scopeRaw : 'active'
    const limitRaw = Number(url.searchParams.get('limit') ?? '200')
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), 1000) : 200
    const cursor = url.searchParams.get('cursor') ?? undefined
    // FR-11：本次请求的读根（会话优先）。前端把当前会话 id 放进 ?session= 查询参数。
    const docRoot = resolveDocRoot(deps, url.searchParams.get('session') ?? undefined)
    const st = ctx.requirementStore
    // REQ-261005141830-7a3b t5（FR-6 / FR-10）：**看板列表按项目切**——会话能解析出项目身份时只列本项目的
    // 需求；同时把**未归属**（无 `projectId`）的存量记录一并带回（FR-8：老记录不因缺身份而从看板消失）。
    // 身份解析不到（未装配项目表 / 未命中）→ 不传筛 = 全量，老行为逐字不变。
    const callerProjectId = docRoot.projectId
    const page = await st.listSummaries({
      scope,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
      ...(callerProjectId === undefined ? {} : { projectId: callerProjectId, includeUnattributed: true }),
    })
    // 任务来自队列（REQ-260927202051-f6df）：listAll() 顺序 = requirementId 字典序分组 + 组内队列顺序（D2/D8）。
    const tasks = await taskStore.listAll()
    // REQ-261005193546-1b1a FR-5（出口清单 ①）：**在 API 边界一次收敛**——已取消卡不进任何界面投影，
    // 客户端不再各写过滤。判据单点在 domain（`liveTasksOf` / `isLiveTask`），此处只调用、不自写比较式。
    const live = liveTasksOf(tasks)
    const { revision } = await st.head()
    ok(res, {
      revision,
      limit,
      // 末页时**不发该键**（缺失 = 到底；发 null 会被客户端读成"还有一页"）。
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      requirements: page.items,
      tasks: live.map(t => ({ ...t })),
      // REQ-261007223647-da5d t6（FR-5 / 设计 IF-5）：挂起确认票——看板首屏「有人在等」的数据源。
      // 六键（ticket / requirement_id / target / kind? / created_at / interrupted）+ 失效时刻与剩余毫秒。
      // **键恒在**：无票 = 空数组（不省略键，客户端据此不渲染首屏横带）。
      pending_confirms: await pendingBoardOf(page.items.map(i => i.id)),
      // 派生视图：每个需求的 ready 任务（client 调度提示用）。
      // REQ-261005193546-1b1a FR-1 / FR-5：**现算、不读落盘 `ready[]`**——磁盘 `ready[]` 是旧口径快照
      // （写路径下次事务才重算），且旧判据会把「前置已取消」的活卡漏在门外面。判据单点 = `liveReadyTasks`
      // （`isReadyTask` 的集合形态：自身 todo ∧ 约束桶为空；指向取消卡的边按已满足）。
      // 仍保持**输出顺序 = 任务数组顺序** —— 需求内顺序必须保住（R-3/D8），故不用队列文件的 `ready`
      // 字段（其顺序由 computeReady 决定，不保证一致）。
      ready: Object.fromEntries(
        page.items.map(r => [r.id, liveReadyTasks(live.filter(t => t.requirementId === r.id))]),
      ),
      // REQ-a33899：需求卡面累计 token。**无快照的需求不出现该键**（缺失 ≠ 0）。
      // B12 阶段⑥-①：该派生视图要读产物本体才能算，故**只对本页 id 计算**（有界：≤ limit 条，
      // 且默认 scope=active 时归档需求根本不在页内）；不再是"整册逐条回全文"。
      tokenTotals: Object.fromEntries(
        (await Promise.all(page.items.map(async (i) => {
          const full = await st.get(i.id)
          return [i.id, full === undefined ? undefined : requirementTotalTokens(full)] as const
        })))
          .filter((e): e is readonly [string, number] => e[1] !== undefined),
      ),
      // REQ-260922012924-2e29 FR-4：文档路径绝对化的"根"。看板/会话进度打开文档时以它把
      // 相对路径拼成绝对路径（dsh-resource 协议支持绝对路径），不再依赖查看会话的工作区——
      // 修复"工作区=dsh-pmboard 的会话打不开需求文档"。旧客户端读不到这两个字段即忽略。
      // REQ-261003215944-9e04 FR-11：读根改为**发起阅读的会话工作区**（带 ?session=<id> 时），
      // 解析不到才回落 legacy cwd——并在 docsRootSource 里如实说明用了哪个根（不静默降级）。
      workspaceRoot: docRoot.root,
      sessionWorkspaceRoot: docRoot.sessionRoot,
      docsRootSource: docRoot.source,
      // REQ-261006201841-944d t8（FR-7）：归档条来源三态——需求 id → local / elsewhere / unknown。
      // **判据单点**在 application/internal/requirement-origins.ts（`rootOfRequirement` + `sameProjectRoot`）；
      // 本路由只做协议转换，不写任何路径比较。**只对本页 requirements 计算**（≤ limit，零额外读盘：
      // 摘要自带 projectId / workspaceRoot）。项目表取自应用层依赖包（路由白名单未转发 projectRegistry）；
      // 未装配 → 判据一律走路径兜底（by='path-fallback'），行为如实标注、不冒充项目身份。
      origins: requirementOriginsOf(
        // 项目表优先取应用层依赖包（组合根把 useCaseDeps 整体传进来了，里面有真项目表）；
        // 路由自己的 deps 未转发 projectRegistry，故它只作兜底（并补齐派生要读的 `docs` 形状）。
        ctx.deps.applicationDeps ?? { ...deps, docs: deps.docs ?? {} },
        page.items,
        docRoot.root,
      ),
      // REQ-261005141830-7a3b t5（FR-9）：判据可观测——本次列表用的是项目身份还是路径兜底，现场就能看出。
      projectSource: docRoot.projectSource,
      ...(docRoot.projectId === undefined ? {} : { projectId: docRoot.projectId }),
      homeDir: homedir(),
    })
  }

  /**
   * POST /artifacts/scan —— 产物自动发现（REQ-2e9473 t11/W4）从 `GET /` 挪到这里（A10）。
   *
   * 为什么挪：扫描是"写侧"动作（落盘即产物），放在读接口上等于**每次看板刷新都写一遍台账**，
   * 且随需求目录规模放大。挪成独立端点后：GET 只读、扫描显式发生、可被单独调用与断言。
   */
  async function handleArtifactScan(res: ServerResponse, url?: URL): Promise<void> {
    // REQ-261005141830-7a3b t5（FR-6）：扫描也按**项目身份**分区——带 ?session= 时用它解析出的项目 id
    // 当分区判据（两侧都有身份就比 id，路径同形也拦得住）；不带/解析不到 → 回落路径口径（老行为）。
    const docRoot = resolveDocRoot(deps, url?.searchParams.get('session') ?? undefined)
    await syncAllReqArtifacts(ctx.requirementStore, docRoot.root, undefined, docRoot.projectId)
      .then((r) => ok(res, { scanned: r.scanned, skipped: r.skipped }))
      .catch((err: unknown) => fail(res, err))
  }

  /**
   * GET /requirements/:id —— 详情按需（B12 阶段⑥-①）。
   *
   * 热侧 miss 由存储实现自己回落冷读（`ShardedRequirementStore.get` 已实现），此处只做协议转换：
   * 未命中 → 404 `REQBOARD_NOT_FOUND`（不返回 200 + 空体，否则客户端分不清"没有"与"没读到"）。
   */
  async function handleRequirementDetail(res: ServerResponse, id: string): Promise<void> {
    const rec = await ctx.requirementStore.get(id)
    if (rec === undefined) {
      fail(res, Object.assign(new Error(`未找到需求 ${id}`), { code: 'REQBOARD_NOT_FOUND' }))
      return
    }
    ok(res, { revision: (await ctx.requirementStore.head()).revision, requirement: rec })
  }

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    })
    res.write(': connected\n\n')
    /**
     * REQ-261001124111-5d36 t4：连接建立后补一帧**命名帧** `build`，携带
     * ① 客户端构建戳（`sha256(lib/client.cjs)` 前 12 位）② 面板刷新策略（宿主配置下发）。
     *
     * 客户端用 `addEventListener('build')` 收（命名事件不触发 onmessage——见 api.ts 同款注释）。
     * **读不到 `lib/client.cjs` 就不发这一帧**：不声称"你看的是新版"，也不让页面误报"插件已更新"。
     * 这一帧不含任何业务数据，未注册该事件的既有消费者按 SSE 规范直接忽略。
     */
    const stamp = clientBuildStamp()
    if (stamp !== undefined) {
      try {
        res.write('event: build\n')
        res.write('data: ' + JSON.stringify({
          stamp,
          ...(deps.panelPolicy !== undefined ? { panel: deps.panelPolicy } : {}),
        }) + '\n\n')
      } catch { /* client gone：连接已断，后续订阅会各自清理 */ }
    }
    /**
     * 双通道发出（REQ-260927202051-f6df D15）：
     *  - **命名帧**（`event: <kind>` + `data:`）：既有契约，供 `addEventListener(kind)` 消费；
     *  - **无名帧**（只有 `data:`）：SSE 规范规定命名事件**不触发 `onmessage`**，而
     *    `client/api.ts` 用的正是 `es.onmessage` ⇒ 只发命名帧时看板收不到推送（此前实际靠
     *    board-mount 的 20s 轮询兜底，看起来正常）。补无名帧让实时刷新真正生效。
     *    帧格式与字段（revision/kind）均未变，故对既有消费者零影响（最多多一次幂等 refetch）。
     */
    const emit = (kind: string, revision: number): void => {
      try {
        const payload = JSON.stringify({ revision, kind })
        res.write(`event: ${kind}\n`)
        res.write(`data: ${payload}\n\n`)
        res.write(`data: ${payload}\n\n`)
      } catch { /* client gone */ }
    }
    // 两路订阅：台账（需求/分诊/评论）+ 队列（任务）。
    // schema v9 后任务不再经台账 ⇒ 只订台账会让任务状态变更不再推送（看板实时刷新静默失灵）。
    // B12 阶段④-2-③：SSE 订阅改挂新端口（旧口只用于读，订阅语义一致：kind + 全局序）
    const unsubscribeLedger = ctx.requirementStore.subscribe((change) => { emit(change.kind, change.revision) })
    const unsubscribeTasks = taskStore.subscribe((change) => { emit(change.kind, change.revision) })
    const heartbeat = setInterval(() => { try { res.write(': hb\n\n') } catch { /* gone */ } }, 25_000)
    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribeLedger()
      unsubscribeTasks()
    })
  }

  /**
   * GET /dashboard/api/reqboard/requirements/summary
   * 进行中需求的紧凑摘要（侧边栏下拉 / 列表视图共用）：
   * 标题 / 状态 / 来源窗口码 / 任务进度。按「越靠后越靠前」排序。
   */
  async function handleRequirementsSummary(res: ServerResponse): Promise<void> {
    const ledger = await readAll()
    // 任务来自队列（一次取全量后按需求分组，顺序 = 组内队列顺序，需求内相对顺序保住）。
    const allTasks = await taskStore.listAll()
    const rank: Record<string, number> = {
      implementing: 0, accepting: 1, decomposing: 2, design: 3, brainstorming: 4, draft: 5, done: 6,
    }
    const summaries = ledger.requirements
      .filter(r => isActiveRequirement(r))
      .map(req => {
        const tasks = allTasks.filter(t => t.requirementId === req.id)
        const done = countDoneTasks(tasks)
        const active = countUnfinishedTasks(tasks)
        // REQ-261005193546-1b1a FR-2 / FR-5（出口清单 ②）：计数分母 = **活卡数**（`liveCountOf` 与
        // `liveTasksOf` 同源，不新造计量粒度——一卡一行照旧，只剔除已取消）。
        // done / active 走既有 helper（它们本就不把 canceled 算进去），此处不动其口径。
        const total = liveCountOf(tasks)
        return {
          id: req.id,
          title: req.title,
          status: req.status,
          category: req.category ?? null,
          sourceSessionId: req.sourceSessionId ?? null,
          windowCode: req.sourceSessionId !== undefined ? windowCodeFromSessionId(req.sourceSessionId) : null,
          tasksDone: done,
          tasksActive: active,
          tasksTotal: total,
          percentage: total > 0 ? Math.round((done / total) * 100) : 0,
          updatedAt: req.updatedAt,
        }
      })
      .sort((a, b) => {
        // FR-4（REQ-261004110201-f253）：优先级**首键**（大在前；缺省视作 0）——
        // 与 scanAndResume 同一份排序语义；其后的状态档位/更新时间是既有看板口径（保持不动）。
        const pa = (a as { priority?: number }).priority ?? 0
        const pb = (b as { priority?: number }).priority ?? 0
        if (pa !== pb) return pb - pa
        const ra = rank[a.status] ?? 99
        const rb = rank[b.status] ?? 99
        return ra !== rb ? ra - rb : b.updatedAt - a.updatedAt
      })
    ok(res, { requirements: summaries, total: summaries.length })
  }

  /**
   * GET /dashboard/api/reqboard/session/:sessionId/progress
   * 某会话关联的需求进度（会话顶部进度条数据源）。
   *
   * 锚点两级：① 需求 sourceSessionId（立项窗口）；② 任务执行记录 sessionId（接手窗口）。
   * 状态两级：① **进行中**需求优先（进度条主用途）；② 没有进行中的，回退到该会话
   * **最近关联过的需求**（含 done/archived，closed=true）——用户核心诉求是「agent 跑久了
   * 我总忘记之前做了什么」，会话结束后留一条「最近完成」锚点比什么都不显示有用得多。
   * 完全无关联 → { hasRequirement: false }（前端不渲染，零噪音）。
   */
  async function handleSessionProgress(res: ServerResponse, sessionId: string): Promise<void> {
    const ledger = await readAll()
    // 任务来自队列：全量一次（锚点扫描需要跨需求按 executions[].sessionId 反查）。
    const allTasks = await taskStore.listAll()

    // 该会话关联的全部需求 id（来源窗口 ∪ 任务执行会话）
    // 进行中判据取自 domain（此前这里引用未定义的 OPEN_STATUSES → 运行时 500）
    const isOpen = (s: string): boolean => isOpenRequirement({ status: s })
    const taskAnchoredIds = new Set<string>()
    for (const t of allTasks) {
      if (t.executions.some(e => e.sessionId === sessionId)) taskAnchoredIds.add(t.requirementId)
    }
    const anchored = ledger.requirements.filter(
      r => r.sourceSessionId === sessionId || taskAnchoredIds.has(r.id),
    )
    const byRecent = (a: RequirementRecord, b: RequirementRecord): number => b.updatedAt - a.updatedAt

    const target = anchored.filter(r => isOpen(r.status)).sort(byRecent)[0]
      ?? anchored.slice().sort(byRecent)[0]

    if (target === undefined) {
      ok(res, { hasRequirement: false, sessionId })
      return
    }

    const tasks = allTasks.filter(t => t.requirementId === target.id)
    // REQ-261005193546-1b1a FR-5（出口清单 ③）：会话流程面板的进度与任务行**只算活卡**。
    // 判据单点（`liveTasksOf`）；此处不新增「另有 N 张已取消」这类交代字段或文案（D-3 / D-7：彻底不可见）。
    const live = liveTasksOf(tasks)
    const done = countDoneTasks(live)
    const byStatus: Record<string, number> = {}
    for (const s of TASK_STATUS_ORDER) byStatus[s] = 0
    for (const t of live) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1

    // REQ-261004143941-b2ca FR-1：需求累计 token 与 nodes **同源**——只装配一次视图，两处读数共用。
    // 为什么强调同源：各算一次不仅浪费，还会给「总数 ≠ Σ各节点」留下漂移的口子；
    // 而「Σ节点」正是用户在流程图上能逐个加出来的数（对不上就是错）。
    // REQ-261005193546-1b1a 边界（**刻意不动**）：token 是**成本读数**（花了就是花了），不是
    // 「该完成的卡」的分母（FR-2 点名的是覆盖度 / 进度 / 甘特 / 详情计数 / 追溯）。且 `/progress`
    // 只把 token 转成**数字**下发（`nodes` = key + tokens），不带卡片身份 ⇒ 出参里不会出现取消卡。
    // 要连 token 一起剔，须与 `GET /requirements/:id/token` 端点同批改（那不在本卡四落点内）。
    const tokenView = assembleRequirementToken(target, { tasks })
    const tokenTotal = totalTokens(tokenView.totals)

    ok(res, {
      hasRequirement: true,
      sessionId,
      /** true = 该会话没有进行中需求，展示的是最近关联过的已完成需求 */
      closed: !isOpen(target.status),
      requirement: {
        id: target.id,
        title: target.title,
        description: target.description,
        status: target.status,
        category: target.category ?? null,
        // REQ-260923134706-e72f t3 / FR-2：立项弹框中的提示词难度透传给会话流程面板（老记录无字段 → null）
        promptDifficulty: target.promptDifficulty ?? null,
        blocked: target.blocked,
        paused: target.paused === true,
        sourceSessionId: target.sourceSessionId ?? null,
        updatedAt: target.updatedAt,
        // REQ-261004143941-b2ca FR-1：需求累计 Token（窄档流程图的常显读数）。
        // **缺失 ≠ 0**：无任何快照（合计 0）→ 不发该键，前端据此不渲染，而不是显示「🪙 0」
        // （补 0 会让「取不到」与「确实一次没花」在展示层无法区分）。
        ...(tokenTotal > 0 ? { tokenTotal } : {}),
      },
      progress: {
        total: live.length,
        done,
        active: countUnfinishedTasks(live),
        percentage: live.length > 0 ? Math.round((done / live.length) * 100) : 0,
        byStatus,
      },
      // 状态时间线（谁在什么时候推进到哪一步）——折叠展开后的「做了什么」主线
      timeline: (target.statusHistory ?? []).map(e => ({
        status: e.status, at: e.at, by: e.by, reason: e.reason ?? null, inferred: e.inferred === true,
      })),
      // REQ-a33899：每个流程节点的 token。口径与详情页一致：节点有快照用节点差值；
      // 节点无快照但任务执行有差值时用执行差值兜底——否则功能上线前创建的需求
      // 在会话顶部一个数字都不显示（用户实测反馈）。total=0 的节点不输出 tokens（避免一排 0）。
      // REQ-261004143941-b2ca FR-1：入参改为**已装配好的视图**（与上面的 tokenTotal 同一份）。
      nodes: nodeTokensOf(tokenView),
      // REQ-261005193546-1b1a FR-5：任务行同样只下发活卡（排序口径不动）。
      tasks: live
        .slice()
        .sort((a, b) => (TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status)) || (a.createdAt - b.createdAt))
        .map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          phase: t.phase,
          side: t.side,
          acceptance: t.acceptance,
          updatedAt: t.updatedAt,
          durationMs: t.executions.reduce((s, e) => s + Math.max(0, (e.endedAt ?? e.startedAt) - e.startedAt), 0),
          // REQ-260928185112-e20d P1：泳道要显示"每张父卡走到第几步"。父子关系与阶段**队列里本来就有**，
          // 此前手工挑字段时被丢掉 → 前端只能把父卡与子卡平铺在同一列，看不出进度。
          ...(t.parentId !== undefined ? { parentId: t.parentId } : {}),
          ...(t.stageKind !== undefined ? { stageKind: t.stageKind } : {}),
          ...(t.attempt !== undefined ? { attempt: t.attempt } : {}),
          // REQ-261007100513-6749 t1 / FR-6：预算覆盖值透传到会话流程面板的任务行
          //（手工挑字段的投影，漏一处就丢字段）。可选：缺省 = 键缺席（不冒充 0）。
          ...(t.budgetRequests !== undefined ? { budgetRequests: t.budgetRequests } : {}),
        })),
    })
  }

  /**
   * GET /dashboard/api/reqboard/requirements/:id/stage/:stage
   * 节点详情（REQ-31e11f t2）：模板装配器产出 StageDetail 判别联合（含产物与
   * 确认状态、分类跳过态、时间线切片）。需求不存在 → 404；stage 非法 → 400。
   * 薄适配：校验 → 读台账 → assembleStageDetail → ok。
   */
  async function handleStageDetail(res: ServerResponse, id: string, stageRaw: string, sessionId?: string): Promise<void> {
    // FR-11：本函数要读工作区文件（requirement.md 的 front-matter、RTM 追溯），故根也必须按会话取——
    // 否则修好一个门、另外两个门还在用插件宿主目录读，等于只修了一半。
    const docRoot = resolveDocRoot(deps, sessionId).root
    await syncReqArtifacts(ctx.requirementStore, id, docRoot).catch(() => { /* 扫描失败不阻断详情 */ })
    const stage = asStageKey(stageRaw) // 非法 → code=invalid_input → 400
    // REQ-2d1c74 FR-1/FR-2：host 侧读 requirement.md front-matter 注入设计文档策略（client 不碰 fs）
    const docs = new FileDocRepository({ workspaceRoot: docRoot })
    const target = await ctx.requirementStore.get(id)
    const policy = target === undefined ? undefined : await designDocPolicyOf(docs, target)
    // 任务来自队列（装配器保持同步：先 await 取队列任务，再以 { tasks } 传入）。
    // REQ-261005193546-1b1a FR-1 / FR-5（出口清单 ④）：只把**活卡**交给装配器——DAG 层级与详情计数
    // 都直接数这份投影；取消卡不进视图，也不构成依赖阻塞（判据单点在 domain `liveTasksOf`）。
    const tasks = liveTasksOf(await taskStore.listByRequirement(id))
    const detail = assembleStageDetail(await ctx.requirementStore.get(id), { tasks }, stage, { 
        ...(policy !== undefined ? { designDocPolicy: policy } : {}),
        // REQ-260926140539-457b FR-6：RTM 追溯数据必须读到工作区根。
        // FR-11（REQ-261003215944-9e04）：根改由 resolveDocRoot 按**会话**解析（本函数开头那个 docRoot），
        // 不再回落 process.cwd()——后者是插件宿主的落脚目录，RTM 与需求文档都不在那里。
        workspaceRoot: docRoot,
      })
    ok(res, detail)
  }

  /**
   * GET /dashboard/api/reqboard/requirements/:id/stages
   * 全流程一览（REQ-31e11f 节点详情重设计）：一次返回全部节点 StageDetail +
   * 当前节点，client 监控时间线一次渲染，免去逐节点点击加载。需求不存在 → 404。
   */
  async function handleStageOverview(res: ServerResponse, id: string, sessionId?: string): Promise<void> {
    // FR-11：同 handleStageDetail——读的是工作区文件，根按会话取（只修一半等于没修）。
    const docRoot = resolveDocRoot(deps, sessionId).root
    await syncReqArtifacts(ctx.requirementStore, id, docRoot).catch(() => { /* 扫描失败不阻断概览 */ })
    const docs = new FileDocRepository({ workspaceRoot: docRoot })
    const target = await ctx.requirementStore.get(id)
    const policy = target === undefined ? undefined : await designDocPolicyOf(docs, target)
    // 任务来自队列（同 handleStageDetail：装配器保持同步）。
    // REQ-261005193546-1b1a FR-1 / FR-5（出口清单 ④）：同款收敛——总览各节点的任务投影只含活卡。
    const tasks = liveTasksOf(await taskStore.listByRequirement(id))
    const overview = assembleStageOverview(await ctx.requirementStore.get(id), { tasks }, { 
        ...(policy !== undefined ? { designDocPolicy: policy } : {}),
        // REQ-260926140539-457b FR-6：RTM 追溯数据必须读到工作区根。
        // FR-11（REQ-261003215944-9e04）：根改由 resolveDocRoot 按**会话**解析（本函数开头那个 docRoot），
        // 不再回落 process.cwd()——后者是插件宿主的落脚目录，RTM 与需求文档都不在那里。
        workspaceRoot: docRoot,
      })
    ok(res, overview)
  }

  /**
   * GET /dashboard/api/reqboard/requirements/:id/token
   * 单需求的 token 去向（REQ-a33899）：byStage + 任务执行下钻；不存在 → 404。
   */
  /** 固定系统提示词成本：读时装配；服务不可得或装配抛错 → source=unavailable（不猜）。 */
  async function systemPromptCostOf(provider: (() => unknown) | undefined) {
    const svc = provider?.() as { assemble?: (ctx?: unknown) => Promise<unknown> } | undefined
    if (typeof svc?.assemble !== 'function') return unavailableSystemPromptCost()
    try {
      // turns 暂不可得（会话回合统计未接入本接口）→ 不猜累计，只给每回合成本
      return summarizeSystemPrompt(await svc.assemble(), 0)
    } catch {
      return unavailableSystemPromptCost()
    }
  }

  async function handleRequirementToken(res: ServerResponse, id: string): Promise<void> {
    const ledger = await readAll()
    const req = ledger.requirements.find(r => r.id === id)
    if (req === undefined) {
      throw Object.assign(new Error(fmt('需求 {id}不存在', { id })), { code: 'not_found' })
    }
    // 任务来自队列（token 投影是同步纯函数：先 await 取任务再传入）。
    const reqTasks = await taskStore.listByRequirement(id)
    const view = assembleRequirementToken(req, { tasks: reqTasks })
    // REQ-a33899 t5：提示词成本（读时装配，不落台账）
    view.systemPrompt = await systemPromptCostOf(deps.systemPrompt)
    const entries = deps.injectionLog !== undefined ? await deps.injectionLog.readAll().catch(() => []) : []
    const windows = injectionWindowsOf([
      req.sourceSessionId,
      req.reviewSessionId,
      ...reqTasks.flatMap(t => t.executions.map(e => e.sessionId)),
    ])
    const injections = summarizeInjections(entries, windows)
    const totals = totalTokens(view.totals)
    if (totals > 0) injections.sharePct = Math.round((injections.estTokens / totals) * 1000) / 10
    view.injections = injections
    // REQ-261004222448-292a t-497311 · FR-10：Token 端点的扩展段（每次调用均 / 缓存命中 /
    // 优化点 / 可得性三态）由 panels 路由在**同一响应**里合并——两处各算各的必然漂移
    // （「占比合计 == 总计」这条断言就没处落脚）。缺省不挂 → 老响应逐字不变。
    if (deps.panelTokenExtension !== undefined) {
      return await deps.panelTokenExtension(res, id, view)
    }
    ok(res, view)
  }

  /**
   * 每节点 token（REQ-a33899）：与详情页同口径——节点快照优先，缺失时用该节点任务执行差值兜底。
   * total=0 的节点只给 key（前端显示节点名，不显示 0）。
   *
   * REQ-261004143941-b2ca FR-1：入参从「需求 + 任务」改为**已装配好的 token 视图**——
   * 调用方（handleSessionProgress）要为 `requirement.tokenTotal` 装配同一份视图，
   * 若这里再装配一次，两处读数就有各自漂移的余地（「总数 ≠ Σ节点」）。
   */
  function nodeTokensOf(view: RequirementTokenView): Array<{ key: string; tokens?: { total: number } }> {
    return view.byStage.map((row) => {
      const total = row.buckets !== undefined
        ? totalTokens(row.buckets)
        : row.executions.reduce((n, e) => n + (e.delta !== undefined ? totalTokens(e.delta) : 0), 0)
      return total > 0 ? { key: row.stage, tokens: { total } } : { key: row.stage }
    })
  }

  /**
   * 需求侧接收标记（REQ-d3e61a T-5）：逐条功能点显示「谁接了 / 还没人接」。
   * 判据（条款清单 + 任务↔条款绑定）只存在于文档，client 拿不到，故必须服务端算。
   */
  async function handleRequirementMarks(res: ServerResponse, id: string, sessionId?: string): Promise<void> {
    const ledger = await readAll()
    const req = ledger.requirements.find(r => r.id === id)
    if (req === undefined) {
      throw Object.assign(new Error(fmt('需求 {id}不存在', { id })), { code: 'not_found' })
    }
    // 路由层的 deps 只有 cwd（无 docs 端口，且不许出现状态字面量——过滤下沉到 application 层）。
    // FR-11：它读的是**工作区里的文档**（需求文档 + 任务卡），根也必须按会话取，否则"谁接了哪条"
    // 在插件宿主目录下永远读不到，看板显示全未接。
    const docs = new FileDocRepository({ workspaceRoot: resolveDocRoot(deps, sessionId).root })
    // 任务来自队列（需求侧接收标记按条款绑定任务）。
    const reqTasks = await taskStore.listByRequirement(id)
    ok(res, await assembleRequirementMarks({ docs }, req, reqTasks))
  }

  return { handleState, handleArtifactScan, handleRequirementDetail, handleEvents, handleRequirementsSummary, handleSessionProgress, handleStageDetail, handleStageOverview, handleRequirementToken, handleRequirementMarks }
}
