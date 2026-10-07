/**
 * 组件归属清单 component-manifest —— 详情页「谁拥有哪块界面」的**唯一机器真相**
 * （REQ-261007133149-0716 FR-1 / FR-2 / FR-5；人读版 = `prototypes/anatomy.html` 的 10 张组件卡）
 *
 * ## 谁读它
 *
 * - `scripts/report-style-ownership.mts`（判据二 · 分片归属门禁）：判「这条规则属不属于它所在的分片」；
 * - `scripts/report-style-snapshot.mts`（判据一 · 外观快照）：按组件采样计算样式与几何；
 * - 改样式的 agent：先在这里定位组件，再只读它自己的分片（这正是本需求要买的「读面缩小」）。
 *
 * ## 归属三条纪律（门禁按此判）
 *
 * 1. **DOM 根**：组件的根 = `root`；七件标本页（`scripts/fixtures/req-detail-specimen.mts`）
 *    并集恒为 10 个根，一个详情页同一时刻只有 4 个（未激活面板不进 DOM）。
 * 2. **前缀**：`prefixes` 是该组件拥有的类名前缀，命中规则 = 类名等于前缀，或以前缀 + 「-」起头
 *    （见 `ownsClass`）。前缀只列「只服务这一个组件」的类名——跨组件公共件（按钮 / 提示行 /
 *    芯片 / 成卡语汇 / 焦点环…）不列进任何组件，走门禁脚本里**逐条带理由**的白名单 `PUBLIC_CLASSES`。
 * 3. **公共层**：`base.ts` / `tokens.ts` / `shared.ts` 只许写「每处都一样的口径」与
 *    「一条规则同时命中 ≥2 个组件」的成组规则；只服务一个组件的规则住进公共层 =
 *    「公共层含具体组件取值」，门禁点名到组件（这正是 t4 要归位的那批）。
 *
 * ## 前缀从哪来（可复核，不靠记性）
 *
 * 7 件标本页在 headless Chrome 里逐组件取子树类名（真实渲染，不是读源码猜的），去掉跨组件与
 * 公共件后落定。门禁的「清单完整性」检查会**反过来核对**：真实渲染里每个组件子树的类名，
 * 要么被某个前缀认领，要么在公共白名单里——漏登记一个即红并点名。
 *
 * ## 归位完成（t4，2026-10-07）
 *
 * 片尾覆盖层（⑰ 收敛 / ⑲ 契约落地层 / ⑫–⑱ 收口 / ㉑ 卡片语汇）里**只服务一个组件**的规则
 * 已逐条搬进各自分片，跨 ≥2 组件的成组规则留在公共层——判据二现在输出
 * 「组件越界 0 处 / 公共层含具体组件取值 0 处」，判据一（逐组件计算样式快照）逐键全等。
 * 归位过程里给两条搬走的规则补了一个恒真的同义属性选择器（`[data-report-shell]` 再写一遍）
 * 以买回「原来靠位置赢」的那一局：head 的「长日志已收纳」标、token 的按节点表折叠条。
 *
 * ## 两处归属判定（照 DOM 根包含关系，与原型卡的个别提示不同）
 *
 * - 进度带（`.dsh-pm-progress-dots` / `.dsh-pm-dot-*`）**归 head**：实测它渲染在
 *   `[data-report-seg="head"]` 子树里，与 head 卡的「阶段条」一致；原型 tabs 卡的
 *   「`.dsh-pm-progress-dots .dsh-pm-dot-label`」只作代表选择器提示，不改变归属。
 * - `.dsh-pm-tab-panel`（面板包装器）不归 tabs：它包的是壳的第四段，外观是 base 的 ⓪ 契约。
 */

/** 10 个外观组件（= `Panel.key` + 3 个壳内组件）。 */
export type ComponentId =
  | 'head' | 'band' | 'tabs'
  | 'trunk' | 'docs' | 'dag' | 'dialogue' | 'verify' | 'token' | 'prompts'

