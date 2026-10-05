// dsh-pmboard · 项目看板（RFC 014）
// host 半：reqboard JSON+SSE API（/dashboard/api/reqboard/*）+ 两级状态机台账 +
// 捕获（用户裁定 · 创建即立项）：确定性消息 hook（session/event user/message 到达 →
// 检查窗口 unbound 且无遗留 pending → 登记待捕获消息）+ systemPrompt 捕获引导段
// （命中待捕获则注入引用消息原文的立项提示，让 LLM 调 pm 专有立项弹框 reqboard_capture）。
// 三问弹框（需求名称 / 需求类型 / 提示词难度）作答 = 立项门；创建即立项，无
// 待归类/建议卡中间态。M2 的自动分类 LLM（SessionSyncService）自 2026-09 起不再装配
// （修正 #1/#3：无第二 LLM、人在 loop）。
// 模块形状与 dashboard-execution 一致（name + apply 具名导出）；无静态 inject 的
// 页面插件一律走 (ctx as any).inject(...) 惰性注入（genome/dashboard 同款模式）。

import { Context } from '@deepseek-ai/cordis';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveAddressInjection } from './adapters/TemplateRoot.js';
// REQ-261004103330-005f t5：装配期按设置选存储实现 + 系统记录装配（整条链在 wiring 里）。
import { assembleStorage } from './wiring/settings-assembly.js';
// REQ-261003191948-e94a t1/t4：迁移门是**只读预检**（不抛错），装配方据此分叉出"未就绪"态；
// REQ-261004103330-005f t5：预检已移入 wiring（`assembleStorage`），组合根只消费判别联合。
// 抛错版 assertLedgerMigrated 仍导出（工具/脚本用），不再出现在启动路径。
// 未就绪态的接线点（t4）：注册降级路由 + 双通道留痕，零数据面副作用。
import { enterNotReadyMode } from './wiring/not-ready.js';
import { JsonQueueRepository } from './repositories/QueueRepository.js';
import { QueueTaskStore } from './repositories/QueueTaskStore.js';
import { createReqboardHandler } from './http/routes.js';
// REQ-261003215944-9e04 t13：文档读根回滚开关（'legacy-cwd' = 一键回到改造前行为）
import { docsRootSourceSetting } from './plugin-config.js';
// REQ-261004111917-f473 FR-1：旧看板深链 /dashboard 的兼容入口（不再 404，把片段原样送回应用根）
import { registerLegacyBoardRoutes } from './http/legacy-board-route.js';
import { applyPickupReconcile, applyTaskRollup, type RollupContext } from './application/internal/rollup.js';
import { advanceRequirement } from './application/use-cases/AdvanceChain.js';
import { newCommentId } from './shared/protocol.js';
import { setBuildStamp } from './shared/build-stamp.js';
import { dshHomePath, nodeIsolationEnabled, type PluginConfig } from './plugin-config.js';
import * as os from 'node:os';
// REQ-261004103330-005f t6：阶段上限的权威来源改为运行设置（同步内存快照，热路径不 await）。
import { createCaptureRuntime, assembleDiveSessionDriver } from './wiring/pm-capture-root.js';
import {
  defineCreateTool,
  defineCaptureTool,
  defineStatusTool,
  defineTaskExecuteTool,
  defineAdvanceTool,
  defineTaskStatusTool,
  defineTaskRefsTool,
  // REQ-261004183621-de3f t3：归档清单补录工具
  defineArchiveAmendTool,
  defineTaskReportTool,
  defineDecomposeTool,
  defineSubmitTool,
  defineAskConfirmTool,
  defineConfirmReceiptTool,
  defineAcceptSheetTool,
  defineNoteInterruptionTool,
  defineClearPauseTool,
  // REQ-261003215944-9e04 FR-1：用 DSH 现成的会话 fork/create 开一个新窗口
  defineOpenWindowTool,
  // REQ-261003215944-9e04 FR-2：把另一个窗口派成 worker/observer 席位
  defineBindTool,
  defineMoveTool,
  defineTaskMoveTool,
  defineRunStatusTool,
  defineTaskTreeTool,
  defineTaskAdoptTool,
  defineRegenerateTool,
  defineKnowledgeTool,
  defineHandoffTool,
} from './tools/index.js';
import { FileDocRepository } from './adapters/FileDocRepository.js'
import { KnowledgeRepository } from './adapters/KnowledgeRepository.js'
// REQ-261004174324-4195 t4：知识层自举协调器（缺层时自动生成，每根一次）
import { KnowledgeBootstrap } from './application/internal/knowledge-bootstrap.js'
import { archiveGateSetting, knowledgeSettings, panelSettings } from './plugin-config.js'
import { InjectionLogFile } from './adapters/InjectionLogFile.js'
import { IsolationTraceFile } from './adapters/IsolationTraceFile.js'
import { NodeIsolationAdapter } from './adapters/NodeIsolationAdapter.js'
import { INJECTION_LOG_REL } from './application/internal/injection-log.js';
import { ISOLATION_TRACE_REL } from './application/internal/isolation-trace.js';
import { CAPTURE_DIAG_REL, captureDiag, initCaptureDiag } from './application/internal/diag-log.js';
import { CaptureRejectionFile } from './adapters/CaptureRejectionFile.js';
import { PendingConfirmRegistry } from './adapters/PendingConfirmRegistry.js';
import { CAPTURE_REJECTION_REL } from './application/internal/capture-rejections.js';
import { createNodeSettlementDispatcher } from './application/internal/node-settlement.js';
import { SystemClock } from './adapters/SystemClock.js';
import { RandomIdFactory } from './adapters/RandomIdFactory.js';
import { UserQuestionsAdapter } from './adapters/UserQuestionsAdapter.js';
import { GateAwareQuestions } from './adapters/GateAwareQuestions.js';
import { assembleGatePostChain, registerCaptureGuidance } from './gate-wiring.js';
import { SessionProbeAdapter } from './adapters/SessionProbeAdapter.js';
import { WorkflowEngineRunner } from './adapters/WorkflowEngineRunner.js';
// FR-11 路线 A：子卡实施段改走 DSH 原生 Agent Teams（ctx.agentTeams = TeamService）。
import { AgentTeamsAdapter } from './adapters/AgentTeamsAdapter.js';
// REQ-261003215944-9e04 FR-1（t4）：会话开窗端口实现（DSH 现成 fork/create）
import { SessionWindowOpener } from './adapters/SessionWindowOpener.js'
import { OsascriptStoragePathPicker } from './adapters/StoragePathPicker.js';
import { DshJobsAdapter } from './adapters/DshJobsAdapter.js';
import { createFailureAlert } from './adapters/FailureAlert.js';
import { scheduleStartupScan } from './application/internal/startup-scan.js';
import { migrateDiveState } from './application/internal/migrate-dive-state.js';
import type { UseCaseDeps } from './application/ports.js';
import ReqboardDiveManager from './application/dive/ReqboardDiveManager.js';
import { renderDiveRoundText } from './application/dive/round-state.js';
import type { DiveRoundPorts } from './application/dive/round-driver.js';
import { createProviderLatch } from './application/internal/provider-latch.js';
import { confirmGraceSetting } from './plugin-config.js';
import { stageRoutingSetting } from './plugin-config.js';
import { zeroOutputAlertThresholdSetting } from './plugin-config.js';
import { maxInFlightRequirementsSetting } from './plugin-config.js';
import { seatsMaxSetting, handoffSettings } from './plugin-config.js';
import { reconcileTerminalDive } from './application/internal/reconcile-terminal-dive.js';
import { humanGateOf } from './application/internal/human-gate.js';
import { checkChainBudget, DEFAULT_CHAIN_BUDGET_LIMITS } from './application/internal/chain-budget.js';

