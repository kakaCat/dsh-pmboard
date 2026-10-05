/**
 * 模板地址系统类型定义
 * Domain 局部结构类型，不 import shared
 *
 * ## 2026-10-03 对齐（B12 阶段①-a 的前置）：这些声明此前是**从未与实现对齐的桩**
 *
 * 症状：11 条类型错误常年挂在 `tsc` 里（`render.ts` 6 / `resolve.ts` 4 / 两个调用方 2），
 * 被"192 条既有类型错误"淹没，没人看；而它们其实是**真错**，不是噪音：
 *   · `AddressSectionInput` 只声明了 3 个字段，实际三处构造点都还传
 *     `requirement` / `currentTask` / `templateRoot`；
 *   · `UpstreamSource` 声明成 `{docKind, docPath}`，实际传的是**台账投影**（要被读 `artifacts`）；
 *   · `DocRef` 缺 `title`（`resolve.ts:80/86` 明明在构造它）；
 *   · `TemplateRef` 缺 `title` / `purpose`（`render.ts:48` 在读）；
 *   · `CurrentTaskRef` **根本没导出**，而 `resolve.ts:13` 在 import 它。
 *
 * 本次**只对齐类型、零行为变化**：把声明改成实现真正用的形状。
 *
 * ⚠️ **遗留缺陷（本次刻意不修，见 `resolve.ts:34`）**：`NODE_TEMPLATES` 声明是**数组**，
 * 而 `resolveNodeTemplates` 用 `NODE_TEMPLATES[stage]?.[cat]`（按字符串索引数组）取值 ⇒
 * 恒为 `undefined` ⇒ **地址段的「产出模板」块从不渲染**。修它 = 行为变化（模板块会开始出现），
 * 且 registry 里的条目只有 `relPath`、没有 `title`/`purpose`（渲染出来会是 `undefined`），
 * 属"半成品功能补完"，不属本次类型对齐。`TemplateRef.title/purpose` 因此声明为**可选**。
 */

/** 模板文件引用（相对 templates/ 的路径） */
export interface TemplateRef {
  /** 相对路径，如 'implementing/task-card.md' */
  relPath: string;
  /**
   * 指针标题（`render.ts:48` 读）。
   * 可选：registry 现有条目只填了 `relPath`——见文件头注的遗留缺陷。
   */
  title?: string;
  /** 一句话用途（`render.ts:48` 读）。可选，理由同上。 */
  purpose?: string;
  /** 模板用途描述（旧字段，保留兼容） */
  description?: string;
}

/** 文档类型引用 */
export interface DocRef {
  /** 文档类型：requirement/design/plan 等 */
  kind: string;
  /** 绝对路径（工作区相对） */
  path: string;
  /**
   * 人读名（`render.ts:53` 读）。
   * **必填**：`resolve.ts:80/86` 两处构造点都在填它（经 `kindTitle()` 折算）。
   */
  title: string;
}

/** 当前在制任务的最小引用（`resolveUpstreamDocs` 取 `cardDoc` 用） */
export interface CurrentTaskRef {
  id?: string;
  title?: string;
  cardDoc?: string;
}

/**
 * 上游数据源。
 *
 * 形状 = **台账投影**（不是"一个文档引用"）：`resolveUpstreamDocs` 只读 `artifacts`。
 * 整条 `RequirementRecord` 与同步窄投影 `RequirementFacts` 都满足它。
 */
export interface UpstreamSource {
  /** 已登记产物（`kind` / `path` / `stage` 都按可选处理：取不到不臆造地址）。 */
  artifacts?: readonly UpstreamArtifact[];
}

/**
 * 地址段所需的台账投影：`UpstreamSource` 再加"选当前任务卡"要用的 `id`/`category`。
 *
 * 整条 `RequirementRecord` 与同步窄投影 `RequirementFacts` 都满足它
 * （B12 阶段①-a 之所以能把 `addressSectionFor` 的形参从 `RequirementRecord` 收窄到本类型）。
 */
export interface AddressSource extends UpstreamSource {
  readonly id?: string;
  readonly category?: 'feature' | 'bug' | 'doc' | 'refactor' | 'spike' | 'chore';
}

/** 上游产物条目（只声明取地址要用的三个键）。 */
export interface UpstreamArtifact {
  kind?: string;
  path?: string;
  stage?: string;
}

/**
 * 地址段输入（节点注入时的参数）。
 *
 * 字段集以**三处构造点**为准：`idle-capture-actions.ts:38`、`h3-inject.ts:57`、
 * `node-input-package.ts:250`（三处形态一致）。
 */
export interface AddressSectionInput {
  /** 需求 ID（历史字段；现有调用点都由 `requirement.id` 取代，故可选保留） */
  requirementId?: string;
  /**
   * 需求类型。**可选**：两处调用点传的是 `requirement.category`（`RequirementCategory | undefined`），
   * `resolveNodeTemplates` 内部对 `undefined` 有缺省口径（回落 `DEFAULT_CATEGORY`）。
   */
  category?: 'feature' | 'bug' | 'doc' | 'refactor' | 'spike' | 'chore';
  /** 当前节点阶段 */
  stage: string;
  /** 台账投影（取上游产物地址用）；缺省 → 不列上游块。 */
  requirement?: UpstreamSource;
  /** 当前在制任务；缺省 → 不列任务卡。 */
  currentTask?: CurrentTaskRef;
  /** 模板根（**绝对路径**；非绝对由 `render.ts:normalizeRoot` 响亮抛错）。 */
  templateRoot: string;
}
