/**
 * 配置 / 路径 / 开关纯函数（REQ-260924213231-b1c4 T-12：index.ts 超 400 行尺寸门禁，
 * 从组合根抽出本块）。注释随代码搬（硬约束：不重写、不删"为什么/事故出处"型注释）；
 * dshHomePath / nodeIsolationEnabled 由 index.ts **再导出**以保持既有 import 兼容。
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { LIMITS } from './domain/limits.js';
import { validateStageRouting, type StageModelRoute } from './domain/task/StageRouting.js';
import type { HandoffThresholds } from './application/internal/handoff-policy.js';
import type { RunSettingsConfigInput } from './application/settings/resolve-settings.js';

export interface PluginConfig {
  /** DSH 主目录（默认 ~/.dsh） */
  dshHome?: string;
  /**
   * 部署级默认阶段上限（REQ-261004103330-005f FR-2）。
   *
   * 在四级来源里排第二（设置文件 > **插件配置** > 环境变量 > 内置默认）：看板改过的那一项
   * 永远优先，本字段只兜"人还没改过"的情形。形状直接复用 t1 的 `RunSettingsConfigInput`，
   * **不在这里复制一份**（复制必然漂移）。
   */
  stageMaxRounds?: RunSettingsConfigInput['stageMaxRounds'];
  /**
   * 部署级默认存储后端与库路径（REQ-261004103330-005f FR-6）。
   *
   * 同样复用 t1 的形状；`backend` 只接受 `json` / `sqlite`，非法值由解析链逐项作废
   * （继续沿链往下找，不整份失效）。
   */
  storage?: RunSettingsConfigInput['storage'];
  /**
   * 节点隔离开关（REQ-422af1 t10）。**默认关**：关闭时隔离代码路径执行 0 次，
   * 行为完全等同改造前（design/migration.md §3）。显式配置优先于环境变量。
   */
  nodeIsolation?: boolean;
  /** 模板根绝对路径（REQ-260922213356-4a45 T-3）；缺省按包根 templates 解析。 */
  templateRoot?: string;
  /** 地址段开关（T-3；默认 true；false = 完全回退到改造前注入行为）。 */
  addressSectionEnabled?: boolean;
  /**
   * 知识层（REQ-261001110934-3766 t8；REQ-261004174324-4195 FR-6 追加自举开关）。四档：
   *   enabled=false          → 工具返回空集、注入不加节（一键停用；**同时不自举**）
   *   autoBootstrap=true(默认) → 项目缺知识层时自动生成骨架与生成物（幂等；非布尔 → 装配期抛错）
   *   injectIndex=true(默认) → 节点输入包追加「项目知识索引」节（≤ injectBudgetChars）
   *   trimRequirementDoc     → **默认 false**；开启后需求文档节改为「TL;DR + 指针」
   * 缺省值刻意保守：不写配置时只有"加索引节 + 缺层自举"生效，且仓库已有知识层时逐字节不变。
   */
  knowledge?: {
    enabled?: boolean;
    autoBootstrap?: boolean;
    injectIndex?: boolean;
    trimRequirementDoc?: boolean;
    injectBudgetChars?: number;
  };
  /**
   * 需求面板刷新（REQ-261001124111-5d36 t3）。宿主经 SSE 的 `build` 帧把这两个值下发到浏览器，
   * 客户端据此决定轮询周期与陈旧阈值：
   *   refreshMs = 0 → **关闭周期轮询**（只保留"打开面板拉一次"，一键回退改造前行为）
   * 缺省 5000 / 30000，与客户端 `DEFAULT_PANEL_POLICY` 保持一致。
   */
  panel?: { refreshMs?: number; staleAfterMs?: number };
  /**
   * 归档清单未列闸门（REQ-261004183621-de3f FR-6）。
   *   unlistedGate='enforce'（缺省）→ 未列未豁免且未声明 → 拒绝提交（零台账改动）
   *   unlistedGate='warn'           → 旧语义：只记对账结果与留痕，不拦
   * 非法值 → **装配期抛错**（见 `archiveGateSetting`）：静默回缺省会让"我设了"变成错觉。
   */
  archive?: { unlistedGate?: 'enforce' | 'warn' };
  /**
   * 弹框缺省宽限（毫秒，REQ-261004065652-5c1c FR-7）。缺省 600000（10 分钟）；
   * `0` = 显式回到旧的全阻塞语义。见 `confirmGraceSetting`。
   */
  confirmDefaultGraceMs?: number;
  /**
   * 阶段模型路由（REQ-261004110201-f253 FR-1）。键 = StageKind 或 `'<StageKind>@<difficulty>'`
   * （difficulty ∈ simple/standard/advanced/expert），值 = `{provider?, model?}` 至少一项非空。
   * **未配置 = 现状**：生成子卡脚本时不注入 provider/model（与改造前逐字节相同）。
   * 非法形状 → 装配期抛错（响亮失败，不静默忽略）。
   */
  stageRouting?: Record<string, { provider?: string; model?: string }>;
  /**
   * 全局在制上限（FR-4）：同时在跑的**需求**条数上限（在制判据 = 有新鲜推进锁）。
   * 缺省 `0` = 不限（现状行为）；超限时本轮不投递并如实回执 `stopped='wip_limit'`。
   */
  maxInFlightRequirements?: number;
  /**
   * 零产出告警阈值（FR-3）：同一需求同一阶段**连续**零产出执行达到该次数时写一条告警评论
   * （去重可推导：floor(streak/threshold) 大于已有告警数才写）。缺省 2；非法值装配期抛错。
   */
  zeroOutputAlertThreshold?: number;
  /**
   * 文档读根（REQ-261003215944-9e04 FR-11 的回滚开关）。
   *   'session'（缺省）= 按**发起阅读的会话工作区**解析（修复「除需求目录外一律判不存在」）；
   *   'legacy-cwd'     = 回到改造前行为（插件宿主工作目录），一键回滚、不动代码。
   * 非法值 → 装配期抛错（响亮失败，不静默忽略）。
   */
  docsRootSource?: 'session' | 'legacy-cwd';
  /**
   * 单需求席位数上限（REQ-261003215944-9e04 FR-2）。缺省 8；非法 → 装配期抛错。
   * 放在配置里而不是散在用例里：它是"授权面"的旋钮，改它要有据可查。
   */
  seatsMax?: number;
  /**
   * 续作交接的水位三档（REQ-261004150249-731e FR-3）。缺省 `0.75 / 0.85 / 0.90`；
   * 非法（非有限数、或破坏 `0 < warn < fork < critical ≤ 1`）→ **装配期抛错**。
   *
   * 为什么放配置：阈值是"多满算满"的经验值，模型与窗口大小不同感受不同；但它必须是有据可查的
   * 旋钮，不能散在用例里当魔法数——与 `seatsMax` 同纪律：单点解析、非法响亮、缺省可预期。
   */
  handoff?: {
    /** 预警档：写断点并预告「下个边界该分叉」，**不开窗**。 */
    warn?: number;
    /** 分叉档：到达阶段边界时开窗并交接 owner。 */
    fork?: number;
    /** 兜底档：不等阶段边界立即交接（只有它允许半路换人）。 */
    critical?: number;
  };
  /**
   * 一轮容量与标记门禁强度（REQ-261002175818-80a8 FR-3 / FR-5）。
   * 不写 = 容量取常量 16 DU、门禁 enforce——与这次改造前逐字一致。
   */
  capacity?: {
    /**
     * 一轮细节容量（DU）。**非有限正数 → 回落常量**：容量取 0 会让每张卡都判超容量，
     * 门禁瞬间变噪音源；宁可保守回落，也不静默按 0 判定。
     */
    roundDetailUnits?: number;
    /**
     * 标记门禁强度（FR-5 的灰度/回退开关）。缺省 'enforce'；
     *   'warn' = 不拒绝提交，但**仍在返回体里响亮给出 gaps**（本仓反对「门禁静默失效」）。
     * 存在的理由：标记校验一旦误伤，人改配置即可回退，不必改代码等发版。
     */
    markerGate?: 'enforce' | 'warn';
  };
}