/**
 * 本插件**自发事件**的 cordis 事件表声明（纯类型，零运行时）。
 *
 * 为什么需要：下方存储订阅桥会 `ctx.emit('reqboard/requirement-moved', ...)`（订阅方在
 * `application/dive/round-subscriptions.ts`），但该事件名从未在 cordis 的 `Events` 里声明，
 * 故 `ctx.emit(...)` 命不中任何重载（TS2769）。cordis 的官方扩展点正是这里的接口合并
 * （其 README 的示例：「declare module ... { interface Events { ... } }」）。
 *
 * 放在插件入口（而非独立 .d.ts）是为了让它落在构建入口的 import 图里：`tsdown` 的 `dts: true`
 * 生成的 `dist/index.d.mts` 因而不丢这条声明——宿主/其他插件据此看到本插件发射的事件。
 */
declare module '@deepseek-ai/cordis' {
  interface Events {
    /** 需求状态发生迁移（store 订阅桥发射；Dive 的 roundDriver 据此判续跑）。 */
    'reqboard/requirement-moved'(payload: {
      requirementId: string
      /** 迁移前的状态（历史不足两条时取当前状态，与发射点一致） */
      from: string
      /** 迁移后的状态 */
      to: string
    }): void
  }
}

export const name = 'dsh-pmboard';

/** 台账文件名（DSH 主目录，卸载插件不删除）。 */
export const LEDGER_FILE = 'dsh-reqboard.json';

/**
 * v10 分片数据根（相对 dsh home）——t8 切换后台账的**唯一真相源**所在。
 *
 * `LEDGER_FILE` 的语义自 t8 起降级为「**legacy 导出文件名**」：只给迁移门与迁移/回滚脚本用
 * （design/interfaces.md §兼容与弃用）。
 */
export const REQBOARD_DATA_ROOT = 'reqboard';

/** 捕获引导段名（systemPrompt 全局唯一）与放置序位（identity 5 / genome 10-40 之后）。 */
export const CAPTURE_SECTION = 'reqboard:capture';
export const CAPTURE_SECTION_ORDER = 60;

// 兼容再导出（REQ-260924213231-b1c4 T-12）：既有 import { dshHomePath | nodeIsolationEnabled }
// 仍从 './index.js' 可用（实现在 ./plugin-config.ts），行为不变。
export { dshHomePath, nodeIsolationEnabled };

/**
 * 轮次边界判定（隔离纪律③「只在轮次边界执行」）：用 sessionProjections 的 turnBoundary
 * 投影——openTurnStartSeq 为 null 即"无 open turn"＝ agent 空闲，可安全做 surface 整段替换。
 * 投影/服务不可得（无 agent-loop、测试环境）或探测抛错 → 判不出，**保守返回 false**
 * （不替换 + 留痕 skipped/agent_busy）——活动轮次替换会被框架硬拒（D-15），
 * 宁可跳过也不猜（响亮失败优于静默猜测）。
 */
function turnBoundaryIdle(projectionsSvc: unknown, session: unknown): boolean {
  return turnBoundaryIdleState(projectionsSvc, session) === 'idle';
}

/**
 * 轮次边界**三态**判定（2026-09-26）——给闸门链的"无 open turn"门用。
 *
 * 与 turnBoundaryIdle 同源，但把"判不出"和"明确忙"分开：
 *   idle    = openTurnStartSeq === null（无 open turn，可安全做 surface 替换与唤醒）
 *   busy    = 有 open turn（活动轮次：替换会被硬拒 D-15；唤醒会与 LLM 打架；H2 会 skip）
 *   unknown = 投影/服务不可得（无 agent-loop、测试环境、看板通道无 session）或探测抛错
 *
 * 为什么必须分开：H2 的口径是"判不出就跳过"（保守），而**链**不能这样——
 * 看板确认通道与测试环境都判不出，拿 false 当整链门会把它们全堵死。
 * 所以链只在**明确 busy** 时延后（且不消费待处理闸门，留给下个边界重试）。
 */
function turnBoundaryIdleState(projectionsSvc: unknown, session: unknown): 'idle' | 'busy' | 'unknown' {
  const projections = projectionsSvc as {
    stateOf?: (s: unknown, kind: string) => { openTurnStartSeq?: unknown } | undefined
  } | undefined;
  if (typeof projections?.stateOf !== 'function') return 'unknown';
  if (session === undefined || session === null) return 'unknown';
  try {
    const boundary = projections.stateOf(session, 'turnBoundary');
    if (boundary === undefined) return 'unknown';
    return boundary.openTurnStartSeq === null ? 'idle' : 'busy';
  } catch {
    return 'unknown';
  }
}

