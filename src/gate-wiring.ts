/**
 * 闸门后置链与捕获引导段的装配辅助（REQ-f0579a t5：index.ts 超 400 行尺寸门禁，抽出两个装配块）。
 * 注释随代码搬（硬约束：不重写、不删"为什么/事故出处"型注释）；本文件是组合根的延伸，
 * 依赖方向与 index.ts 相同（adapters + application 均可引用）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RequirementStore } from './application/ports.js'
import { createGatePostChain } from './application/gate/GatePostChain.js';
import { createPendingGateStore } from './application/gate/PendingGate.js';
import { createH1AdvanceHandler } from './application/gate/handlers/h1-advance.js';
import { createH2CompactHandler } from './application/gate/handlers/h2-compact.js';
import { createH3InjectHandler } from './application/gate/handlers/h3-inject.js';
import { createH4ResumeHandler } from './application/gate/handlers/h4-resume.js';
import { createH5AuditHandler } from './application/gate/handlers/h5-audit.js';
import { NodeIsolationAdapter } from './adapters/NodeIsolationAdapter.js';
import { RandomIdFactory } from './adapters/RandomIdFactory.js';
import type { FileDocRepository } from './adapters/FileDocRepository.js';
import type { IsolationTraceFile } from './adapters/IsolationTraceFile.js';
import type { InjectionLogFile } from './adapters/InjectionLogFile.js';
import type { SystemClock } from './adapters/SystemClock.js';
import type { AgentDeliverer } from './adapters/AgentDeliverer.js';
import { headSectionTextFrom, fallbackSectionTextFrom } from './application/internal/capture-section.js';
import { windowKeyFromContext } from './application/internal/window.js';
import { captureDiag } from './application/internal/diag-log.js';
import type { SessionProbe, TaskStore } from './application/ports.js';
import type { RequirementFacts } from './domain/requirement/RequirementSummary.js';
import { type TaskRecord } from './shared/protocol.js';

export interface GateChainDeps {
  /** 新需求端口（t8/B11）：供 h2-compact 的 store/persistArtifacts 使用。 */
  requirementStore: RequirementStore;
  docs: FileDocRepository;
  clock: SystemClock;
  now: () => number;
  isolationTrace: IsolationTraceFile;
  injectionLog: InjectionLogFile;
  deliverer: AgentDeliverer;
  /**
   * 任务队列端口（REQ-260927202051-f6df）：H2 压缩的节点隔离要读"当前在制任务卡"，
   * 而 v9 台账已无 `tasks`（`IsolateNodeContextDeps.taskStore` 为**必填**）。
   */
  taskStore: TaskStore;
  logger: { info: (m: string) => void; warn: (m: string, err?: unknown) => void };
  plugin: string;
  /** H2 压缩开关（= 节点隔离开关求值结果，调用侧单点求值后传入）。 */
  compactionEnabled: boolean;
  /** 模板地址注入（REQ-260922213356-4a45 T-3）：绝对模板根 + 开关；缺省不注入。 */
  address?: { templateRoot?: string; enabled: boolean };
  /** 轮次边界判定（注入 projections 探测结果；判不出时调用侧已保守返回 false）。 */
  idle: (session: unknown) => boolean;
  /**
   * 轮次边界**三态**判定（2026-09-26）：链的"无 open turn"门用它——
   * 明确 busy 才延后且不消费，unknown（无 session/无投影/看板通道/测试）放行。
   * 与 idle 同源：idle === (idleState(state) === 'idle')。
   */
  idleState: (session: unknown) => 'idle' | 'busy' | 'unknown';
  /**
   * 会话探测端口（t7 / FR-8）——**惰性取值**：组合根在本链**之后**才建 `SessionProbeAdapter`
   * （它依赖会话缓冲表），故这里收 getter 并原样转交给 H2（取实例的时机 = 压缩执行期）。
   * 缺省 / 取不到 → 压缩出来的输入包不追加「一轮余量（参考）」节（与本改动前逐字节相同）。
   */
  sessionProbe?: () => SessionProbe | undefined;
}