/**
 * 解析一轮容量（照 panelSettings 的写法）：返回**生效值 + 来源**，供 capacityNote 回显。
 *
 * 为什么返回值之外还要返回来源：`capacityNote.source` 是 FR-3 的「判据自述」——
 * 只返回值就没人分得清"配置生效了"与"配置被回落了"，而那正是最难排查的一类问题。
 */
export function resolveRoundCapacity(config?: PluginConfig): { value: number; source: 'constant' | 'config' } {
  const v = config?.capacity?.roundDetailUnits;
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? { value: v, source: 'config' }
    : { value: LIMITS.roundDetailUnits, source: 'constant' };
}

/** 标记门禁强度（FR-5 灰度开关）：缺省 'enforce'；只认 'warn' 一个降级值，其余一律按 enforce。 */
export function markerGateOf(config?: PluginConfig): 'enforce' | 'warn' {
  return config?.capacity?.markerGate === 'warn' ? 'warn' : 'enforce';
}

/** 面板刷新策略（REQ-261001124111-5d36 t3）：缺省 5000/30000；`refreshMs=0` 是合法的"关掉轮询"。 */
export function panelSettings(config?: PluginConfig): { refreshMs: number; staleAfterMs: number } {
  const p = config?.panel;
  const refreshMs = typeof p?.refreshMs === 'number' && Number.isFinite(p.refreshMs) && p.refreshMs >= 0 ? p.refreshMs : 5000;
  const staleAfterMs = typeof p?.staleAfterMs === 'number' && Number.isFinite(p.staleAfterMs) && p.staleAfterMs > 0 ? p.staleAfterMs : 30000;
  return { refreshMs, staleAfterMs };
}

