/**
 * REQBOARD_* 大写错误码注册表（REQ-261007230908-5ccb FR-1 · 体检报告 G4）。
 *
 * ## 定位
 *
 * 大写码的**唯一事实源**：此前 130+ 个码散落一百多个文件作字符串字面量，无集中登记，
 * 「prompt 列的码 = 代码抛的码」无法机械检查。本模块是**登记层**——字面量产生点不迁移
 * （避免全仓大改），一致性由 tests/error-code-registry.test.ts 的双向硬门保证：
 * 扫描到的码必须已注册（新码漏注册即红），注册表条目必须仍在被抛（死条目即红）。
 *
 * ## 收录口径（D-1）
 *
 * 全集 = tests/helpers/error-code-scan.ts 的 scanErrorCodes().uppercase（口径唯一实现，
 * 本模块不另写扫描规则）。NOISE_TOKENS（REQBOARD_XXX 占位、标识符、目录名、数值常量、
 * env 后缀）与模板拼码 `REQBOARD_${...}` 一律不收。
 *
 * ## 使用纪律
 *
 * - 纯数据模块：**零 import**（client bundle 会打包它，见 toolviews/shared.ts 派生）；
 * - message 种子优先级：① toolviews/shared.ts 既有映射 ② throw 现场消息提炼；
 * - 条目按 code 字典序排列（降低多窗口并发追加的合并冲突面）；
 * - 新增码流程：先在代码里抛 → 跑守卫报红点名 → 回本表补条目。
 *
 * @module dsh-pmboard/shared/error-code-registry
 */

/** 码首个产生点所在分层（与体检报告 §3.2 分层口径一致）。 */
export type CodeLayer =
  | 'application'
  | 'domain'
  | 'tools'
  | 'client'
  | 'http'
  | 'adapters'
  | 'repositories'
  | 'shared'

/** 一个大写错误码的登记条目。 */
export interface ErrorCodeEntry {
  /** 码本体，形态 `REQBOARD_[A-Z0-9_]+`；全表唯一。 */
  readonly code: string
  /** 中文语义（给人看的「这是什么」），非空。 */
  readonly message: string
  /** 首个产生点所在分层。 */
  readonly layer: CodeLayer
}