/** 装配闸门后置链（REQ-e3b6a0）：Phase A 由装饰器登记，Phase B 在 turn/end 的异步边界执行。 */
export function assembleGatePostChain(deps: GateChainDeps): ReturnType<typeof createGatePostChain> {
  // D1：链默认开；压缩（H2）由 NODE_ISOLATION 独立控制且默认关（高风险动作分两步上）。
  const gateIds = new RandomIdFactory();
  const gateChain = createGatePostChain({
    enabled: true,
    pending: createPendingGateStore(),
    handlers: [
      createH1AdvanceHandler({ store: deps.requirementStore }),
      createH2CompactHandler({
        store: deps.requirementStore,
        persistArtifacts: async () => (await deps.requirementStore.head()).revision,
        docs: deps.docs,
        clock: deps.clock,
        taskStore: deps.taskStore,
        compactionEnabled: deps.compactionEnabled,
        isolationFor: (session) => new NodeIsolationAdapter(session, {
          idle: () => deps.idle(session),
          plugin: deps.plugin,
        }),
        trace: deps.isolationTrace,
        // t7（FR-8）：余量参考端口（惰性 getter，原样转交 H2；缺省 → 不传，输入包逐字节不变）。
        ...(deps.sessionProbe === undefined ? {} : { sessionProbe: deps.sessionProbe }),
      }),
      createH3InjectHandler({
        // B12 阶段①-a：归属需求改权威异步定点读（H1/H3 都是门禁路径，不能用非权威投影）。
        store: deps.requirementStore,
        // H3 的地址段要"当前在制任务卡"（v9 台账无 tasks）——run() 是 async，直接 await。
        taskStore: deps.taskStore,
        injectionLog: deps.injectionLog,
        ...(deps.address === undefined ? {} : { templateRoot: deps.address.templateRoot, addressSectionEnabled: deps.address.enabled }),
      }),
      createH4ResumeHandler({}),
      createH5AuditHandler({  store: deps.requirementStore, now: deps.now, newCommentId: () => gateIds.comment() }),
    ],
    warn: (message) => deps.logger.warn(message),
    idleState: (session) => deps.idleState(session),
  });
  deps.logger.info(
    'reqboard 闸门后置链已装配（H1 校验 → H2 压缩 → H3 注入 → H4 唤醒 → H5 审计）；'
    + '压缩开关 NODE_ISOLATION=' + String(deps.compactionEnabled),
  );
  return gateChain;
}

export interface CaptureGuidanceDeps {
  disposers: Array<() => void>;
  /** 新需求端口（t8/B11）：供 h2-compact 的 store/persistArtifacts 使用。 */
  requirementStore: RequirementStore;
  pendingCapture: Map<string, { windowKey: string; text: string; capturedAt: number }>;
  injectionLog: InjectionLogFile;
  /**
   * 任务队列端口（REQ-260927202051-f6df D17）：本段需要"队列任务快照"才能渲染
   * 「当前任务执行中」。因 section.text 是**同步**的，这里用它维护一份同步缓存。
   */
  taskStore: TaskStore;
  logger: { info: (m: string) => void; warn: (m: string, err?: unknown) => void };
  plugin: string;
  /** 模板地址注入（T-3）：绝对模板根 + 开关；缺省不注入。 */
  address?: { templateRoot?: string; enabled: boolean };
  /** 捕获引导段名（systemPrompt 全局唯一）与放置序位（identity 5 / genome 10-40 之后）。 */
  sectionName: string;
  sectionOrder: number;
  /**
   * 易变段尾部通道（REQ-261007100513-6749 t2 · FR-1/FR-2 ← design/backend.md §S-1）。
   *
   * **可选、缺省 = 未装配 = 通道不可用**（照 `UseCaseDeps` 的可选端口范式：未装配时行为与改造前
   * 一致）。语义：
   *   · 可用（`available(windowKey) === true`）→ `section.text` **只回头部**（逐字节稳定），
   *     状态行/当前任务/阶段纪律/待捕获提示由尾部通道投递（投递编排 = t3；本卡只留注入点）；
   *   · 不可用/未装配 → `section.text` 回落整段（清单 + 易变段 + 常量块；未绑定窗口 = 引导或命中提示
   *     二者取一），与改造前的会话内容等价（纪律一条不丢——这条回落是**安全底线**：通道挂了不许丢纪律）。
   *
   * **`available` 的契约（t3 必须遵守）**：它只表示**投递通道就绪**，不是"易变段已有人生产"：
   *   · t3 未就绪前必须返回 `false`（缺省/抛错同样按 `false` 处理，见 `volatileChannelAvailable`）；
   *   · `kind='capture'` 段的**生产者归 t3**（本卡只有读路径产出，写路径尚无生产者）——t3 若在
   *     生产者就位前返回 `true`，未绑定窗口的待捕获提示会**静默消失**（头部让位给了它，尾部又没投）。
   *
   * 为什么做成可注入而不是直接读一个布尔：t3 的通道有真实就绪态（agents 句柄、inbox 可用性），
   * 且本卡要求"落地后行为与改造前逐字等价"——缺省不可用才能保证这一条可被机械断言。
   */
  volatileChannel?: { available: (windowKey: string) => boolean };
  /** systemPrompt 服务就绪回调（调用侧存起供 tokenSnapshot/路由使用）。 */
  onSystemPrompt: (svc: unknown) => void;
}