export function dshHomePath(config: PluginConfig | undefined, file: string): string {
  const home = config?.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, file);
}

/**
 * 节点隔离开关（REQ-422af1 t10 / design/migration.md §3）：**默认关**。
 * 优先级：显式配置 nodeIsolation > 环境变量 NODE_ISOLATION(=1/true/on/yes) > 默认 false。
 * 关闭时 createNodeSettlementDispatcher 的 enabled=false 分支直接返回——
 * 不调度、不建端口、不触会话（stats 四项计数全 0 即其可执行证明）。
 */
export function nodeIsolationEnabled(
  config?: PluginConfig,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (config?.nodeIsolation !== undefined) return config.nodeIsolation;
  const raw = env.NODE_ISOLATION;
  if (raw === undefined) return false;
  return ['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase());
}


/**
 * 知识层三档灰度的解析（t8）：缺省 = 开启知识层、注入索引、不瘦身文档。
 *
 * REQ-261004174324-4195 FR-6 追加 `autoBootstrap`（缺省 true = 缺层自动自举）。
 * **该字段刻意严格**：写成非布尔（如 `"no"`）→ 装配期抛错。理由：自举会往用户项目里写文件，
 * 「写错了字符串却按默认开了」属于会改人文件的静默意外，必须响亮。
 */
/**
 * 归档清单未列闸门的解析（REQ-261004183621-de3f FR-6）。
 *
 * 缺省 `enforce`（未列未豁免且未声明 → 拒绝）；`warn` = 旧语义（只留痕不拦）。
 * **非法值抛错**而不是回落缺省：与本仓 `docsRootSource` / `autoBootstrap` 同口径——
 * 「我明明设了 warn，却被静默当成 enforce」是最难查的一类问题。
 */
export function archiveGateSetting(config?: PluginConfig): 'enforce' | 'warn' {
  const raw: unknown = config?.archive?.unlistedGate
  if (raw === undefined) return 'enforce'
  if (raw === 'enforce' || raw === 'warn') return raw
  throw new Error("archive.unlistedGate 只能是 'enforce' 或 'warn'：实际 " + String(raw))
}

export function knowledgeSettings(config?: PluginConfig): {
  enabled: boolean;
  injectIndex: boolean;
  trimRequirementDoc: boolean;
  injectBudgetChars: number;
  autoBootstrap: boolean;
} {
  const k = config?.knowledge;
  const rawBootstrap: unknown = k?.autoBootstrap;
  if (rawBootstrap !== undefined && typeof rawBootstrap !== 'boolean') {
    throw new Error('knowledge.autoBootstrap 只能是 boolean：实际 ' + String(rawBootstrap))
  }
  return {
    enabled: k?.enabled !== false,
    injectIndex: k?.injectIndex !== false,
    trimRequirementDoc: k?.trimRequirementDoc === true,
    injectBudgetChars: typeof k?.injectBudgetChars === 'number' && k.injectBudgetChars > 0 ? k.injectBudgetChars : 3000,
    autoBootstrap: rawBootstrap !== false,
  };
}

/**
 * 弹框缺省宽限（FR-7）：**从 `LIMITS` 派生，刻意不新增超时常量**。
 *
 * 为什么不是"10 分钟"（设计初稿的写法）：既有裁定 REQ-260923222557-d3b0 FR-5 明确
 * 「人机回路超时为 1 小时，且 src 内不得再出现 600s/900s 硬编码」，并由
 * `tests/concurrency-limits.test.ts` 的 TC-8 机械守着。本需求也**不需要**压短人的作答时间——
 * 宽限到点只是让 agent 带着 ticket 先回来（人之后作答照样落章）。
 *
 * 取 `timeoutInteractiveMs - GRACE_MARGIN`：让**插件先于宿主**那记 1 小时的工具超时返回 ticket，
 * 而不是被宿主掐断（2026-10-03 实测的 `工具调用 3600000ms 无人作答被中止` 正是被掐断）。
 */
export const CONFIRM_GRACE_MARGIN_MS = 60_000;

/** 缺省宽限 = 宿主交互超时 − 1 分钟的安全边界（单点派生，见上）。 */
export const CONFIRM_DEFAULT_GRACE_MS = LIMITS.timeoutInteractiveMs - CONFIRM_GRACE_MARGIN_MS;

/** `0` 合法（= 显式全阻塞）；非法值回落派生缺省。 */
export function confirmGraceSetting(config?: PluginConfig): number {
  const v = config?.confirmDefaultGraceMs;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : CONFIRM_DEFAULT_GRACE_MS;
}

// ---------------------------------------------------------------------------
// 阶段模型路由 / 在制上限 / 零产出阈值（REQ-261004110201-f253 FR-1 / FR-3 / FR-4）
//
// 三者的共同纪律：**未配置 = 现状**（路由不注入、上限不限、阈值取缺省），
// 而**配错 = 装配期响亮抛错**（不静默回落——"配了但不生效"是最难排查的形态）。
// 校验入口是这三个 accessor：组合根装配时调用即校验，测试可直接调用断言。
// ---------------------------------------------------------------------------

/** 路由表（FR-1）：未配置 → `{}`（不注入任何 provider/model）；非法 → 抛 REQBOARD_STAGE_ROUTING_INVALID。 */
export function stageRoutingSetting(config?: PluginConfig): Record<string, StageModelRoute> {
  return validateStageRouting(config?.stageRouting);
}

/**
 * 全局在制需求上限（FR-4）：缺省 `0` = 不限。
 * 非法（负数 / 非整数 / 非数字）→ 装配期抛错（不静默回落，否则"设了上限却按不限跑"）。
 */
export function maxInFlightRequirementsSetting(config?: PluginConfig): number {
  const v = config?.maxInFlightRequirements;
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
    throw Object.assign(
      new Error('maxInFlightRequirements 必须是非负整数（0 = 不限）：实际 ' + String(v)),
      { code: 'REQBOARD_MAX_INFLIGHT_INVALID' },
    );
  }
  return v;
}

