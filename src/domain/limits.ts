/**
 * 具名数值上限（REQ-47939a 返工：专门解决"魔法数字"）。
 *
 * 为什么要具名：`600000`/`30000`/`120`/`60_000` 这类字面量散在工具、用例、路由里时，
 * 读代码的人无法判断"这个数字是超时、是节流、还是上限"，改一处也不知道别处是否同源。
 * 具名之后：数值语义写在名字上，且**同一条上限只有一处定义**（INV-2 同理）。
 *
 * 边界：只收"有语义、会被多处引用或需要解释"的数值。纯粹的局部算术（如 1 个元素、
 * 下标偏移）不必进本文件。
 *
 * @module dsh-pmboard/domain/limits
 */

export const LIMITS = {
  /** 需求/任务标题最大长度（字符）。 */
  titleMax: 120,
  /** 一般文本字段最大长度（字符）。 */
  textMax: 4000,
  /** 产物路径最大长度（字符）。 */
  pathMax: 400,
  /** 验收证据条数下限/上限。 */
  evidenceMin: 1,
  evidenceMax: 20,
  /** 验收单每批弹框项数：缺省与上限（上限同时是弹框不超载的保护）。 */
  sheetBatchDefault: 5,
  sheetBatchMax: 10,
  /** done 凭证门的批量关闭节流窗口（毫秒）。 */
  doneThrottleMs: 60_000,
  /**
   * 挂起确认（pending confirm）有效期（毫秒）——REQ-261001154450-b918 FR-5。
   * 与 capture 拒绝留痕同口径（30 分钟）：陈旧挂起不得无限期拦住写路径。
   */
  pendingConfirmTtlMs: 30 * 60_000,
  /** 产物登记后未确认时的提醒延迟（毫秒）。 */
  confirmReminderMs: 30 * 60_000,
  /** 文字确认证据的有效时间窗（毫秒）。 */
  confirmEvidenceWindowMs: 60 * 60_000,
  /**
   * 弹框题干长度纪律（2026-09-17 用户实测：卡片限高、题干与选项共享滚动区——
   * 题干过长会把选项挤出可视区，用户表现为"不能选择"并取消）。
   */
  popupCriterionMax: 120,
  popupEvidenceMax: 160, // REQ-261001170807-06fd FR-3：40 字符装不下一条命令/路径，等于没给证据
  popupQuestionMax: 220,
  /** 推进事件链（REQ-4842fe FR-11/FR-12）：单飞锁 stale、连续 noop 熔断、父卡并发上限、单次调用步数上限。 */
  advanceLockStaleMs: 15 * 60_000,
  advanceNoopBreaker: 5,
  /** 同需求并行父卡上限（2026-09-28 用户裁定：3 → 10，原值偏紧致 t-29b629 类卡无法开工）。 */
  advanceMaxParallelParents: 10,
  advanceMaxStepsPerCall: 20,
  /** 工具超时（毫秒）：读类 / 写入类 / 需人弹框类。 */
  timeoutReadMs: 15_000,
  timeoutWriteMs: 30_000,
  /**
   * 需人弹框类超时（2026-09-23 用户裁定：统一 1 小时）——此前的 10 分钟对
   * 「人离开一会儿再回来确认」的场景太短，REQ-260923222557-d3b0 FR-5/FR-6。
   */
  timeoutInteractiveMs: 3_600_000,
  /** 验收单分批弹框超时（同上：用户裁定 1 小时），FR-5。 */
  timeoutSheetMs: 3_600_000,
  /** 孤儿回收超时阈值（毫秒）：子卡 in_progress 且无心跳超此时长 → 判定为孤儿，可被重新选中执行。 */
  orphanTimeoutMs: 3 * 60_000,
  /** 后台执行器心跳间隔（毫秒）：实施链运行时每隔此时长更新一次心跳，防止被误判为孤儿。 */
  heartbeatIntervalMs: 30_000,
  /**
   * 一轮的细节容量（合成单位 DU）——REQ-261002175818-80a8 FR-3。
   *
   * 语义：一次交付里「要同时记住并正确处置的独立决定」的上限。超了不是错误，是**风险**——
   * 软门禁只标红与给分批建议，不拒绝落库（用户 2026-10-02 裁定）。
   *
   * ⚠️ 缺省 16 是**待标定的假设值**（返回体里 `capacityNote.calibrated=false` 会如实标注）：
   * 标定闭环（预测 vs 实际 token 台账回归）已裁定另立需求，本需求不做。
   */
  roundDetailUnits: 16,
  /**
   * 阶段回合上限的可设范围（REQ-261004103330-005f FR-2）。
   *
   * 越界**不钳值**而是拒绝：静默把一个 0 钳成 1，会让人以为"我设的 0 生效了"——
   * 与"失败要响亮"直接冲突。
   */
  stageMaxRoundsMin: 1,
  stageMaxRoundsMax: 10_000,
  /** 合成权重：改一个文件 ≈ 1 DU（要打开、读懂、改对）。 */
  detailWeightPerFile: 1,
  /** 合成权重：一条验收锚点 ≈ 0.5 DU（要跑、要看结果）。 */
  detailWeightPerAnchor: 0.5,
  /** 合成权重：每 2000 字符实施描述 ≈ 1 DU（要读完并保持住）。 */
  detailCharsPerUnit: 2000,
  /** 体量三量的单值上限：防手滑写 999999 把判定撑爆（超上限 = 形态非法，不是超容量）。 */
  footprintValueMax: 100_000,
  /**
   * 超容量摘要的字符预算——REQ-261002175818-80a8（2026-10-04 复核后新增）。
   *
   * 为什么必须有界：批准弹框的题干总共只有 `popupQuestionMax`（220）字符，而摘要要拼进题干。
   * 复核实测无预算时「8 张卡 + 24 字符 key」能拼出 264 字符，会把批准文本挤爆。
   * 120 给题干正文留出约 100 字符——摘要只负责**点名与批数**，细节在提交返回体的 overCapacity 里。
   * 看板评论想要更长文本，由调用方显式传更大的 `maxChars`（不是把约束删掉）。
   */
  footprintSummaryMaxChars: 120,
} as const

/** 单文件行数上限（尺寸门禁用；与 tests/size-budget.test.ts 同源）。 */
export const MAX_FILE_LINES = 400
