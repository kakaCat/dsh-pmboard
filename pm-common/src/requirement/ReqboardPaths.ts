/**
 * reqboard 分片数据根路径约定（REQ-261002161439-277d · t1）——**路径格式的单一事实源**。
 *
 * ## 为什么放在 domain 层
 *
 * 数据根的布局（`<root>/requirements/<REQ>/record.json` 这一族事实）被两侧同时需要：
 * - **application 层**（用例要按需求算分片路径做定向读、要判冷热侧）；
 * - **repositories 层**（`RequirementShardRepository` 真正决定往哪落盘）。
 *
 * 两份各写一遍的后果是本仓反复吃过的那类**静默分歧**：一份改了另一份没改，症状是
 * 「写在这儿、读在那儿」，表现为看板静默空白。`domain/queue/queuePath.ts` 已有同款先例
 * （`queue.json` 的路径也只定义一次），本文件把同一纪律搬到新的分片布局上。
 *
 * ## 约束
 *
 * 纯数据 + 纯函数：**不 import 任何模块**（domain 最内层，见 `tests/layer-boundary.test.ts`），
 * 因此不用 `node:path`——分隔符恒为 `/`（与 `queuePath.ts` 同口径）。
 *
 * 设计依据：`design/architecture.md` §数据根与物理布局、`design/data-model.md` §热记录 / §追加日志 / §外置大对象。
 *
 * @module dsh-pmboard/domain/requirement/ReqboardPaths
 */

/** 数据根内的热侧需求目录名。 */
export const REQUIREMENTS_DIR = 'requirements'

/** 数据根内的冷侧（归档）目录名。 */
export const ARCHIVE_DIR = 'archive'

/** 全局小标量文件：`{ schemaVersion, revision, migrations[] }`（提交点之外唯一需要原子写的全局态）。 */
export const META_FILE = 'meta.json'

/** 每需求的**提交点**：热记录（标量 + 小对象 + 计数）。 */
export const RECORD_FILE = 'record.json'

/** 每需求的追加日志：评论（append-only，JSON Lines）。 */
export const COMMENTS_FILE = 'comments.jsonl'

/** 每需求的追加日志：状态流转 + 推进事件历史（append-only，JSON Lines）。 */
export const HISTORY_FILE = 'history.jsonl'

/** 每需求的整份改写对象：产物登记（确认时会**就地盖章**，故不能进追加日志）。 */
export const ARTIFACTS_FILE = 'artifacts.json'

/** 每需求的整份改写对象：拆分计划（含 tasks[]）。 */
export const PLAN_FILE = 'plan.json'

/** 每需求的整份改写对象：验收材料（含 evidence / sheet / sheetHistory）。 */
export const VERIFICATION_FILE = 'verification.json'

/** 每需求的整份改写对象：归档材料。 */
export const ARCHIVE_FILE = 'archive.json'

/**
 * 一条需求的**热侧文件清单**（7 个，顺序固定）。
 *
 * 顺序固定是为了让"遍历需求分片"的调用方（迁移脚本、回滚脚本、诊断工具）拿到稳定输出；
 * 改这个数组的顺序等于改契约（`design/data-model.md` 的布局表是它的文档侧对照）。
 */
export const REQUIREMENT_FILES: readonly string[] = [
  RECORD_FILE,
  COMMENTS_FILE,
  HISTORY_FILE,
  ARTIFACTS_FILE,
  PLAN_FILE,
  VERIFICATION_FILE,
  ARCHIVE_FILE,
]

/** 追加日志的两种类别（文件名与语义的映射只在这里定义一次）。 */
export type JournalKind = 'comments' | 'history'

/** 整份改写的外置对象四种（热记录之外的大字段）。 */
export type ObjectKind = 'artifacts' | 'plan' | 'verification' | 'archive'

/** 路径层错误码（模块内自足；适配器向上映射成 `REQBOARD_*` 传输码）。 */
export const PATHS_ERROR = {
  /** 需求 id 形态非法（含越权路径如 `../x`）——**拒绝拼路径**，不生成任何可用路径。 */
  INVALID_ID: 'REQBOARD_PATH_INVALID_ID',
} as const

/**
 * 需求 id 形态（与 `protocol.ts` 的两种代际一致）：
 * 新格式 `REQ-YYMMDDHHmmss-xxxx`（时间戳 + 4 位 hex）与旧格式 `REQ-xxxxxx`（6 位 hex）。
 *
 * 这条正则同时是**路径穿越防线**：`../escape`、`.`、空串、绝对路径都过不了，
 * 因而没有任何 id 能让下面的拼接函数跳出 `<root>/requirements/`。
 */