/** 零产出告警阈值（FR-3）：缺省 2；非法（非整数 / < 1）→ 装配期抛错。 */
export function zeroOutputAlertThresholdSetting(config?: PluginConfig): number {
  const v = config?.zeroOutputAlertThreshold;
  if (v === undefined) return 2;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
    throw Object.assign(
      new Error('zeroOutputAlertThreshold 必须是 ≥ 1 的整数：实际 ' + String(v)),
      { code: 'REQBOARD_ZERO_OUTPUT_THRESHOLD_INVALID' },
    );
  }
  return v;
}

/**
 * 文档读根的来源（FR-11 回滚开关）：缺省 'session'；只接受两个受控值。
 *
 * 为什么要有它：读根从「插件宿主目录」改成「会话工作区」是一次**行为变更**，
 * 变更就要留退路——`'legacy-cwd'` 让运维在出问题时一条配置回到改造前，不必改代码。
 */
export function docsRootSourceSetting(config?: PluginConfig): 'session' | 'legacy-cwd' {
  const v = config?.docsRootSource;
  if (v === undefined) return 'session';
  if (v !== 'session' && v !== 'legacy-cwd') {
    throw Object.assign(
      new Error("docsRootSource 只能是 'session' 或 'legacy-cwd'：实际 " + String(v)),
      { code: 'REQBOARD_DOCS_ROOT_SOURCE_INVALID' },
    );
  }
  return v;
}