export interface ComponentEntry {
  /** 组件标识（= 分片名；面板组件与 `Panel.key` 一致）。 */
  readonly id: ComponentId
  /** 人读名（组件卡标题用）。 */
  readonly label: string
  /** DOM 根选择器（照抄既有 `data-*` / 类名，**不新造**）。 */
  readonly root: string
  /** 分片文件（工作区相对路径）。 */
  readonly shard: string
  /** 该组件拥有的类名前缀（归属门禁按此判「越界」）。 */
  readonly prefixes: readonly string[]
  /**
   * 前缀的**显式例外**（前缀命中但**不属于**本组件的类名，逐条带理由）。
   *
   * 为什么需要它：前缀是「一族名字」，但同族的个别名字可能属于公共层或别人
   * （例：`dsh-pm-tab` 这族里的 `dsh-pm-tab-panel` 是**面板包装器**，包的是壳的第四段，
   *   不是 Tab 栏）。例外逐条写明理由，不许整族豁免。
   */
  readonly notOwned?: readonly { readonly name: string; readonly why: string }[]
  /** 服务条款。 */
  readonly serves: readonly string[]
  /** 依赖的公共层 / 端点（人读用）。 */
  readonly dependsOn: readonly string[]
  /** 该组件的外观还散在别处的清单（人读用；`[]` = 已收干净——t4 归位后十片皆空）。 */
  readonly tailIn: readonly string[]
}

const SHELL = 'src/client/styles/report'