const REQUIREMENT_ID_RE = /^REQ-(?:\d{12}-[0-9a-f]{4}|[0-9a-f]{6})$/

/** 需求 id 是否合法（单一判据；别处不要再写第二份正则）。 */
export function isRequirementId(value: string): boolean {
  return REQUIREMENT_ID_RE.test(value)
}

/**
 * 该状态是否属于**冷侧**（数据搬去 `archive/`、不可写、不进默认载荷）。
 *
 * 口径来源：`design/architecture.md` §热冷分层。`done` 与 `archived` 同属冷侧——
 * `done` 的需求在流程上已是"交付完成"，与归档需求一样不该参与热侧读写。
 */
export function isColdStatus(status: string): boolean {
  return status === 'archived' || status === 'done'
}

/** 非法 id 的响亮拒绝（不静默退回某个默认路径——那会把数据写到别人档案里）。 */
function assertRequirementId(requirementId: string): string {
  if (!isRequirementId(requirementId)) {
    throw Object.assign(
      new Error(`需求 id 形态非法，拒绝拼接分片路径：${JSON.stringify(requirementId)}（期望 REQ-<12位时间戳>-<4位hex> 或 REQ-<6位hex>）`),
      { code: PATHS_ERROR.INVALID_ID },
    )
  }
  return requirementId
}

/**
 * `/` 拼接（无 `node:path`）。
 *
 * 只做一件事：去掉因首尾斜杠造成的重复分隔符。**不**做 `..` 归约——越权防护由
 * `assertRequirementId` 在入口拦住，悄悄归约反而会掩盖调用方传了脏路径。
 */
function joinPath(...parts: readonly string[]): string {
  return parts.filter((p) => p.length > 0).join('/').replace(/\/{2,}/g, '/')
}

/** 全局元数据文件路径。 */
export function metaPath(root: string): string {
  return joinPath(root, META_FILE)
}

/** 热侧需求目录（`<root>/requirements`）。 */
export function requirementsDir(root: string): string {
  return joinPath(root, REQUIREMENTS_DIR)
}

/** 冷侧目录（`<root>/archive`）。 */
export function archiveDir(root: string): string {
  return joinPath(root, ARCHIVE_DIR)
}

/**
 * 某需求的分片目录。
 *
 * `cold` 缺省 `false`（热侧）。**不做"哪边存在就用哪边"的自动探测**：调用方要么明确
 * 说自己要哪一侧（写路径必须明确热侧），要么用端口的 `get()` 让适配器按回落规则找。
 */
export function requirementDir(root: string, requirementId: string, opts: { cold?: boolean } = {}): string {
  const id = assertRequirementId(requirementId)
  return joinPath(opts.cold === true ? archiveDir(root) : requirementsDir(root), id)
}

/** 热记录路径（**提交点**）。 */
export function recordPath(root: string, requirementId: string, opts: { cold?: boolean } = {}): string {
  return joinPath(requirementDir(root, requirementId, opts), RECORD_FILE)
}

/**
 * 追加日志路径（`comments.jsonl` / `history.jsonl`）。
 *
 * 独立成函数而不是让调用方自己拼文件名：日志的**类别名 ↔ 文件名**映射只在这里存在，
 * 拼错文件名会静默产生"新日志"（读侧看不到旧评论）。
 */
export function journalPath(root: string, requirementId: string, kind: JournalKind, opts: { cold?: boolean } = {}): string {
  const file = kind === 'comments' ? COMMENTS_FILE : HISTORY_FILE
  return joinPath(requirementDir(root, requirementId, opts), file)
}

/** 外置大对象路径（`artifacts.json` / `plan.json` / `verification.json` / `archive.json`）。 */
export function objectPath(root: string, requirementId: string, kind: ObjectKind, opts: { cold?: boolean } = {}): string {
  const file = kind === 'artifacts' ? ARTIFACTS_FILE
    : kind === 'plan' ? PLAN_FILE
    : kind === 'verification' ? VERIFICATION_FILE
    : ARCHIVE_FILE
  return joinPath(requirementDir(root, requirementId, opts), file)
}

/**
 * 从需求目录名反推 id（目录枚举用：`listHotIds` / `listColdIds` 扫到的名字过这道筛）。
 *
 * 返回 `undefined` = 不是需求目录（临时目录、`.corrupt` 改名残留、手工放的文件），
 * 调用方应**跳过并告警**，而不是当成需求处理。
 */
export function requirementIdOfDirName(dirName: string): string | undefined {
  return isRequirementId(dirName) ? dirName : undefined
}