export function apply(ctx: Context, config?: PluginConfig): void {
  // 【REQ-f6307c T3】文件化诊断通道初始化（stdout 可能进死管道，文件才是可靠观测面）
  initCaptureDiag(dshHomePath(config, CAPTURE_DIAG_REL));
  captureDiag('reqboard-capture [EARLY]: apply function STARTED');
  const logger = ctx.logger(name);
  logger.info('reqboard-capture [EARLY]: apply function STARTED');
  // REQ-261003222428-3556 FR-3：构建指纹盖章——「我在跑哪份构建」随时可查
  // （陈旧构建曾两次让已修缺陷表现为线上事故：capture 弹框契约 / auto_confirm 契约）。
  // 指纹 = sha256(本产物文件)[0:12]，与客户端构建戳同口径；读不到产物文件时诚实不盖章。
  try {
    const selfFile = fileURLToPath(import.meta.url);
    const stamp = createHash('sha256').update(readFileSync(selfFile)).digest('hex').slice(0, 12);
    setBuildStamp(stamp);
    captureDiag('reqboard-build [STAMP]: plugin_build=' + stamp + ' file=' + selfFile);
    logger.info('reqboard plugin_build=' + stamp);
  } catch (err) {
    logger.warn('reqboard 构建指纹计算失败（不盖章）：' + (err instanceof Error ? err.message : String(err)));
  }
  const now = () => Date.now()
  // ── t8 运行时切换（REQ-261002161439-277d）：单册 → 分片 ──────────────────────
  // 数据根与 legacy 单册路径（后者只给迁移门/脚本用）。
  const dataRoot = dshHomePath(config, REQBOARD_DATA_ROOT);
  const legacyLedgerFile = dshHomePath(config, LEDGER_FILE);
  // 迁移门（验收④）：**单册在场而数据根未迁移 → 拒绝服务**。
  // 绝不静默起一个空台账——那正是"600 条任务消失"那类事故的成因（见 migrationGate.ts 头注）。
  //
  // REQ-261003191948-e94a t4 / FR-1：这里由"裸断言"改成**三相启动**的分叉点——
  //   · ok        → 相 1「正常」：装配照旧（逐字节不变）；
  //   · !ok       → 相 2「未就绪」：注册只回 503 的降级路由后 **return（不抛）**，
  //                 因为 apply 一抛，fiber 失败、其 effect 全被 dispose，连一条能说明原因的路由
  //                 都留不下（2026-10-03 事故：整条路由消失，界面只剩 404）。
  // 只覆盖迁移门这两种失败：ok:false 时 failure.code 是字面量联合，别的装配异常照旧冒泡。
  //
  // ── 运行设置 + 存储装配（REQ-261004103330-005f FR-1/2/6/14/17；t6 三路刷新 + t5 选后端）──
  // 顺序有语义：**设置决定后端 → 后端决定迁移门判据 → 门过了才选实现**，故整条链收在 wiring 一处
  // （`assembleStorage`），组合根只做"过了就继续、没过就进未就绪态"的分叉。
  const settingsHome = config?.dshHome ?? process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  // 命名沿用 `preflight`：A7 的静态判据锚定这个标识符（分叉只看判别联合的 ok，不散落错误码）。
  // 它现在承载的不只是预检，还包含"门过了才选实现 / 建档"——**失败路径上不会构造任何存储**。
  const preflight = assembleStorage({
    config,
    dshHome: settingsHome,
    dataRoot,
    legacyLedger: legacyLedgerFile,
    moduleDir: path.dirname(fileURLToPath(import.meta.url)),
    now,
    warn: (message) => logger.warn('reqboard ' + message),
    info: (message) => logger.info('reqboard ' + message),
  });
  if (!preflight.ok) {
    enterNotReadyMode(ctx, preflight.failure, logger);
    return;
  }
  const { store, settingsStore, systemRecord, pluginInfo } = preflight;
  // 分诊记录：新端口**没有** triage 读 API（notes/known-defects.md §10.1），故过渡期由组合根
  // 从 `meta.json` 代读，**不裸 cast**（按形状过滤）。人工已裁定该锚点路径退场，B12 删桥时一并消失。
  // B12 阶段⑤：临时桥**已删除**——195 处调用点全部迁到 `store`（新端口），旧实现文件也已删。
  // 急加载：fresh boot 时让首个 GET /state 见到台账而非空板。
  // 未就绪期间 HTTP 走 503（`REQBOARD_BRIDGE_NOT_READY` → routes.fail 的映射），**绝不返回空册**。
  void store.headAfterDrain().catch((err: unknown) => {
    logger.error('reqboard: 台账就绪失败（未就绪期间 HTTP 返回 503）:', err);
  });
  // 工作区根（**唯一事实源**）：队列文件（docs/requirements/<REQ>/queue.json）与文档仓储必须同根，
  // 否则会把队列写到 A 根、文档读到 B 根（看板空白的静默故障）。故此处显式定义一次并共用。
  const workspaceRoot = process.cwd();
  // 任务存储（队列，REQ-260927202051-f6df / design I-1）：**任务唯一存储**。
  // schema v9 后台账已无 tasks —— 缺这个实例，看板任务页/甘特与全部任务工具都会失败。
  const queueRepo = new JsonQueueRepository({ workspaceRoot });
  const taskStore = new QueueTaskStore({ repo: queueRepo, now, onWarn: (message) => logger.warn(message) });

  // Dive 服务实例化已下移到 createCaptureRuntime 之后（T-5：round 半的投递端口 = deliverer）。
  
  // 桥接**分片存储**订阅到 Cordis 事件系统（优化：支持 Dive 事件驱动续跑）。
  // t8 切换点：新端口的帧只有 {kind, requirementId, revision, summary}——**没有 requirements 数组、
  // 没有 statusHistory**（旧 LedgerChange 形状随单册端口一起退场），故 from→to 的推断要多做一次权威读。
  store.subscribe((change) => {
    if (change.kind !== 'requirement-moved') return
    void (async () => {
      try {
        const req = await store.get(change.requirementId)
        if (req === undefined) return
        const history = req.statusHistory ?? []
        const lastTwo = history.slice(-2)
        const from = lastTwo.length >= 2 ? lastTwo[0].status : req.status
        const to = req.status
        ctx.emit('reqboard/requirement-moved', { requirementId: req.id, from, to })
      } catch (err: unknown) {
        logger.warn('reqboard: requirement-moved 事件桥读需求失败:', err)
      }
    })()
  })
  logger.info('Store subscription bridge initialized (Cordis events from store store)')
  
  // 注入留痕（REQ-422af1 t6，INV-6）：<dshHome>/state/prompt-injection-log.json（ring buffer 500 条，原子写）。
  const injectionLog = new InjectionLogFile(
    dshHomePath(config, INJECTION_LOG_REL),
    now,
    (err) => logger.warn('reqboard 注入留痕写入失败:', err),
  );

  // 启动对账（R0 + R2）：让升级前积压的 draft 需求立刻进入评审，并结算已完成的需求。
  void store
    .headAfterDrain()
    .then(async () => {
      // 队列任务必须在 mutate 回调**外**先取：repo.mutate 的回调是**同步契约**（回调内不能 await）。
      // 必须取**全量**（listAll）而非单需求：`applyTaskRollup` 此处未传 onlyReqId ⇒ planRollup 会评估
      // **每一个**需求（R2：该需求全部未取消任务 done → accepting）。若只喂一个需求的任务，其余需求
      // 在视图里就成"零任务"，会被误判/漏判。旧代码的 `LedgerView.tasks` 正是全量，故以 listAll 对齐语义。
      const allTasks = await taskStore.listAll();
      // B12 阶段⑤：启动对账改走新端口的 **sweep**（端口注释写明"仅启动对账可用"）。
      // 两个旧 helper 仍吃"册形视图"，故在**调用点**用 drafts 现搭一个（调用点适配，本会话第 5 次应用）；
      // 它们随桥一起删除时会一并换成 `planRollup` + 逐条 `mutate`。
      const triages = await store.listTriages();
      const swept = await store.sweep('startup-reconcile', (drafts) => {
        // 启动对账（R0/R2）**无会话上下文**：ctx 明确**不传 snapshot**（REQ-260927121324-abde FR-6）——
        // 无会话却写快照即编造 token 归属；缺失如实留空，读路径按 degraded 显示（缺失 ≠ 0）。
        const ctx: RollupContext = { now: now(), commentId: () => newCommentId() };
        const view = { revision: 0, requirements: drafts, triages } as never;
        // applyPickupReconcile 走 pickup 路径（不读 tasks）；applyTaskRollup 需全量队列任务（第 2 参）。
        const advanced = [...applyPickupReconcile(view, ctx), ...applyTaskRollup(view, allTasks, ctx)];
        return advanced.map((r) => r.id);
      });
      const touchedIds = swept.touched;
      if (touchedIds.length > 0) {
        logger.info(
          `reqboard 启动对账：${touchedIds.length} 条需求自动推进（${touchedIds.join(', ')}）`,
        );
      }
    })
    .catch((err) => logger.warn('reqboard 启动对账失败（不影响服务）:', err));

  // 乙流程依赖的运行时服务（惰性获取，未就绪/缺失时相关能力降级放行）：
  //   agents             → requireLiveDriver（服务可得则校验 live driver，缺失放行）
  //   sessionProjections → requireDirectHuman（扫描 user 消息 / 执行窗口状态，缺失放行）
  let agentsSvc: unknown;
  let projectionsSvc: unknown;
  // REQ-261004154937-2ca3：血缘聚合用的两个服务（枚举 header + 同步读单会话用量）。
  // 与 sessionProjections 同款：**声明式注入**，绝不直接读 ctx 属性（未声明访问会抛，本仓踩过）。
  let persistenceSvc: unknown;
  let projectionCacheSvc: unknown;
  let userQuestionsSvc: unknown;
  /** REQ-a33899 t5：系统提示词装配服务（读时折算固定提示词成本）。 */
  let systemPromptSvc: unknown;
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['userQuestions'],
    (uqCtx: { userQuestions?: unknown } | undefined) => {
      userQuestionsSvc = uqCtx?.userQuestions;
      if (userQuestionsSvc !== undefined) {
        logger.debug('userQuestions service ready (reqboard_ask_confirm 弹框通道可用)');
      }
    },
  );
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['agents'],
    (agentsCtx: { agents?: unknown }) => {
      agentsSvc = agentsCtx.agents;
      logger.debug('agents service ready (reqboard tools live-driver check enabled)');
    },
  );
  // REQ-4842fe t4：子卡执行引擎（workflow-worker-thread provider，已在位）。缺失时
  // runner 返回 engine_unavailable → 子卡显式失败，不静默成功。
  let workflowEngineSvc: unknown;
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['workflowEngine'],
    (wfCtx: { workflowEngine?: unknown }) => {
      workflowEngineSvc = wfCtx?.workflowEngine;
      logger.debug(workflowEngineSvc === undefined
        ? 'workflowEngine service 不可用（子卡执行将显式失败）'
        : 'workflowEngine service ready (reqboard_task_run 子卡执行可用)');
    },
  );
  /**
   * 引擎可达性探针（REQ-261003191948-e94a §5.2）：把"这个上下文到底看得见什么"写成一行。
   *
   * ⚠️ **绝不读 `ctx.workflowEngine` 属性**：cordis 对未声明 inject 的服务做属性访问会**抛异常**
   * （实测 `cannot get property "workflowEngine" without inject`），那会把 runner 本来优雅的
   * `engine_unavailable` 变成 run 异常——探针绝不能反过来制造故障。只用 `ctx.get(name)`
   * （可选读取，未注册即 undefined）与 `typeof`，并整体 try/catch 兜底。
   *
   * 已定性的结论（配置级证据，见 evidence §5.2）：DSH 的 agent preset 用
   * `isolate: { workflowEngine: true }` 把引擎**刻意隔离**在 delegation 组内，
   * 故 profile 级插件按设计取不到它——不是取法问题。
   */
  const describeEngineAccess = (): string => {
    try {
      const c = ctx as unknown as { inject?: unknown; get?: unknown };
      const get = typeof c.get === 'function' ? (c.get as (name: string) => unknown) : undefined;
      const probe = (name: string): string => (get === undefined ? 'no-get' : String(get(name) !== undefined));
      return 'inject=' + typeof c.inject + ' get=' + typeof c.get
        + ' byGet=' + probe('workflowEngine')
        + ' captured=' + String(workflowEngineSvc !== undefined)
        // 对照组：这三个 pmboard **确实**能注入（工具/路由/agent 都在跑）。
        // byGet(workflowEngine)=false 而它们为 true ⇒ 不是取法不对，而是作用域隔离。
        + ' [tools=' + probe('tools') + ' agents=' + probe('agents') + ' webServer=' + probe('webServer') + ']';
    } catch (err) {
      return 'probe_failed=' + String(err);
    }
  };
  /**
   * 子卡执行引擎的**实时解析**（REQ-261003191948-e94a）。
   *
   * 为什么不能只用上面那个闭包变量：2026-10-03 实测（含重启后的新进程）子卡链每一次都停在
   * `engine_unavailable`，而**同一进程里** `workflow` 工具能正常起 run —— 即服务在位，
   * 只是 `inject(['workflowEngine'])` 的回调没有把它送进 `workflowEngineSvc`。
   * 捕获式接线把"服务是否可得"绑死在装配那一瞬，时序一变就静默退化。
   *
   * 故这里改为**调用时**经 `ctx.get` 实时解析（宿主 Service 目录给出的官方可选读取写法就是
   * `ctx.get("workflowEngine")` + requiresUndefinedCheck）；捕获变量仅作兜底。
   * 取不到仍然返回 undefined → runner 照旧响亮地报 engine_unavailable（不静默成功）。
   */
  const resolveWorkflowEngine = (): unknown => {
    const live = (ctx as unknown as { get?: (name: string) => unknown }).get?.('workflowEngine');
    const resolved = live ?? workflowEngineSvc;
    if (resolved === undefined) {
      captureDiag('reqboard-capture [ENGINE-PROBE]: 引擎取不到 → ' + describeEngineAccess());
    }
    return resolved;
  };
  // FR-11 路线 A（REQ-260926140539-457b）：DSH 原生 Agent Teams 服务（experimental）。
  // 缺失时 adapter.available()=false → 用例层退回 workflow 兼容路径，绝不静默成功。
  let agentTeamsSvc: unknown;
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['agentTeams'],
    (teamCtx: { agentTeams?: unknown }) => {
      agentTeamsSvc = teamCtx?.agentTeams;
      logger.debug(agentTeamsSvc === undefined
        ? 'agentTeams service 不可用（子卡执行走 workflow 兼容路径）'
        : 'agentTeams service ready（子卡实施段团队执行可用）');
    },
  );
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['sessionProjections'],
    (spCtx: { sessionProjections?: unknown }) => {
      projectionsSvc = spCtx.sessionProjections;
      logger.debug('sessionProjections service ready (reqboard tools direct-human check enabled)');
    },
  );
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['sessionPersistence', 'sessionProjectionCache'],
    // 参数可空：宿主/装配桩对未装配的服务可能回传 undefined（实测：装配冒烟桩会这样），
    // 这里必须容错——**服务缺失是常态降级路径**，不是异常。
    (lsCtx?: { sessionPersistence?: unknown; sessionProjectionCache?: unknown } | undefined) => {
      persistenceSvc = lsCtx?.sessionPersistence;
      projectionCacheSvc = lsCtx?.sessionProjectionCache;
      logger.debug(persistenceSvc === undefined || projectionCacheSvc === undefined
        ? '血缘服务不全（token 读数退回只算本窗口会话，快照标 descendants-unavailable）'
        : '血缘服务 ready（token 读数含后代子代理会话）');
    },
  );
  // REQ-261003215944-9e04 FR-1（t4）：会话开窗服务（DSH 现成能力）——reqboard_open_window 据此
  // 建新会话。与 workflowEngine 同理：服务按调用时解析（惰性注入的回调未必在装配期送达），
  // 缺失时用例层返回 REQBOARD_OPEN_WINDOW_UNAVAILABLE，**不伪造窗口码**。
  // ⚠️ 绝不读 ctx.sessionController 属性（未声明 inject 的属性访问会抛），只用回调送进来的值。
  // REQ-261003215944-9e04 FR-11（t12）：会话工作区解析——路由的读根改为**发起阅读的会话工作区**。
  // 只需读 header.cwd（DSH 保证它是绝对路径），故只用 sessions 的 get；缺省 → 路由回落 legacy cwd。
  let sessionsSvc: unknown;
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['sessions'],
    (ssCtx: { sessions?: unknown }) => {
      sessionsSvc = ssCtx?.sessions;
      logger.debug(sessionsSvc === undefined
        ? 'sessions service 不可用（文档读根将回落 legacy cwd，并在响应里标注）'
        : 'sessions service ready（文档读根按会话工作区解析）');
    },
  );
  let sessionControllerSvc: unknown;
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['sessionController'],
    (scCtx: { sessionController?: unknown }) => {
      sessionControllerSvc = scCtx?.sessionController;
      logger.debug(sessionControllerSvc === undefined
        ? 'sessionController service 不可用（reqboard_open_window 将响亮失败）'
        : 'sessionController service ready（reqboard_open_window 可用）');
    },
  );
  // REQ-261004150249-731e FR-1（t-46d0d7）：workspace 注册表惰性解析——与 sessionController 同款按调用时现取；绝不读 ctx.workspaceRegistry 属性，只用回调送进来的值。
  let workspaceRegistrySvc: unknown;
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(['workspaceRegistry'], (wsCtx: { workspaceRegistry?: unknown }) => {
    workspaceRegistrySvc = wsCtx?.workspaceRegistry;
    logger.debug(workspaceRegistrySvc === undefined ? 'workspaceRegistry 不可用（开窗回落源会话 cwd）' : 'workspaceRegistry ready（开窗按项目落点）');
  });

  // ── 节点结算 → 隔离执行分发（REQ-422af1 t10，默认关）───────────────────────
  // 开关优先级：config.nodeIsolation > env NODE_ISOLATION > 默认 false。关时隔离代码路径
  // 执行 0 次。两个端口的唯一 I/O 实现都在 adapters（application 层禁 import @deepseek-ai/*）：
  //   isolation → NodeIsolationAdapter（surface 原语 + tool 配对边界检查，t9）
  //   trace     → IsolationTraceFile（state/node-isolation-log.json，ring buffer 原子写）
  const nodeIsolation = nodeIsolationEnabled(config);
  // REQ-260922213356-4a45 T-3：模板地址注入——绝对模板根（配置优先，否则包根 ../templates）+ 开关。
  const address = resolveAddressInjection(config, path.dirname(fileURLToPath(import.meta.url)), (m) => logger.warn(m));
  const docs = new FileDocRepository({ workspaceRoot });
  // REQ-261004174324-4195 t4：知识层自举协调器（每根一次、失败不重试）。
  // 开关 = knowledge.enabled 且 knowledge.autoBootstrap（后者非布尔在 knowledgeSettings 里装配期抛错）。
  const kbSettings = knowledgeSettings(config);
  const knowledgeBootstrap = new KnowledgeBootstrap({
    docs,
    // 目标根 ≠ 当前读根时必须换根绑定仓储：否则「按会话根自举」会把知识层写到插件宿主目录。
    docsFor: (root) => new FileDocRepository({ workspaceRoot: root }),
    enabled: kbSettings.enabled && kbSettings.autoBootstrap,
    log: (m) => logger.warn(m),
  });
  // 通知点 ①（激活）：**仅 legacy-cwd 读根**时 cwd 才真的是项目根。
  // session 模式下这里拿到的是插件宿主目录（实测 ~/.dsh/profiles/<profile>）——往里写 docs/knowledge
  // 就是把知识层生成到人家 profile 里，必须不触发（等 ② 用例校正 / ③ 看板按会话解析根时再动手）。
  if (docsRootSourceSetting(config) === 'legacy-cwd') knowledgeBootstrap.ensure(docs.workspaceRoot());
  const clock = new SystemClock();
  // REQ-260924213231-b1c4 T-6（FR-3）：挂起确认注册表（内存 ticket → 状态）——弹框超宽限时
  // 登记 ticket，人作答后由后台落章并回填，agent 用 reqboard_confirm_receipt 取回执。
  const pendingConfirms = new PendingConfirmRegistry();
  const isolationTrace = new IsolationTraceFile(
    dshHomePath(config, ISOLATION_TRACE_REL),
    (err) => logger.warn('reqboard 隔离留痕写入失败（只告警，不影响流水线）:', err),
  );
  // REQ-260922012924-2e29 FR-5：立项拒绝留痕（state/capture-rejections.json，ring buffer 原子写）。
  const captureRejections = new CaptureRejectionFile(
    dshHomePath(config, CAPTURE_REJECTION_REL),
    (err) => logger.warn('reqboard 立项拒绝留痕写入失败（只告警，不影响立项路径）:', err),
  );
  // t7（FR-8）：余量参考（`SessionProbe.contextPressure`）的**唯一适配器实例**。它依赖下面才构造的
  // 会话缓冲表（toolTrace / recentUserMsgs）⇒ 节点结算与闸门链（都在本行之后装配）只能收到
  // 惰性 getter `() => sessionProbe`，读实例的时机 = 各自的执行期（那时下面的赋值早已完成）。
  // 读不到（含尚未赋值）→ 输入包不追加「一轮余量（参考）」节，与本改动前逐字节相同。
  let sessionProbe: SessionProbeAdapter | undefined;
  const settlement = createNodeSettlementDispatcher({
    enabled: nodeIsolation,
    // 任务队列端口（REQ-260927202051-f6df）：节点隔离取"当前在制任务卡"经它（v9 台账无 tasks）。
    taskStore,
    // t7（FR-8）：余量参考端口（惰性取——实例在下面才构造）。
    sessionProbe: () => sessionProbe,
    isolationFor: (session, _settle) => new NodeIsolationAdapter(session, {
      idle: () => turnBoundaryIdle(projectionsSvc, session),
      plugin: name,
    }),
    trace: isolationTrace,
    docs,
    clock,
    address,
    // 纪律①「先落盘再遗弃」：先把写队列排空再取持久化 revision，即 revision = "已落盘"证据指针。
    // ⚠️ 本处曾是 t8 阶段的**人工裁定例外**（notes/t8-progress.md §10.3-② 保留桥的 snapshot）。
    // B12 阶段①-a 重新裁定（裁决 I1，见设计文档 §20.1）：分片写入器本身就有串行队列 ⇒
    // 用 `headAfterDrain()`（排空后读 head）**保住同一条排序保证**，而不是照设计直接 `head()`
    // （那会读到一个可能尚未落盘的 revision）。
    persistArtifacts: async () => (await store.headAfterDrain()).revision,
    warn: (message) => logger.warn(message),
  });
  logger.info(
    nodeIsolation
      ? 'reqboard 节点隔离已开启（NODE_ISOLATION）：节点结算点经 setImmediate 异步边界执行 surface 整段替换'
      : 'reqboard 节点隔离关闭（默认）：结算点只发信号，隔离代码路径执行 0 次',
  );

  const disposers: Array<() => void> = [];

  // 捕获根运行时（REQ-260924213231-b1c4 T-12：三张共享表 + 唯一投递实现抽到
  // ./wiring/pm-capture-root.js，组合根只留装配顺序；driver 装配见下方 assembleDiveSessionDriver）。
  const { pendingCapture, toolTrace, recentUserMsgs, deliverer } = createCaptureRuntime({
    plugin: name,
    getAgents: () => agentsSvc,
    // REQ-261001201200-8f8b FR-1：显式注入消息 id 工厂（投递器三参构造的第二位）。
    idFactory: () => newCommentId(),
    // REQ-261003215944-9e04 FR-7（t5）：冷会话 resume + 投递后落盘确认。
    // 服务按调用时解析（惰性注入的回调未必在装配期送达）；缺省时投递器如实报"冷窗口投不到"。
    getSessionController: () => sessionControllerSvc,
    // FR-9（REQ-261004222448-292a t-cc7233）：轮次投递（唯一真进会话的路径）也留痕。
    injectionLog,
    flushSession: (agent: unknown) => {
      try {
        const svc = sessionsSvc as { flush?: (session: unknown) => Promise<boolean> | boolean } | undefined;
        const session = (agent as { session?: unknown } | undefined)?.session;
        return typeof svc?.flush === 'function' && session !== undefined ? svc.flush(session) : true;
      } catch (err) {
        logger.warn('reqboard: 投递后会话落盘确认失败:', err);
        return false;
      }
    },
  });

  // ── Dive 服务（REQ-260926215013-1568 T-5）：订阅持有者 + round 端口提供者 ──────────
  // 必须在 createCaptureRuntime 之后（round 半的投递端口 = deliverer）；agentsSvc 经闭包惰性读取。
  //
  // REQ-261004065652-5c1c FR-1：全局上游闩**每进程一个**（插件实例级），round 半与心跳共用同一个，
  // 这样"一处撞额度 → 全体停手"才成立；人的恢复不必显式 clear：台账变回可驱动后
  // round-driver.latchBlocks 会自动解锁（TTL 只是兜底，防"闩永远关着"）。
  const providerLatch = createProviderLatch({ now });
  const diveRoundPorts: DiveRoundPorts = {
    // t8/B11：把需求存储新端口下传给 dive（B12 起读写都走它）
    store: store,
    // t8/B12 阶段①-a：idle 拍的**同步**判定（该不该驱动）走窄投影，不再借桥的整册快照。
    peekFacts: () => store.peekFacts(),
    delivery: deliverer,
    // ★ REQ-261001201200-8f8b FR-1：round 半的**投递端口**必须在这里接上。
    // 修前本对象缺 delivery——drive() 第一步就是 ports.delivery.createRoundMessage(...)，
    // 于是抛 "Cannot read properties of undefined"，被 requestDrive 吞掉 → disarm → 静默停摆。
    // 这与「投递器构造参数错位」是同一症状的**第二处断点**（都在同一条唤醒链的装配面上）：
    // 只修其中任一处都不够——两处都接上，链条才真正通。
    agents: {
      get: (id: string) => (agentsSvc as { get?: (id: string) => unknown } | undefined)?.get?.(id),
      withoutInitiator: <T,>(op: () => T): T => {
        const a = agentsSvc as { withoutInitiator?: <U>(f: () => U) => U } | undefined
        return typeof a?.withoutInitiator === 'function' ? a.withoutInitiator(op) : op()
      },
    },
    // 插件 fiber 处于 ACTIVE(2) 才算可驱动；读不到（测试/降级）→ 放行，避免静默停摆。
    fiberActive: () => {
      const state = (ctx as unknown as { fiber?: { state?: number } }).fiber?.state
      return state === undefined ? true : state === 2
    },
    cancel: (agent, cause) => (agent as { cancel?: (c: string) => void } | undefined)?.cancel?.(cause),
    whenIdle: (agent) => {
      const p = (agent as { whenIdle?: () => Promise<void> } | undefined)?.whenIdle?.()
      return p === undefined ? Promise.resolve() : p
    },
    // FR-3 耐久检查点：兑现台账写队列排空（与 persistArtifacts 同口径）。
    // B12 阶段⑤：写屏障语义 = 等已落盘 ⇒ 新端口的 headAfterDrain()（端口注释即此用途）
    checkpoint: async () => { await store.headAfterDrain() },
    renderRoundText: renderDiveRoundText,
    now,
    logger: { info: (m) => logger.info(m), debug: (m) => logger.debug(m), warn: (m, e) => logger.warn(m, e) },
    // 🆕 任务存储（用于实施阶段中断自动恢复检测）
    taskStore: taskStore as unknown as { listByRequirement(requirementId: string): Promise<Array<{ status: string }>> },
    // REQ-261002141430-a5ef FR-1：弹框在途判据（同步内存读）——供起轮前"有人在等吗"这一问。
    dialogInFlight: (requirementId: string) => pendingConfirms.inFlightFor(requirementId),
    // REQ-261004065652-5c1c FR-1：进程级上游闩。**一个窗口撞上额度/鉴权错误 → 所有窗口一起停**——
    // 实测两个窗口共享同一份 provider 额度、同刻阵亡（18:03:45 / 18:03:52），只停自己救不了第二个。
    // TTL 5 小时（额度窗口量级）；人的恢复（看板「继续」/确认推进）会把台账变回可驱动，
    // 驱动侧的内存闭锁据此自动解除（见 round-driver.latchBlocks 的唯一解锁规则）。
    providerLatch,
    // REQ-261004065652-5c1c FR-5：台账态的人工门判据（验收单待裁决 / 产物待确认 / 计划待批准）。
    // 为什么读**整条记录**而不是窄投影：`plan.approvedAt` 与 `verification.sheet` 不在同步投影里，
    // 而这两项恰恰是"等人裁决"的两大来源；只在**即将起轮**时读一次，频率可接受。
    humanGate: async (requirementId: string) => humanGateOf(await store.get(requirementId)),
    // REQ-261004065652-5c1c FR-11：起链预算闸（WIP 上限 3 / cacheRead 5 亿，见 chain-budget 的缺省）。
    // 判据读**同步窄投影**：t2 修好后它读己所写，故 WIP 计数不会滞后于刚刚落库的链。
    chainBudget: (candidateId: string) => checkChainBudget({
      facts: store.peekFacts(),
      candidateId,
      limits: DEFAULT_CHAIN_BUDGET_LIMITS,
    }),
  }
  const diveManager = new ReqboardDiveManager(ctx, diveRoundPorts)
  logger.info('ReqboardDiveManager initialized (round 半已接线)')
  disposers.push(() => { void diveManager.teardown() })

  // 闸门后置链装配（REQ-e3b6a0）：抽到 ./gate-wiring.js（REQ-f0579a t5 尺寸门禁）。
  const gateChain = assembleGatePostChain({
    requirementStore: store,
    docs, clock, now, isolationTrace, injectionLog, deliverer, logger, plugin: name,
    // 任务队列端口（REQ-260927202051-f6df）：H2 压缩的节点隔离取"当前在制任务卡"经它。
    taskStore,
    compactionEnabled: nodeIsolationEnabled(config),
    // t7（FR-8）：余量参考端口（惰性取——实例在下面才构造），由链转交 H2 压缩的输入包。
    sessionProbe: () => sessionProbe,
    idle: (session: unknown) => turnBoundaryIdle(projectionsSvc, session),
    // 三态门（2026-09-26）：明确 busy → 链延后且不消费待处理闸门（修"静默丢压缩"）
    idleState: (session: unknown) => turnBoundaryIdleState(projectionsSvc, session),
    address,
  });

  // Dive 会话驱动器装配（原 CaptureHook，2026-09-26 废弃并迁入 application/dive）：
  // 抽到 ./wiring/pm-capture-root.js；**两路订阅都由 Dive 服务持有**：
  //   · session/event（采集/簿记）→ attachSessionDriver
  //   · agent/status === idle（驱动点，对齐 dsh-goal-round-driver）→ attachAgentStatus
  // useCaseDeps 尚未构造 → 以惰性 getter 传入（driver 只在异步边界取用）。
  const unsubscribeSessionEvents = assembleDiveSessionDriver({
    runtime: { pendingCapture, toolTrace, recentUserMsgs, deliverer },
    // t8/B12 阶段①-a：同步缝的窄投影来源（与 registerCaptureGuidance 同款装配）。
    requirementStore: store,
    now, address, injectionLog, gateChain,
    // 任务队列端口（REQ-260927202051-f6df）：驱动注入「当前任务」需从队列取（v9 台账无 tasks）。
    taskStore,
    onNodeSettled: (settle, session) => settlement.onSettle(settle, session),
    useCaseDeps: () => useCaseDeps,
    logger, plugin: name,
    round: diveManager.roundDriver(),
    attachSessionDriver: (handler) => diveManager.attachSessionDriver(handler),
    attachAgentStatus: (handler) => diveManager.attachAgentStatus(handler),
  });
  if (unsubscribeSessionEvents) disposers.push(unsubscribeSessionEvents);

  // 捕获引导段装配（按窗口条件注入）：抽到 ./gate-wiring.js（REQ-f0579a t5 尺寸门禁）。
  registerCaptureGuidance(ctx, {
    requirementStore: store,
    disposers, pendingCapture, injectionLog, logger, plugin: name, address,
    // 任务队列端口（REQ-260927202051-f6df D17）：引导段用它的**同步缓存**渲染「当前任务执行中」。
    taskStore,
    sectionName: CAPTURE_SECTION, sectionOrder: CAPTURE_SECTION_ORDER,
    onSystemPrompt: (svc) => { systemPromptSvc = svc; },
  });

  // t7（FR-8）：余量参考读取口的**唯一实例**——上面两处装配（节点结算 / 闸门链）经 getter 惰性取它。
  // 必须在 createCaptureRuntime 之后（它依赖 toolTrace / recentUserMsgs 两张会话缓冲表）。
  const sessionProbeAdapter = new SessionProbeAdapter({
    toolTrace,
    recentUserMsgs,
    agents: () => agentsSvc,
    sessionProjections: () => projectionsSvc,
    // REQ-261004154937-2ca3：血缘聚合（本窗口 + 后代子代理会话）
    sessionPersistence: () => persistenceSvc,
    sessionProjectionCache: () => projectionCacheSvc,
    now,
  })
  sessionProbe = sessionProbeAdapter

  // agent 工具：reqboard_capture（三问弹框 + 创建即立项）/ reqboard_create（手工路径）/
  // reqboard_status（自查）。用例依赖 = 组合根装配 adapters → application 用例。
  const useCaseDeps: UseCaseDeps = {
    // UseCaseDeps.repo 已在 B12 阶段④-3 摘除；新端口与桥**同一份真相**（桥就是它的适配器）。
    store: store,
    // 知识层（REQ-261001110934-3766）：与文档库同根——工作区根动态校正后自动跟随。
    knowledge: new KnowledgeRepository(docs),
    // t8 灰度：注入侧三档开关（缺省 = 注入索引节、不瘦身文档；见 plugin-config.knowledgeSettings）
    knowledgeInject: {
      injectIndex: kbSettings.enabled && kbSettings.injectIndex,
      trimRequirementDoc: kbSettings.trimRequirementDoc,
      injectBudgetChars: kbSettings.injectBudgetChars,
    },
    // REQ-261004174324-4195 t4：通知点 ② 的接收口（用例根校正后 ensure）。
    knowledgeBootstrap,
    // REQ-261004183621-de3f FR-6：归档清单未列闸门（非法配置在 archiveGateSetting 里装配期抛错）
    archiveUnlistedGate: archiveGateSetting(config),
    // REQ-261004065652-5c1c FR-7：弹框缺省宽限（配置项，缺省 10 分钟；0 = 旧全阻塞）。
    confirmDefaultGraceMs: confirmGraceSetting(config),
    // REQ-261004110201-f253 FR-1：阶段模型路由表——**在这里校验**（非法配置装配期就抛，
    // 不在执行期才发现）；未配置 → {}（生成脚本不注入 provider/model，与改造前逐字节相同）。
    stageRouting: stageRoutingSetting(config),
    // REQ-261004110201-f253 FR-3：零产出告警阈值（缺省 2；非法配置装配期抛错）。
    zeroOutputAlertThreshold: zeroOutputAlertThresholdSetting(config),
    // REQ-261004110201-f253 FR-4：全局在制上限（缺省 0 = 不限；非法配置装配期抛错）。
    maxInFlightRequirements: maxInFlightRequirementsSetting(config),
    // REQ-261002175818-80a8 FR-3/FR-5：一轮容量与标记门禁——原样注入配置子对象，
    // 解析（缺省 16 DU、enforce）仍单点在 plugin-config（resolveRoundCapacity / markerGateOf）。
    capacity: config?.capacity,
    // 任务存储（队列）——v9 后任务的唯一入口（REQ-260927202051-f6df）；用例侧缺它则读不到任务。
    taskStore,
    docs,
    clock,
    ids: new RandomIdFactory(),
    // t7（FR-8）：与上面两处装配**同一实例**（唯一读取口，口径单点）。
    session: sessionProbeAdapter,
    // 能力的唯一织入点（REQ-e3b6a0 t7）：包装后，任何带 opts.gate 的弹框自动进入后置链。
    questions: new GateAwareQuestions(new UserQuestionsAdapter(() => userQuestionsSvc), gateChain, { now }),
    rejections: captureRejections,
    // REQ-261003191948-e94a：引擎按**调用时**解析（见 resolveWorkflowEngine 的说明），
    // 不再依赖装配期 inject 的回调是否送达。
    // 2026-10-03 二次修复：不可达时给**结构化、可行动**的原因（不再是裸的 engine_unavailable），
    // 并把可达性探针输出与诊断留痕一并接上——引擎按设计被 isolate 在 agent 作用域，重试无解。
    workflow: new WorkflowEngineRunner(() => resolveWorkflowEngine() as never, {
      describeUnavailable: describeEngineAccess,
      diag: captureDiag,
    }),
    // FR-11 路线 A：团队执行端口。与 workflow 并存——团队优先、workflow 兜底的选路由用例层决定。
    teams: new AgentTeamsAdapter(() => agentTeamsSvc as never),
    // REQ-261003215944-9e04 FR-1（t4）：会话开窗端口（adapters 是唯一 I/O 实现）。
    // 缺省（服务未装配）→ reqboard_open_window 响亮失败，不伪造窗口码；REQ-261004150249-731e FR-1：第二个解析器 = workspace 注册表（开窗落点解析源项目）。
    windowOpener: new SessionWindowOpener(() => sessionControllerSvc, () => workspaceRegistrySvc),
    // REQ-261004103330-005f：「选择…」= 用 macOS 原生「存储为」窗口（osascript）取**文件路径**。
    // 为什么不用 DSH 的 ctx.directoryPicker：那是**选目录**的缝，而我们这里要的是**库文件路径**（含文件名），
    // 「存储为」式窗口才对得上；且本端口可注入，路由能直测三态。
    pickStoragePath: new OsascriptStoragePathPicker(),
    crossWindowDeliver: deliverer,
    handoff: handoffSettings(config),
    // REQ-260923222557-d3b0 FR-2/FR-3：事件型 worktree 提示词复用同一投递实现。
    // REQ-260924213231-b1c4 T-6（FR-3）：装配非阻塞弹框能力（缺省 = 保持旧阻塞语义）。
    pendingConfirms,
    // REQ-261002141430-a5ef FR-1：在途弹框登记（停手判据）——与 ticket 表**同实例**（两种视图一张表）。
    dialogs: pendingConfirms,
    // B12 阶段①-a：告警路由只需 `sourceSessionId`——许可区已扩到本处（见 ports.ts 的 peekFacts 注释：
    // 它是"寻址"而非门禁/写判定，读到略旧最坏是该窗口这次没收到告警，不会放过或挡下任何操作）。
    alert: createFailureAlert({ log: (m) => logger.error(m), windowFor: (id) => store.peekFacts().find((x) => x.id === id)?.sourceSessionId }),
    // D14 修复：链的子卡派发需要 agent 句柄；看板「继续」/启动恢复按绑定窗口兜底解析（惰性读取）。
    agents: () => agentsSvc as { get?: (id: string) => unknown } | undefined,
  };

  // REQ-260927144541-0481 根因修复（D-1 的落地点）：**装配 JobsPort**。
  // 此前 useCaseDeps.jobs 恒为 undefined（'JobsPort 未装配'被三处当既成事实写进注释）→
  // advanceRequirement 永远走同步兼容路径，实测后果有三，且都表现为'反复出现'：
  //   ① 工具调用被阻塞数分钟（一次 driveChain 跑完才返回）→ 调用方 turn 超时/被掐断；
  //   ② 链挂在该 turn 的 abort signal 上——turn 一中断，正在跑的子卡 workflow 就地
  //      cancelled: workflow signal aborted（t-c42bc0 反复失败即此）；
  //   ③ 即使链推进成功，回执也因 dispatched=false 而报'投递失败'（谎报）。
  // 惰性注入 ctx.jobs（@deepseek-ai/dsh-tool-jobs 提供，本 profile 已启用；owner 隔离由
  // DshJobsAdapter.start 原样透传）后恢复'投递即返回、后台真跑'。
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['jobs'],
    (jobsCtx: any) => {
      if (!DshJobsAdapter.isAvailable(jobsCtx)) {
        logger.warn('reqboard: ctx.jobs 不可用 → 实施链退回同步兼容路径（调用会阻塞到链跑完）')
        return
      }
      useCaseDeps.jobs = new DshJobsAdapter(jobsCtx)
      logger.info('reqboard: JobsPort 已装配（ctx.jobs）→ 实施链走投递式后台执行')
    },
  )

  // REQ-4842fe t7：启动恢复扫描（崩溃不丢链）。
  scheduleStartupScan({ load: () => store.headAfterDrain(), deps: useCaseDeps, info: (m) => logger.info(m), warn: (m, err) => logger.warn(m, err) });
  // REQ-261001213924-1441 FR-8：存量台账幂等迁移（老记录只有 phase，新读侧要 driverHealth）。
  // 放在启动对账这一次里跑：不额外开定时器，迁移本身按 migratedAt 印章幂等，失败不致命（读侧仍有 phase 兼容）。
  void Promise.resolve(store.headAfterDrain())
    .then(() => migrateDiveState({  store: store, now, logger: { info: (m) => logger.info(m), warn: (m, e) => logger.warn(m, e) } }))
    .then((res) => {
      if (res.migrated > 0) captureDiag('[DIVE-MIGRATE] 归一 ' + res.migrated + '/' + res.scanned + ' 条：' + res.details.join(' | '));
    })
    // REQ-261004065652-5c1c FR-9：终态收手对账（放在迁移**之后**：迁移会把存量补成 armed，
    // 对账再把终态那批收回去）。幂等，第二次启动零写入；全需求唯一会改写存量数据的一步。
    .then(() => reconcileTerminalDive({
      store: store,
      now,
      logger: { info: (m) => logger.info(m), warn: (m, e) => logger.warn(m, e) },
    }))
    .catch((err: unknown) => logger.warn('reqboard: dive 存量迁移/终态对账失败（不致命，读侧仍兼容 phase）', err));
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['tools'],
    (toolsCtx: { effect?: (fn: () => void, label?: string) => void; tools?: any }) => {
      toolsCtx.effect?.(() => {
        // 工具面（REQ-47939a t8：13→9 收敛；REQ-327bdf 增 task_execute/task_status；REQ-e3b6a0 t8 增 reqboard_capture）
        disposers.push(toolsCtx.tools.register(defineCreateTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineCaptureTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineStatusTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineTaskReportTool(useCaseDeps)));
        // 恢复：批准计划后的拆分落库入口（自动拆分路径缺 JobsPort，见 DecomposeTool 文件头）
        disposers.push(toolsCtx.tools.register(defineDecomposeTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineSubmitTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineAskConfirmTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineConfirmReceiptTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineAcceptSheetTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineTaskExecuteTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineAdvanceTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineTaskStatusTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineTaskRefsTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineArchiveAmendTool(useCaseDeps)));
        // REQ-260924213231-b1c4 T-9（FR-6 / I-8）：断点显式兜底（B′ 入口）。
        disposers.push(toolsCtx.tools.register(defineNoteInterruptionTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineClearPauseTool(useCaseDeps)));
        // REQ-261003215944-9e04 FR-1：开一个新窗口（DSH 会话分支）
        disposers.push(toolsCtx.tools.register(defineOpenWindowTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineHandoffTool(useCaseDeps, { thresholds: handoffSettings(config) })));
        // REQ-261003215944-9e04 FR-2：派/解席位（上限来自配置，非法值在装配期抛错——与其余旋钮同纪律）
        disposers.push(toolsCtx.tools.register(defineBindTool(useCaseDeps, { seatsMax: seatsMaxSetting(config) })));
        // REQ-260927100007-b8ba FR-7：补回 agent 侧流转工具（此前仅在 HTTP 层，agent 调不动）
        disposers.push(toolsCtx.tools.register(defineMoveTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineTaskMoveTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineRunStatusTool(useCaseDeps)));
        // REQ-260927144541-0481 FR-3：只读父子结构视图（reqboard_task_tree）
        disposers.push(toolsCtx.tools.register(defineTaskTreeTool(useCaseDeps)));
        // 归属补救：把缺 parentId 的卡挂回父卡下（2026-09-28）
        disposers.push(toolsCtx.tools.register(defineTaskAdoptTool(useCaseDeps)));
        // 卡片层契约（2026-09-28）：子卡链再生成（补链）+ 只读诊断。
        disposers.push(toolsCtx.tools.register(defineRegenerateTool(useCaseDeps)));
        disposers.push(toolsCtx.tools.register(defineKnowledgeTool(useCaseDeps)));
      }, name + ': tools');
      logger.info(
        'agent tools registered (13): reqboard_create / reqboard_capture / reqboard_status / reqboard_task_run / reqboard_task_execute / reqboard_task_status / '
        + 'reqboard_task_report / reqboard_submit(kind) / reqboard_ask_confirm / reqboard_confirm_receipt / reqboard_accept_sheet / reqboard_note_interruption / reqboard_clear_pause / reqboard_move / reqboard_task_move / reqboard_task_adopt / reqboard_handoff',
      );
    },
  );

  // Client 资产：纯声明式（package.json dsh.client + exports["./client"] → lib/client.js），
  // 宿主 dsh-client-modules 自动扫描已启用 Loader 条目组合启动图，无需逐插件接线。

  // 看板 REST/SSE API（经 webServer 惰性注入，注册即生效）
  ;(ctx as unknown as { inject?: (services: string[], cb: (webCtx: any) => void) => void }).inject?.(
    ['webServer'],
    (webCtx: { effect?: (fn: () => void, label?: string) => void; webServer?: any }) => {
      webCtx.effect?.(() => {
        const disposeApi = webCtx.webServer.register({
          kind: 'prefix',
          path: '/dashboard/api/reqboard',
          // injectionLog 只以**只读端口**身份进入路由（t11）：看板能读「本次注入了什么」，不能写。
          handler: createReqboardHandler({
            // B12 阶段⑤：旧单册端口的 `store` 字段已从路由装配里删除（路由只用新端口）
            // 路由侧新端口（必填）——生产装配传分片 store
            requirementStore: store,
            // 任务存储（队列）：路由的**必填**依赖（v9 后台账无 tasks，缺它则任务页/甘特全空）。
            taskStore,
            // REQ-261004103330-005f t5：设置类路由的三个端口 + 版本档案 + dshHome。
            // 三个端口对缺失是**响亮 500**（组合根 bug），故这里必须真装配（见 settings-support.ts）。
            settings: settingsStore,
            systemRecord,
            storageActions: pendingConfirms,
            pluginInfo,
            dshHome: settingsHome,
            now,
            docs,
            injectionLog,
            // REQ-260923134706-e72f t2：isolationTrace 只读进路由（看板「执行流程→上下文管理」数据源），不能写。
            isolationLog: isolationTrace,
            // REQ-e3b6a0 t9 / FR-9：看板「确认产物」纳入切面——确认即推进 + 链侧投递（H2 需要会话句柄）。
            gateChain,
            agents: () => agentsSvc as { get?: (id: string) => unknown } | undefined,
            systemPrompt: () => systemPromptSvc,
            tokenSnapshot: (wk) => { // REQ-b545fe t6: 注入快照提供者
              try {
                return useCaseDeps.session.tokenTotals(wk);
              } catch {
                return undefined;
              }
            }, advance: (reqId: string) => advanceRequirement(useCaseDeps, reqId).then(o => ({ steps: o.steps.length, stopped: o.stopped as string })),
            // 看板「拆分」入口（2026-09-26）：批准计划后的落库恢复通道（自动拆分缺 JobsPort）。
            applicationDeps: useCaseDeps,
            // REQ-261003215944-9e04 FR-11：会话 id → 该会话工作区根（前端在 ?session= / body.sessionId 里带）。
            // t13 回滚开关：docsRootSource='legacy-cwd' 时**不装配**它 → 读根回到改造前的插件宿主目录。
            ...(docsRootSourceSetting(config) === 'legacy-cwd' ? {} : { sessionWorkspace: (sid: string | undefined) => {
              if (sid === undefined || sessionsSvc === undefined) return undefined;
              try {
                const svc = sessionsSvc as { get?: (id: string) => { header?: { cwd?: unknown } } | undefined };
                const cwd = svc.get?.(sid)?.header?.cwd;
                return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined;
              } catch (err) {
                logger.warn('reqboard: 解析会话工作区失败（读根回落 legacy）:', err);
                return undefined;
              }
            } }),
            // REQ-261001124111-5d36 t4：面板刷新策略随 SSE 的 build 帧下发（refreshMs=0 = 关轮询）
            panelPolicy: panelSettings(config),
            // REQ-261004174324-4195 t4：通知点 ③（看板按会话解析读根时自举）
            knowledgeBootstrap,
          }),
        });
        // REQ-261004111917-f473 FR-1：exact 路由**先于静态兜底**匹配 → /dashboard 不再落 404。
        // 两条路径（带/不带尾斜杠）行为必须一致，否则会回到「有时能开、有时 404」的最难查形态。
        // 注册与回滚收在 registerLegacyBoardRoutes 里（任一条失败即回滚已注册者，复核 R4）；
        // handler 零依赖（不读台账）：这条路径无鉴权，不能变成信息出口。
        const disposeLegacy = registerLegacyBoardRoutes(webCtx.webServer);
        // 撤销顺序与注册相反：先撤兼容入口（其内部已按相反顺序撤两条 exact），再撤 API 前缀。
        // 两侧都幂等（内部有 disposed 门闩），单个失败不阻塞其余清理。
        return () => {
          try { disposeLegacy(); } catch { /* 单个撤销失败不阻塞其余清理 */ }
          try { disposeApi(); } catch { /* 同上 */ }
        };
      }, name + ': api');
      logger.info('routes registered: /dashboard/api/reqboard/* + /dashboard（旧深链兼容入口）');
    },
  );

  // teardown：注销 section / 工具 / 事件订阅（重复 dispose 幂等，cordis effect wrapper 自带 epoch 守卫）
  ;(ctx as any).on('dispose', () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose(); } catch (err) { logger.warn('disposer failed:', err); }
    }
  });
}