/**
 * 尾部通道本回合是否可用。
 *
 * **抛错按不可用处理**（评审 P2-2）：这一缝是每轮系统提示词的装配，抛错会让该窗口**每一轮都跑不起来**
 * （本文件 `interpolate` 那段事故即同型）；同缝的 `peekFacts()` 也有同款兜底。方向必须是**安全侧**：
 * 回落头部 = 纪律照投（只是多占头部），绝不因通道抖动而丢纪律或炸装配。
 */
function volatileChannelAvailable(deps: CaptureGuidanceDeps, windowKey: string): boolean {
  if (deps.volatileChannel === undefined) return false;
  try {
    return deps.volatileChannel.available(windowKey) === true;
  } catch (err) {
    captureDiag(`reqboard-capture [NODE-4c]: 易变段通道可用性判定抛错 → 按不可用处理（回落整段）: ${(err as Error).message}`);
    return false;
  }
}

/**
 * 捕获引导段（B：按窗口条件注入）：为每个 agent 窗口的 systemPrompt 组装求值。
 *
 * 未绑定窗口 → 静态引导（命中待捕获时改为命中提示，二者不同屏）；已绑定窗口 → 稳定头部
 * （清单 + 常量块）；尾部通道可用时 `section.text` 只回头部，易变段由通道投递——见 `volatileChannel`；
 * 判不出窗口键 → ''（renderPrompt 滤空段 → 零噪音）。text 为函数式：每次组装读取 store 的
 * **同步窄投影**（`peekFacts()`）判定当前窗口状态。
 */