/** 交接水位三档的生效值（FR-3）：类型单一源在 application 的判据模块，本处只做解析。 */
export type { HandoffThresholds }

/**
 * 解析交接水位三档（REQ-261004150249-731e FR-3）：缺省 `0.75 / 0.85 / 0.90`。
 *
 * 非法（非有限数、越出 `(0,1]`、或破坏 `warn < fork < critical`）→ **装配期抛错**：
 * 三档是**同一把尺子上的三个刻度**，顺序错乱会让判据自相矛盾（例如 warn > fork 时
 * "预警"永远先于"分叉"发生却又不该发生），那种状态不能带进运行期。
 */
export function handoffSettings(config?: PluginConfig): HandoffThresholds {
  const v = config?.handoff;
  const warn = v?.warn ?? 0.75;
  const fork = v?.fork ?? 0.85;
  const critical = v?.critical ?? 0.9;
  const bad = (why: string): never => {
    throw Object.assign(
      new Error('handoff 水位三档非法（' + why + '）：实际 warn=' + String(warn)
        + ' fork=' + String(fork) + ' critical=' + String(critical)
        + '；要求 0 < warn < fork < critical ≤ 1'),
      { code: 'REQBOARD_HANDOFF_CONFIG_INVALID' },
    );
  };
  for (const n of [warn, fork, critical]) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1) bad('每档必须是 (0,1] 内的有限数');
  }
  if (!(warn < fork && fork < critical)) bad('必须满足 warn < fork < critical');
  return { warn, fork, critical };
}

/** 单需求席位数上限（FR-2）：缺省 8；必须是 ≥ 1 的整数，否则装配期抛错。 */
export function seatsMaxSetting(config?: PluginConfig): number {
  const v = config?.seatsMax;
  if (v === undefined) return 8;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
    throw Object.assign(
      new Error('seatsMax 必须是 ≥ 1 的整数：实际 ' + String(v)),
      { code: 'REQBOARD_SEATS_MAX_INVALID' },
    );
  }
  return v;
}