export const COMPONENT_MANIFEST: readonly ComponentEntry[] = [
  {
    id: 'head',
    label: '常驻头部',
    root: '[data-report-seg="head"]',
    shard: `${SHELL}/head.ts`,
    prefixes: [
      'dsh-pm-detail-head', 'dsh-pm-detail-title', 'dsh-pm-detail-updated',
      'dsh-pm-rh', 'dsh-pm-gate', 'dsh-pm-status', 'dsh-pm-report-action',
      'dsh-pm-report-actions', 'dsh-pm-report-meta', 'dsh-pm-report-next',
      'dsh-pm-report-verdict', 'dsh-pm-report-windows', 'dsh-pm-window',
      'dsh-pm-card-id', 'dsh-pm-action-consequence', 'dsh-pm-action-bar-label',
      'dsh-pm-comment', 'dsh-pm-comments', 'dsh-pm-human-only',
      'dsh-pm-progress-dots', 'dsh-pm-dot',
    ],
    serves: ['FR-1', 'FR-2'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'band',
    label: '状态带三格',
    root: '[data-report-seg="band"]',
    shard: `${SHELL}/band.ts`,
    prefixes: [
      'dsh-pm-band', 'dsh-pm-gap', 'dsh-pm-outcome',
      'dsh-pm-report-band-body', 'dsh-pm-stat', 'dsh-pm-stats',
    ],
    serves: ['FR-1', 'FR-2'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'tabs',
    label: '进度带 + Tab 栏',
    root: '[data-report-seg="tabs"]',
    shard: `${SHELL}/tabs.ts`,
    prefixes: ['dsh-pm-tabs', 'dsh-pm-tab', 'dsh-pm-tab-icon', 'dsh-pm-badge-alert'],
    notOwned: [
      {
        name: 'dsh-pm-tab-panel',
        why: '面板包装器：它包住的是当前激活的那个面板（壳的第四段 [data-report-seg="panel"]），不是 Tab 栏；外观是 base 的 ⓪ 契约（一律铺开、不吃内层滚动）',
      },
    ],
    serves: ['FR-1', 'FR-2'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'trunk',
    label: '汇报面板',
    root: '.dsh-pm-trunk',
    shard: `${SHELL}/panels/trunk.ts`,
    prefixes: ['dsh-pm-trunk', 'dsh-pm-hl', 'dsh-pm-evidence-missing'],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'docs',
    label: '文档面板',
    root: '[data-panel="docs"]',
    shard: `${SHELL}/panels/docs.ts`,
    prefixes: [
      'dsh-pm-docs', 'dsh-pm-doc', 'dsh-pm-discovered', 'dsh-pm-archive',
      'dsh-pm-proto-count', 'dsh-pm-proto-role', 'dsh-pm-review',
    ],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'dag',
    label: 'DAG 面板',
    root: '[data-panel="dag"]',
    shard: `${SHELL}/panels/dag.ts`,
    prefixes: [
      'dsh-pm-dag', 'dsh-pm-report-dag', 'dsh-pm-report-step',
      'dsh-pm-report-table', 'dsh-pm-report-evidence', 'dsh-pm-report-sec-title',
      'dsh-pm-report-zero',
    ],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base', 'tokens', 'shared', 'styles/dag.ts（画布本体，不在本次范围）'],
    tailIn: [],
  },
  {
    id: 'dialogue',
    label: '对话面板',
    root: '[data-panel="dialogue"]',
    shard: `${SHELL}/panels/dialogue.ts`,
    prefixes: [
      'dsh-pm-avatar', 'dsh-pm-b-flag', 'dsh-pm-bubble', 'dsh-pm-chat',
      'dsh-pm-cmsg', 'dsh-pm-dialogue', 'dsh-pm-long', 'dsh-pm-msg', 'dsh-pm-who',
    ],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base（`.dsh-pm-msg[hidden]` 隐藏契约）', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'verify',
    label: '验收面板',
    root: '[data-panel="verify"]',
    shard: `${SHELL}/panels/verify.ts`,
    prefixes: [
      'dsh-pm-cov', 'dsh-pm-ev-list', 'dsh-pm-h-note', 'dsh-pm-h-ver',
      'dsh-pm-hist-row', 'dsh-pm-nh-flag', 'dsh-pm-rtm', 'dsh-pm-ver-sum',
      'dsh-pm-verdict', 'dsh-pm-verify', 'dsh-pm-vitem', 'dsh-pm-vsheet',
      'dsh-pm-src-tag',
    ],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base', 'tokens', 'shared', 'panels/docs.ts（表语汇沿用）'],
    tailIn: [],
  },
  {
    id: 'token',
    label: 'Token 面板',
    root: '[data-panel="token"]',
    shard: `${SHELL}/panels/token.ts`,
    prefixes: ['dsh-pm-tok', 'dsh-pm-token-panel', 'dsh-pm-opt', 'dsh-pm-nosnap', 'dsh-pm-callout'],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
  {
    id: 'prompts',
    label: '提示词面板',
    root: '[data-panel="prompts"]',
    shard: `${SHELL}/panels/prompts.ts`,
    prefixes: [
      'dsh-pm-chips', 'dsh-pm-frag', 'dsh-pm-inj', 'dsh-pm-iso', 'dsh-pm-np',
      'dsh-pm-pp', 'dsh-pm-prompt', 'dsh-pm-prompts', 'dsh-pm-specvs', 'dsh-pm-sv',
    ],
    serves: ['FR-1', 'FR-2', 'FR-4'],
    dependsOn: ['base', 'tokens', 'shared'],
    tailIn: [],
  },
]

/** 公共层分片（不许写只服务一个组件的取值）。 */
export interface PublicShardEntry {
  readonly id: 'base' | 'tokens' | 'shared'
  readonly shard: string
  /** 它只许写什么（人读用）。 */
  readonly allows: string
}

export const PUBLIC_SHARDS: readonly PublicShardEntry[] = [
  { id: 'base', shard: `${SHELL}/base.ts`, allows: '⓪ 基底：面板包装器 / `[hidden]` / 折叠块合上必须藏（岛级规则）' },
  { id: 'tokens', shard: `${SHELL}/tokens.ts`, allows: '① 壳体与设计令牌：所有组件共同前提的取值' },
  { id: 'shared', shard: `${SHELL}/shared.ts`, allows: '⑤ 公共件 + ⑫–⑱ 收口层：宽选择器、跨 ≥2 个组件的成组规则、逐条白名单的公共件' },
]

/** 拼接出口（对外名字与顺序不变）。 */
export const REPORT_EXPORT = `${SHELL}/report.ts`

/**
 * 类名归属：类名 === 前缀，或以前缀 + 「-」起头。
 *
 * 为什么要「+「-」」这条：`dsh-pm-stat`（band 的三格）与 `dsh-pm-stats`（band 的状态带容器）
 * 是同一族的两个名字，朴素 `startsWith` 会让前者吞掉后者；同理 `dsh-pm-tab` 吞 `dsh-pm-tabs`。
 */
export function ownsClass(prefix: string, className: string): boolean {
  if (className === prefix) return true
  return className.startsWith(prefix) && className.charAt(prefix.length) === '-'
}

/** 类名属于哪个（哪些）组件——一个类名可以同时被多个前缀命中（那它就落在组件的重叠区，门禁按「多个」处理）。 */
export function componentsOfClass(className: string): ComponentId[] {
  const out: ComponentId[] = []
  for (const c of COMPONENT_MANIFEST) {
    if (c.notOwned?.some(e => e.name === className)) continue
    if (c.prefixes.some(p => ownsClass(p, className))) out.push(c.id)
  }
  return out
}

/** 前缀例外（人读 / 门禁自检用）。 */
export const NOT_OWNED: readonly { readonly id: ComponentId; readonly name: string; readonly why: string }[] =
  COMPONENT_MANIFEST.flatMap(c => (c.notOwned ?? []).map(e => ({ id: c.id, name: e.name, why: e.why })))