export function registerCaptureGuidance(ctx: Context, deps: CaptureGuidanceDeps): void {
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: any) => void) => void }).inject?.(
    ['systemPrompt'],
    (spCtx: { effect?: (fn: () => void, label?: string) => void; systemPrompt?: any }) => {
      deps.onSystemPrompt(spCtx.systemPrompt);
      spCtx.effect?.(() => {
        /**
         * 队列任务**同步缓存**（REQ-260927202051-f6df D17）。
         *
         * **为什么需要缓存**：本段服务于 system-prompt section 的 `text` provider，而 DSH 的
         * `SectionSpec.text` 类型是 `string | ((context) => string)` —— **同步，不能 await**
         * （实测 `@deepseek-ai/dsh-system-prompt/lib/types/index.d.ts:60`）；而任务存储在
         * `TaskStore`（异步端口）。故这里维护一份同步可得快照：注册时拉一次 +
         * `taskStore.subscribe` 每次任务变更再刷新。
         *
         * **最终一致，最多滞后一次事件** —— 此处**接受**该滞后：快照只用于"给人看的提示词指引"
         * （「当前任务执行中」那一段），**不是门禁判据**；门禁读的是 TaskStore 的实时值，
         * 不受本缓存影响。将来若有人怀疑这是脏读，请先读这条推理链。
         *
         * **三态**（`tasksSnapshot === undefined` = 尚未加载）：调用方必须区分
         * 「未加载」（整体略过任务块，**不谎报**"没有任务"）与「已加载且为空」。
         * **刷新失败保留上一次快照**并告警 —— 一次抖动不得把提示词段清空。
         */
        let tasksSnapshot: readonly TaskRecord[] | undefined
        const refreshTasks = (): void => {
          void deps.taskStore.listAll().then((tasks) => {
            tasksSnapshot = tasks
          }).catch((err) => {
            deps.logger.warn(
              'reqboard 捕获引导段：队列任务快照刷新失败（保留上次快照；提示词段最多滞后一次事件）',
              err,
            )
          })
        }
        refreshTasks()
        deps.disposers.push(deps.taskStore.subscribe(() => { refreshTasks() }))
        deps.disposers.push(spCtx.systemPrompt.section({
          name: deps.sectionName,
          order: deps.sectionOrder,
          // 本段是**字面量**，不是模板：正文全部是自撰文案 + 原文引用（用户消息节选、
          // 在制任务的说明与验收标准、需求标题），从不使用宿主的提示词变量体系
          // （全仓没有任何 systemPrompt.variable 注册）。
          //
          // 为什么必须显式声明（REQ-261005165552-6783 事故，2026-10-05）：
          // 宿主对 section 的**缺省语义是模板**——逐字扫描 `{{name}}`，名字非法（如模板里的
          // 全大写占位符）或未注册即**抛错**。段文本里出现这种占位符时，宿主在**系统提示词装配处**
          // 抛错 ⇒ 该窗口**每一轮都跑不起来**（模型一次都没执行），且报错文本自身带占位符，
          // 贴到别的窗口会复现同一故障。实测现场：REQ-261005105032-3b02 的窗口 session-5632659d
          // 因在制卡验收标准里引用了模板占位符而整轮卡死（台账 interruption.reason 逐字可查）。
          //
          // `interpolate: false` = 宿主把本段文本原样拼接进提示词（不再扫描变量）——
          // 这也是文本侧**不做转义**的前提：用户原话与卡上验收原文必须逐字保真。
          interpolate: false,
          text: (assembleContext: unknown) => {
            // 本窗口待捕获消息（hook 登记、turn/end 前）→ 作为**易变段**（kind=capture）注入；
            // 未命中时未绑定窗口走静态引导（头部）、已绑定窗口走「推进纪律」（头部 + 易变段）。
            const windowKey = windowKeyFromContext(
              assembleContext as { agent?: { id?: unknown }; scope?: unknown } | undefined,
            );
            const pending = windowKey ? deps.pendingCapture.get(windowKey) : undefined;
            // 【诊断日志-节点4】systemPrompt 组装时的 windowKey 提取与 pending 查询（文件双写，防 stdout 死管道）
            captureDiag(`reqboard-capture [NODE-4]: systemPrompt assemble (windowKey=${windowKey ? windowKey.slice(0, 16) : 'undefined'}, pending=${pending !== undefined ? 'EXISTS' : 'NONE'}, pendingCapture.size=${deps.pendingCapture.size})`);
            // t8 切换期：桥要 `await ready()` 才有同步快照，而本缝是**同步**回调、可能早于就绪被调用
            // （实测：apply() 后立刻求值）。按 design/backend.md §同步口的处置——这一缝本就允许
            // **非权威、可能略旧**的投影（它是"注入哪段引导文字"，不参与任何门禁与写判定），
            // 故未就绪时退化为空册求值（= `peekSummaries()` 尚未建索引时的同口径），
            // 并**留诊断日志不静默**。⚠️ 门禁/写判定**绝不**允许这种退化。
            // t8/B12 阶段①-a：本缝改由**新端口的同步窄投影**（`peekFacts()`）供数，
            // 不再经桥的同步整册快照（`snapshot`）供数。端口注释已划定许可区——本缝是 systemPrompt
            // 的 `text` 回调（**同步**、每回合执行、过期不致命），不属于门禁/写判定。
            // 与旧路径的差别：投影**可能略旧**（本地索引未建时为空数组 = 不注入引导），
            // 故失败**不静默**——留诊断日志（旧路径的"未就绪退化为空册"同口径）。
            let facts: readonly RequirementFacts[];
            try {
              facts = deps.requirementStore.peekFacts();
            } catch (err) {
              captureDiag(`reqboard-capture [NODE-4b]: 提示词窄投影不可用 → 引导段按空集求值（${(err as Error).message}）`);
              facts = [];
            }
            // t2（REQ-261007100513-6749）：本段拆成**头部 + 易变段**两半。
            //   · 头部（`headSectionTextFrom`）= 绑定关系 + 常量块 —— 逐字节稳定，只随窗口绑定关系变；
            //     需求状态、当前任务、阶段纪律、待捕获提示**不再进头部**（它们此前是头部被重写
            //     16 个版本、每次让整段前缀缓存作废的来源）。
            //   · 回落整段（`fallbackSectionTextFrom`）= 清单 + 易变段 + 常量块；未绑定窗口则在
            //     「静态引导」与「待捕获命中提示」间**二选一**（改造前的替换语义，二者不同屏）。
            //   · 通道可用性：`deps.volatileChannel` 未装配/抛错 = **不可用** → 走回落整段，
            //     与改造前的会话内容等价（纪律一条不丢）；t3 接入真实通道后，此处只回头部。
            if (windowKey !== undefined && volatileChannelAvailable(deps, windowKey)) {
              return headSectionTextFrom(facts, assembleContext);
            }
            return fallbackSectionTextFrom(facts, tasksSnapshot, assembleContext, {
              pending,
              injectionLog: deps.injectionLog,
            });
          },
        }));
      }, deps.plugin + ': capture');
      deps.logger.info('capture guidance section registered (unbound windows only, per-window eval)');
    },
  );
}