/** 大写码注册表（按 code 字典序；守卫断言与扫描结果双向一致）。 */
export const REQBOARD_CODE_REGISTRY: readonly ErrorCodeEntry[] = [
  { code: 'REQBOARD_ACCEPTANCE_NOT_EXECUTABLE', message: '验收标准不可执行', layer: 'application' },
  { code: 'REQBOARD_ADOPT_ALREADY', message: '任务已有归属（重复认领）', layer: 'application' },
  { code: 'REQBOARD_ADOPT_DEPENDENCY', message: '认领会引入非法依赖', layer: 'application' },
  { code: 'REQBOARD_ADOPT_HAS_CHILDREN', message: '目标任务名下已有子卡', layer: 'application' },
  { code: 'REQBOARD_ADOPT_INVARIANT', message: '挂载后违反子卡不变量', layer: 'application' },
  { code: 'REQBOARD_ADOPT_PARENT_IS_SUBTASK', message: '父卡本身是子卡', layer: 'application' },
  { code: 'REQBOARD_ADOPT_STATUS', message: '当前状态不在子卡生命周期', layer: 'application' },
  { code: 'REQBOARD_ADVANCE_LOCKED', message: '实施链推进被锁定', layer: 'tools' },
  { code: 'REQBOARD_AGENT_REQUIRED', message: '需要由执行窗口的 agent 调用', layer: 'adapters' },
  { code: 'REQBOARD_ALREADY_DECOMPOSED', message: '需求已拆分落库', layer: 'application' },
  { code: 'REQBOARD_ALREADY_EXISTS', message: '记录已存在', layer: 'application' },
  { code: 'REQBOARD_ARTIFACT_NOT_CONFIRMED', message: '产物未确认', layer: 'application' },
  { code: 'REQBOARD_ARTIFACT_NOT_OPENABLE', message: '产物无法打开核验', layer: 'application' },
  { code: 'REQBOARD_AWAITING_MANUAL', message: '等待人工处置', layer: 'tools' },
  { code: 'REQBOARD_BAD_FOOTPRINT', message: '体量声明不合法', layer: 'domain' },
  { code: 'REQBOARD_BAD_REQUIREMENT_REF', message: '需求条款引用非法', layer: 'domain' },
  { code: 'REQBOARD_BAD_STATUS', message: '状态不允许', layer: 'application' },
  { code: 'REQBOARD_BRIDGE_NOT_READY', message: '桥接未就绪', layer: 'http' },
  { code: 'REQBOARD_BULK_CLOSE', message: '批量关卡被节流拦截', layer: 'application' },
  { code: 'REQBOARD_CHANGELOG_REQUIRED', message: '需要变更说明', layer: 'application' },
  { code: 'REQBOARD_COLD_IMMUTABLE', message: '终态记录不可变更', layer: 'application' },
  { code: 'REQBOARD_CONFIRM_PENDING', message: '确认阻塞', layer: 'application' },
  { code: 'REQBOARD_CONFLICT', message: '并发冲突', layer: 'application' },
  { code: 'REQBOARD_CORRUPT_SHARD', message: '分片数据损坏', layer: 'application' },
  { code: 'REQBOARD_CROSS_CARD', message: '跨卡操作被拒', layer: 'application' },
  { code: 'REQBOARD_CROSS_PROJECT_SEAT', message: '跨项目席位被拒', layer: 'application' },
  { code: 'REQBOARD_DECISION_ENTRY_INVALID', message: '裁定条目不合法', layer: 'application' },
  { code: 'REQBOARD_DECISION_LOG_MISSING', message: '裁定记录缺失', layer: 'application' },
  { code: 'REQBOARD_DEPENDENCY_GATE', message: '依赖门禁拦截', layer: 'domain' },
  { code: 'REQBOARD_DESIGN_CONTENT_GATE', message: '设计内容门禁拦截', layer: 'application' },
  { code: 'REQBOARD_DESIGN_COVERAGE_GATE', message: '设计覆盖度门禁拦截', layer: 'application' },
  { code: 'REQBOARD_DETAIL_MISMATCH', message: '详情数据不匹配', layer: 'client' },
  { code: 'REQBOARD_DETAIL_SETTLE_FAILED', message: '详情落账失败', layer: 'client' },
  { code: 'REQBOARD_DIRECT_HUMAN_REQUIRED', message: '需要直接人工回合', layer: 'adapters' },
  { code: 'REQBOARD_DISPATCH_FAILED', message: '实施链投递失败', layer: 'tools' },
  { code: 'REQBOARD_DIVE_ARMED', message: 'Dive 模式武装中（手动操作被锁）', layer: 'application' },
  { code: 'REQBOARD_DOCS_ROOT_SOURCE_INVALID', message: '文档根配置非法', layer: 'shared' },
  { code: 'REQBOARD_DOC_INCOMPLETE', message: '文档未交齐', layer: 'application' },
  { code: 'REQBOARD_DRIVER_REQUIRED', message: '需要驱动回合', layer: 'adapters' },
  { code: 'REQBOARD_EVIDENCE_FAKE', message: '证据不合法', layer: 'application' },
  { code: 'REQBOARD_EVIDENCE_MISSING', message: '验收证据缺失', layer: 'application' },
  { code: 'REQBOARD_FILE_CONFLICT', message: '任务卡文件声明冲突', layer: 'application' },
  { code: 'REQBOARD_FILE_MISSING', message: '文件不存在', layer: 'application' },
  { code: 'REQBOARD_HANDOFF_CONFIG_INVALID', message: '交接配置非法', layer: 'shared' },
  { code: 'REQBOARD_HANDOFF_NO_CONTEXT', message: '交接缺上下文依据', layer: 'application' },
  { code: 'REQBOARD_HANDOFF_TARGET_INVALID', message: '交接目标窗口非法', layer: 'application' },
  { code: 'REQBOARD_HANDOFF_WRITE_FAILED', message: '交接底稿写盘失败', layer: 'application' },
  { code: 'REQBOARD_HUMAN_GATE', message: '人工闸门（agent 不可越过）', layer: 'application' },
  { code: 'REQBOARD_IMPLEMENTATION_COVERAGE_GATE', message: '实施覆盖度门禁拦截', layer: 'application' },
  { code: 'REQBOARD_INVALID_INPUT', message: '参数校验失败', layer: 'application' },
  { code: 'REQBOARD_INVALID_WORKSPACE', message: '工作区非法', layer: 'application' },
  { code: 'REQBOARD_IO_FAILED', message: '读写失败', layer: 'application' },
  { code: 'REQBOARD_JOURNAL_COUNT_EXCEEDS_LINES', message: '日志条数超行数上限', layer: 'domain' },
  { code: 'REQBOARD_JOURNAL_INVALID_COUNT', message: '日志条数读数非法', layer: 'domain' },
  { code: 'REQBOARD_JOURNAL_SEQ_MISMATCH', message: '日志序号不匹配', layer: 'domain' },
  { code: 'REQBOARD_MAX_INFLIGHT_INVALID', message: '并发上限配置非法', layer: 'shared' },
  { code: 'REQBOARD_MISSING_ARTIFACT', message: '缺阶段产物', layer: 'application' },
  { code: 'REQBOARD_MISSING_PLAN', message: '缺拆分计划', layer: 'application' },
  { code: 'REQBOARD_MISSING_PROTOTYPE', message: '缺原型产物', layer: 'application' },
  { code: 'REQBOARD_MISSING_REQUIRED_DOC', message: '缺类型必填文档', layer: 'application' },
  { code: 'REQBOARD_MUTATION_FAILED', message: '写台账失败（记录缺失或数据冲突）', layer: 'application' },
  { code: 'REQBOARD_NONBLOCK_UNAVAILABLE', message: '非阻塞通道不可用', layer: 'application' },
  { code: 'REQBOARD_NOT_AUTORUN', message: '非自动链模式', layer: 'tools' },
  { code: 'REQBOARD_NOT_BOUND_TO_WINDOW', message: '需求不属于本窗口', layer: 'application' },
  { code: 'REQBOARD_NOT_FOUND', message: '记录不存在', layer: 'application' },
  { code: 'REQBOARD_NOT_SUBTASK', message: '目标任务不是子卡', layer: 'application' },
  { code: 'REQBOARD_NO_BOUND_REQ', message: '窗口未绑定需求', layer: 'application' },
  { code: 'REQBOARD_NO_EVIDENCE', message: '无完工证据', layer: 'domain' },
  { code: 'REQBOARD_NO_REPORT', message: '无完工汇报', layer: 'domain' },
  { code: 'REQBOARD_NO_SEAT', message: '窗口无席位', layer: 'application' },
  { code: 'REQBOARD_NO_SHEET', message: '无验收单', layer: 'application' },
  { code: 'REQBOARD_NO_UI', message: '弹框通道不可用', layer: 'adapters' },
  { code: 'REQBOARD_OPEN_WINDOW_FAILED', message: '建会话失败', layer: 'application' },
  { code: 'REQBOARD_OPEN_WINDOW_UNAVAILABLE', message: '开窗能力不可用', layer: 'application' },
  { code: 'REQBOARD_OWNER_WINDOW_NOT_LIVE', message: '目标窗口不在线', layer: 'application' },
  { code: 'REQBOARD_PARENT_LIMIT', message: '父卡数量超限', layer: 'application' },
  { code: 'REQBOARD_PATH_INVALID_ID', message: '路径编号非法', layer: 'domain' },
  { code: 'REQBOARD_PLAN_CARD_MULTI_INTERFACE', message: '一卡声明多个接口', layer: 'application' },
  { code: 'REQBOARD_PLAN_COMPONENT_MAP_MISSING', message: '组件对照表缺失', layer: 'application' },
  { code: 'REQBOARD_PLAN_INTERFACE_MAP_MISSING', message: '接口对照表缺失', layer: 'application' },
  { code: 'REQBOARD_PLAN_MISMATCH', message: '落库任务与批准计划不一致', layer: 'application' },
  { code: 'REQBOARD_PLAN_NOT_APPROVED', message: '计划未批准', layer: 'application' },
  { code: 'REQBOARD_PROJECT_ROOT_MISMATCH', message: '项目根不匹配', layer: 'application' },
  { code: 'REQBOARD_PROTOTYPE_ANCHOR_MISSING', message: '原型锚点缺失', layer: 'application' },
  { code: 'REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED', message: '原型几何量无法复核', layer: 'application' },
  { code: 'REQBOARD_PROTOTYPE_PLACEHOLDER', message: '原型仍是空骨架', layer: 'application' },
  { code: 'REQBOARD_PROTOTYPE_VERSION_CONFLICT', message: '原型权威版本冲突', layer: 'application' },
  { code: 'REQBOARD_REQUIREMENT_NOT_FOUND', message: '需求不在台账中', layer: 'application' },
  { code: 'REQBOARD_REQUIRES_MIGRATION', message: '需要数据迁移', layer: 'http' },
  { code: 'REQBOARD_REQUIRES_SQLITE_MIGRATION', message: '需要 SQLite 迁移', layer: 'http' },
  { code: 'REQBOARD_REQ_NOT_FOUND', message: '需求不存在', layer: 'tools' },
  { code: 'REQBOARD_REQ_TERMINAL', message: '需求已终态', layer: 'tools' },
  { code: 'REQBOARD_RESULT_COVERAGE_MISSING', message: '逐项结果覆盖缺失', layer: 'application' },
  { code: 'REQBOARD_RESULT_EMPTY', message: '结果为空', layer: 'application' },
  { code: 'REQBOARD_RESULT_REF_DUPLICATE', message: '结果引用重复', layer: 'application' },
  { code: 'REQBOARD_RESULT_REF_INVALID', message: '结果引用非法', layer: 'application' },
  { code: 'REQBOARD_RESULT_UNANCHORED', message: '结果缺锚点', layer: 'application' },
  { code: 'REQBOARD_ROLLBACK_COMPENSATION_FAILED', message: '回退补偿失败（队列未归还）', layer: 'application' },
  { code: 'REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT', message: '回滚物化超上限', layer: 'application' },
  { code: 'REQBOARD_SEATS_MAX_INVALID', message: '席位上限配置非法', layer: 'shared' },
  { code: 'REQBOARD_SEAT_LIMIT', message: '席位已满', layer: 'application' },
  { code: 'REQBOARD_SEAT_NOT_OWNER', message: '非 owner 席位', layer: 'application' },
  { code: 'REQBOARD_SEAT_READONLY', message: '只读席位不可写', layer: 'application' },
  { code: 'REQBOARD_SETTINGS_INVALID', message: '设置项非法', layer: 'application' },
  { code: 'REQBOARD_SKILLS_ASSET_MISSING', message: '技能资产缺失', layer: 'adapters' },
  { code: 'REQBOARD_SKILLS_CONFIG_INVALID', message: '技能配置非法', layer: 'shared' },
  { code: 'REQBOARD_SKILLS_DISABLED', message: '技能开关关闭', layer: 'application' },
  { code: 'REQBOARD_SKILLS_INSTALL_FAILED', message: '技能投放失败', layer: 'tools' },
  { code: 'REQBOARD_SKILLS_UNKNOWN_SKILL', message: '未知技能名', layer: 'application' },
  { code: 'REQBOARD_SKILLS_WRITE_FAILED', message: '技能写盘失败', layer: 'adapters' },
  { code: 'REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED', message: '跳联调必须给理由', layer: 'shared' },
  { code: 'REQBOARD_SQLITE_SCHEMA_MISMATCH', message: 'SQLite schema 不匹配', layer: 'repositories' },
  { code: 'REQBOARD_STAGES_INVALID', message: '子卡段声明非法', layer: 'application' },
  { code: 'REQBOARD_STAGE_GATE_OVERDUE', message: '阶段门禁逾期', layer: 'application' },
  { code: 'REQBOARD_STAGE_ROUTING_INVALID', message: '子卡阶段路由非法', layer: 'domain' },
  { code: 'REQBOARD_STALE_BUILD', message: '构建产物过期', layer: 'domain' },
  { code: 'REQBOARD_STORE_INCONSISTENT', message: '台账数据不一致', layer: 'application' },
  { code: 'REQBOARD_SUBTASK_GATE', message: '子卡门禁拦截', layer: 'application' },
  { code: 'REQBOARD_SUBTASK_IN_PROGRESS', message: '子卡已被另一路认领（不重复派发）', layer: 'application' },
  { code: 'REQBOARD_SYSTEM_RECORD_INVALID', message: '系统记录非法', layer: 'adapters' },
  { code: 'REQBOARD_TASKS_REQUIRED', message: '缺任务表', layer: 'application' },
  { code: 'REQBOARD_TASK_INCOMPLETE', message: '任务卡不完整', layer: 'application' },
  { code: 'REQBOARD_TASK_NOT_BOUND', message: '任务不属于本窗口绑定需求', layer: 'application' },
  { code: 'REQBOARD_TASK_NOT_FOUND', message: '任务不存在', layer: 'application' },
  { code: 'REQBOARD_TEMPLATE_CONFLICT', message: '模板与 stages 声明冲突', layer: 'domain' },
  { code: 'REQBOARD_TEMPLATE_INVALID', message: '模板引用非法', layer: 'domain' },
  { code: 'REQBOARD_TESTING_COVERAGE_GATE', message: '测试覆盖门禁拦截', layer: 'application' },
  { code: 'REQBOARD_UNKNOWN_ROLLBACK_SEQ', message: '未知回滚序号', layer: 'application' },
  { code: 'REQBOARD_UNKNOWN_TICKET', message: '未知票据', layer: 'application' },
  { code: 'REQBOARD_UNLISTED_ACK_REQUIRED', message: '未列文件需显式豁免', layer: 'application' },
  { code: 'REQBOARD_VALIDATION_FAILED', message: '校验失败', layer: 'application' },
  { code: 'REQBOARD_VERIFICATION_INCOMPLETE', message: '验收材料不全', layer: 'application' },
  { code: 'REQBOARD_VERSION_MISMATCH', message: 'reqboard_accept_sheet 未执行：验收单版本不匹配（当前 v', layer: 'application' },
  { code: 'REQBOARD_WINDOW_BOUND', message: 'reqboard_create 未写入：本窗口已绑定进行中需求，勿重复立项', layer: 'application' },
  { code: 'REQBOARD_ZERO_OUTPUT_THRESHOLD_INVALID', message: '零输出阈值配置非法', layer: 'shared' },
]

/** 派生：码集合（机械派生，不手工另维护）。 */
export const REQBOARD_CODE_SET: ReadonlySet<string> = new Set(REQBOARD_CODE_REGISTRY.map(e => e.code))

/** 派生：按码查中文语义；未注册返回 undefined（纯查询，不抛错）。 */
export function errorCodeMessage(code: string): string | undefined {
  return REQBOARD_CODE_REGISTRY.find(e => e.code === code)?.message
}
