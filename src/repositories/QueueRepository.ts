/**
 * 队列文件仓储（REQ-260927202051-f6df · S-4 / I-2 / FR-1, FR-4）。
 *
 * 队列文件 = 某需求的**任务唯一存储**：`<workspaceRoot>/docs/requirements/<REQ>/queue.json`。
 * 本文件是队列文件 I/O 的**唯一入口**（读/写/路径），实现三件事：
 *
 * 1. **原子写**：复用 `adapters/旧单册适配器（已删除）.ts` 导出的 `persistAtomic`
 *    （临时文件 → fsync → rename）。**不另造第二套原子写**——两套实现必然在
 *    "谁先 fsync、谁负责 mkdir、失败时 temp 残留" 上漂移，而原子性是**断电才暴露**的性质，
 *    漂移不会在测试里露头。
 * 2. **写前校验**：`validateQueueFile` 不通过 → 抛 `QUEUE_VALIDATION_FAILED` 且**一个字节都不落盘**
 *    （校验必须先于任何 mkdir/临时文件创建，否则"校验失败但目录已被创建"会让调用方误判状态）。
 * 3. **坏文件隔离**：JSON 解析失败 → 改名 `<file>.corrupt-<ts>` + 告警 + 返回 `undefined`（降级，
 *    不拖垮宿主）。**只有解析失败才隔离**：校验失败不隔离——那是"内容不合规"而不是"文件损坏"，
 *    改名会毁掉用户还能手工修的数据。
 * 4. **读侧宽容**（REQ-261005193546-1b1a · t10 / design/migration.md §兼容期行为、§风险 ④ 对策 1）：
 *    校验失败**不再**把整条队列判成不可用（`return undefined` 会被上层 `listByRequirement`
 *    摊成 `[]` ⇒ 存量只读需求读作 0 张、看板空白）——降级为告警 + **继续返回队列**；
 *    返回对象的派生字段按**当前判据内存重算**（`ready` = `liveReadyTasks`、活卡
 *    `layer`/`layers` = `liveLayers` / `layerInputOf`），**一个字节都不写盘**。
 *    写路径（`save`）不受影响：**仍强校验、fail-closed**。
 *
 * 与 `TaskStore`（端口，t5）的分工：本文件只认"需求 → 一个 QueueFile"，不做缓存、不做任务级 CRUD、
 * 不推导派生视图。缓存与任务语义在 `QueueTaskStore`。这样迁移脚本（t13）可以只依赖本文件写队列，
 * 不被迫拉起带缓存的 TaskStore。
 *
 * @module dsh-pmboard/repositories/QueueRepository
 */
import { readFile, readdir, rename } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { persistAtomic } from './atomicWrite.js'
import { REQUIREMENTS_DIR, QUEUE_FILENAME, queueRelativePath } from '../domain/queue/queuePath.js'
import { computeLayers } from '../domain/queue/topology.js'
import type { QueueFile, QueueLayer, QueueTask, ValidationIssue } from '../domain/queue/QueueTypes.js'
import { isIssueLevel, validateQueueFile } from '../domain/queue/validateQueue.js'
import { layerInputOf, liveLayers, liveReadyTasks, liveTasksOf } from '../domain/status/Predicates.js'

/**
 * 路径与文件名常量的**单一事实源在 domain**（`src/domain/queue/queuePath.ts`）。
 *
 * 这里只做**再导出**：既有调用方（`tests/queue/*`、迁移脚本等从本模块 import 的历史写法）
 * 继续可用，但**实现只有一份**——application 层（`Decompose` 返回体的 `queue_file`）直接
 * import domain 那份，不再就地拼字符串。
 * （REQ-260927202051-f6df · Lead 裁决「单一事实源，不留两份路径拼法」）
 */
export { REQUIREMENTS_DIR, QUEUE_FILENAME, queueRelativePath }

/** 队列相关错误码（design/interfaces.md「错误码」）。 */
export const QUEUE_ERROR = {
  /** 对无队列的需求执行写操作（写不隐式建档）——由 TaskStore.mutate 抛。 */
  NOT_FOUND: 'QUEUE_NOT_FOUND',
  /** 队列 JSON 解析失败（已隔离改名）。 */
  CORRUPTED: 'QUEUE_CORRUPTED',
  /** V-1~V-6 未通过。 */
  VALIDATION_FAILED: 'QUEUE_VALIDATION_FAILED',
  /** 读文件失败（非"不存在"，如权限/IO 错误）。 */
  READ_FAILED: 'QUEUE_READ_FAILED',
  /** 写入失败（权限/磁盘满）。 */
  WRITE_FAILED: 'WRITE_FAILED',
} as const

/** 构造带 `code` 的错误（本仓约定：`Object.assign(new Error(msg), { code })`）。 */
function codedError(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra })
}

/**
 * 合并两轮校验的条目（去重：规则 + 路径 + 消息 + 级别 全同者只报一次）。
 *
 * 顺序 = 先"落盘视图"（操作者能直接去改的东西）后"重算后视图"（读路径真正返回的东西）。
 */
function mergeIssues(a: readonly ValidationIssue[], b: readonly ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  const out: ValidationIssue[] = []
  for (const issue of [...a, ...b]) {
    const key = `${issue.rule}|${issue.path ?? ''}|${issue.message}|${issue.level ?? 'issue'}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(issue)
  }
  return out
}

export interface QueueRepositoryOptions {
  /** 工作区根（默认 `process.cwd()`，与 FileDocRepository 同口径）。 */
  workspaceRoot?: string
  /**
   * 需求目录解析器（注入点）：默认 `<root>/docs/requirements/<REQ>`。
   * 迁移脚本与测试用它把队列写到别处（如临时副本目录），不必伪造工作区结构。
   */
  requirementDirOf?: (requirementId: string) => string
  /** 告警通道（默认 `console.warn`；测试可注入收集器断言"确实告警了"）。 */
  onWarn?: (message: string) => void
}

/** 队列文件 I/O 端口（I-2）。 */
export interface QueueRepository {
  /**
   * 读取并解析（+ V-1~V-6 校验）。
   *
   * 不存在 / 损坏（JSON 解析失败）→ `undefined`（不抛错）；
   * **校验失败 → 告警 + 继续返回队列**（读侧宽容，REQ-261005193546-1b1a · t10），
   * 返回对象的派生字段按当前判据内存重算、**一个字节都不写盘**。
   */
  load(requirementId: string): Promise<QueueFile | undefined>
  /** 校验后原子写；校验失败抛 `QUEUE_VALIDATION_FAILED` 且不落盘。 */
  save(requirementId: string, file: QueueFile): Promise<void>
  /** 队列文件**绝对路径**（I/O 与错误信息用）。 */
  pathOf(requirementId: string): string
  /**
   * 枚举工作区内**存在需求目录**的需求 id（`docs/requirements/REQ-*` 的目录名）。
   *
   * 存在的理由：TaskStore 的 `listAll()`（看板首屏跨需求任务集合）与 `get(taskId)`
   * 的兜底索引都需要"有哪些需求"，这是文件系统层的事实，不该让上层 `readdir` 各写一遍。
   * **只返回目录**（忽略文件与测试残留）；目录不存在 → 空数组（不抛错）。
   * 返回**已排序**（字典序），因此调用方拼接结果天然稳定。
   */
  listRequirementIds(): Promise<readonly string[]>
  /**
   * 队列文件**工作区相对路径**（返回体 `queue_file` / 日志用）。
   *
   * 注意：这是**规范路径**（`docs/requirements/<REQ>/queue.json`），与 `requirementDirOf`
   * 注入无关。测试/迁移把队列写到临时目录时，`pathOf` 才是实际落点——别用本方法的返回值
   * 去反推 `pathOf`。
   */
  relativePathOf(requirementId: string): string
  /** 工作区根。 */
  workspaceRoot(): string
}

export class JsonQueueRepository implements QueueRepository {
  private root: string
  private readonly requirementDirOf: (requirementId: string) => string
  private readonly onWarn: (message: string) => void

  constructor(options: QueueRepositoryOptions = {}) {
    this.root = options.workspaceRoot ?? process.cwd()
    this.requirementDirOf = options.requirementDirOf ?? ((requirementId) => join(this.root, REQUIREMENTS_DIR, requirementId))
    this.onWarn = options.onWarn ?? ((message) => console.warn(message))
  }

  workspaceRoot(): string {
    return this.root
  }

  /**
   * 动态校正工作区根（REQ-260929210741-30ae FR-5）：与 FileDocRepository.setWorkspaceRoot
   * 同口径——queue.json 与 docs 产物必须同根，两处走同一解析链（support.ts 的
   * syncWorkspaceRootFromExec 同时校正两者）。无会话上下文时保持构造值不变。
   */
  setWorkspaceRoot(root: string): void {
    if (typeof root === 'string' && root.length > 0 && root !== this.root) {
      this.root = root
    }
  }

  relativePathOf(requirementId: string): string {
    return queueRelativePath(requirementId)
  }

  pathOf(requirementId: string): string {
    const dir = this.requirementDirOf(requirementId)
    const abs = isAbsolute(dir) ? dir : join(this.root, dir)
    return join(abs, QUEUE_FILENAME)
  }

  /**
   * 枚举 `docs/requirements/` 下的需求目录（只认 `REQ-` 前缀的**目录**）。
   *
   * 说明：枚举**始终扫描规范目录** `<workspaceRoot>/docs/requirements`，
   * 与 `requirementDirOf` 注入无关（注入只影响单个需求的读写落点）。
   * 结果排序后返回——上层（`listAll`）直接拼接即可得到稳定顺序。
   */
  async listRequirementIds(): Promise<readonly string[]> {
    const dir = join(this.root, REQUIREMENTS_DIR)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return [] // 目录不存在/不可读：视为"没有需求"，不是错误
    }
    return entries
      .filter((e) => e.isDirectory() && /^REQ-/.test(e.name))
      .map((e) => e.name)
      .sort()
  }

  async load(requirementId: string): Promise<QueueFile | undefined> {
    const file = this.pathOf(requirementId)
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return undefined // 未拆分的需求：不是错误
      throw codedError(QUEUE_ERROR.READ_FAILED, `读取队列失败 ${file}：${(error as Error).message}`, { cause: error })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      // 损坏隔离：改名挪走（best effort），告警，降级返回 undefined。
      const quarantined = `${file}.corrupt-${Date.now()}`
      try {
        await rename(file, quarantined)
        this.onWarn(`[queue] 队列 JSON 解析失败，已隔离：${file} → ${quarantined}（${(error as Error).message}）`)
      } catch (renameError) {
        this.onWarn(`[queue] 队列 JSON 解析失败且隔离失败：${file}（解析：${(error as Error).message}；隔离：${(renameError as Error).message}）`)
      }
      return undefined
    }

    // 读侧宽容（design/migration.md §风险 ④ 对策 1 / design/backend.md §兼容与零迁移）：
    //    校验失败**不再** `return undefined`——上层 `QueueTaskStore.listByRequirement` 会把
    //    `undefined` 摊成 `[]`，于是"存量 `ready[]` 陈旧"这一个可自愈的派生值差异，会把整份队列
    //    读成 0 张任务（看板空白）。改为：告警 + 继续返回队列。
    //    校验跑两轮、都只用于**上报**（读路径不再有"判不可用"这个出口）：
    //    - 落盘视图：陈旧派生值在这里现形（V-5 漏就绪 = warning 级，t10 分档）
    //    - 重算后视图：读路径真正返回的对象（design/interfaces.md §3.3：校验输入 = 重算后视图）
    const onDisk = parsed as QueueFile
    // 唯一的例外：**根不是 JSON 对象**（null / 数组 / 标量）——那根本不是一个队列文件，
    // 拿不出 `tasks` 也拿不出任何字段，与"解析失败"同类 ⇒ 仍降级为 undefined。
    // （宽容的边界是"对象形状的队列文件"，不是"把任何 JSON 都当成队列"。）
    if (onDisk === null || typeof onDisk !== 'object' || Array.isArray(onDisk)) {
      this.onWarn(
        `[queue] 队列根不是 JSON 对象（${Array.isArray(onDisk) ? '数组' : onDisk === null ? 'null' : typeof onDisk}），按不可用处理：${file}`,
      )
      return undefined
    }
    // 第二个例外（同样是"宽容的边界"问题，不是放宽校验）：`tasks` 里混入**非对象**条目时保持旧行为。
    // 理由是可证伪的：下游 `QueueTaskStore` 的 `toRecord`（`structuredClone` + `delete copy.layer`）
    // 与 `get`（`t.id`）对 `null` / 数字条目**当场抛**——"读成 0 张"至少是降级，"读成崩溃"是更大的伤害。
    // 宽容的对象是"**对象形状**的任务卡内容不合规"，而不是"把类型垃圾交给上层"。
    const taskEntries = (onDisk as { tasks?: unknown }).tasks
    if (Array.isArray(taskEntries) && taskEntries.some((t) => t === null || typeof t !== 'object' || Array.isArray(t))) {
      this.onWarn(`[queue] 队列 tasks 含非对象条目（V-1 报"任务必须是对象"），按不可用处理：${file}`)
      return undefined
    }
    const view = this.recomputeDerived(onDisk)
    const reports = mergeIssues(validateQueueFile(onDisk).issues, validateQueueFile(view).issues)
    if (reports.length > 0) {
      const issueCount = reports.filter(isIssueLevel).length
      this.onWarn(
        `[queue] 队列未通过校验（issue ${issueCount} 条 / warning ${reports.length - issueCount} 条），读侧降级为告警并继续返回队列（派生字段按当前判据内存重算，不写盘）：${file} —— ${reports
          .slice(0, 5)
          .map((i) => `${i.rule}${i.level === 'warning' ? '(warning)' : ''}@${i.path ?? '-'} ${i.message}`)
          .join(' | ')}`,
      )
    }
    return view
  }

  /**
   * 读侧派生字段**内存重算**（REQ-261005193546-1b1a · t10 / design/interfaces.md §3.3）。
   *
   * 落盘的 `ready[]` / `tasks[].layer` / `layers` 都是**派生视图**，各自有时效窗口
   * （`ready` 只在下一次写事务刷新；`layer` 已裁定为历史派生值）⇒ 读路径一律按**当前判据**现算：
   *
   * - `ready`  = `liveReadyTasks`（就绪判据单点：取消卡不再钉死下游）
   * - 活卡层号 = `liveLayers`（`= computeLayers(layerInputOf(tasks))`：删掉指向取消卡的边后重算）
   * - `layers` = `layerInputOf` + `computeLayers` 的分组（只含活卡；与上一条**同一次推导口径**）
   *
   * ⚠️ 四条边界（改这里之前先读完）：
   * 1. **只用于本次返回对象与校验输入，一个字节都不写盘**（FR-6：读取前后逐字节一致）。
   *    重算结果与磁盘不同**也不许**回写——那是迁移，本需求明令不做。
   * 2. **取消卡的 `layer` 不动**（保留取消时刻的冻结值）：`liveLayers` 只含活卡，
   *    取不到层号即保持磁盘原值。
   * 3. **不抛错**：畸形条目（null / 非对象 / 无字符串 id）原样保留、交给 V-1；
   *    活卡子图成环时 `computeLayers` 会抛 `CIRCULAR_DEPENDENCY` ⇒ 保持磁盘派生值不动，由 V-6 上报。
   * 4. `edges` **不在此重算**（忠实展开全部依赖，V-3 靠它检出悬空；与落盘一致）；
   *    但 `tasks[].dependsOn` 会**剪掉指向已取消卡的边**（D-8），否则与压实的层号自相矛盾。
   */
  private recomputeDerived(file: QueueFile): QueueFile {
    // 根形状先收窄（`JSON.parse` 可能是 null / 数组 / 标量）——读路径绝不抛错，交 V-1 报。
    if (file === null || typeof file !== 'object' || Array.isArray(file)) return file
    const rawTasks = (file as unknown as { tasks?: unknown }).tasks
    if (!Array.isArray(rawTasks)) return file // 无任务可言（V-1 会报）：不做任何推测

    // 只把"形状可用于推导"的条目喂给判据单点（id 必须是字符串：`layerInputOf` 的前置约束）。
    const usable = rawTasks.filter(
      (t): t is QueueTask =>
        t !== null && typeof t === 'object' && !Array.isArray(t) && typeof (t as { id?: unknown }).id === 'string',
    )

    let liveLayerOf: ReadonlyMap<string, number>
    let layers: QueueLayer[]
    let ready: string[]
    try {
      liveLayerOf = liveLayers(usable)
      layers = computeLayers(layerInputOf(usable) as unknown as Parameters<typeof computeLayers>[0])
      ready = liveReadyTasks(usable)
    } catch {
      return file // 活卡子图成环等：保持磁盘派生值（V-6 负责上报），读路径绝不抛错
    }

    // 活卡集合（用于剪边）：`dependsOn` 只保留指向活卡的边 ⇒ 与「层号按活卡压实」自洽。
    // 不加这一步，重算后视图会自相矛盾：`t-l` 层号重算为 0，但它仍写着 `dependsOn: ['t-c']`
    // （已取消卡）⇒ 被自己的 V-4 判成「layer=0 却有依赖 / 层号未随依赖递增」（t10 实测 2 条）。
    const liveIds = new Set(liveTasksOf(usable).map((t) => t.id))
    const tasks = rawTasks.map((t) => {
      const id = (t as { id?: unknown } | null)?.id
      if (typeof id !== 'string') return t
      const layer = liveLayerOf.get(id)
      if (layer === undefined) return t // 取消卡（或取不到层号）：保持磁盘原值（冻结）
      const src = t as QueueTask
      if (src.dependsOn === undefined) return { ...src, layer }
      return { ...src, layer, dependsOn: src.dependsOn.filter((d) => liveIds.has(d)) }
    }) as QueueTask[]

    return { ...file, tasks, layers, ready }
  }

  async save(requirementId: string, file: QueueFile): Promise<void> {
    // ① 路径与文件自述的需求必须一致——否则"写进 A 需求目录、内容声称是 B"会造出串档文件，
    //    而 V-1~V-6 只校验文件内部自洽（task.requirementId == file.requirement_id），检不出这个。
    if (file?.requirement_id !== requirementId) {
      throw codedError(
        QUEUE_ERROR.VALIDATION_FAILED,
        `队列文件 requirement_id(${String(file?.requirement_id)}) 与写入目标需求(${requirementId}) 不一致，拒绝落盘`,
        { issues: [{ rule: 'V-3', message: 'requirement_id 与写入路径不一致', path: 'requirement_id' }] },
      )
    }

    // ② 校验**先于**任何文件系统动作（连 mkdir 都不能先做）：否则校验失败会留下一个空目录，
    //    调用方"断言文件不存在"的检查会连带看到目录，状态判断跟着变复杂。
    const result = validateQueueFile(file)
    if (!result.passed) {
      throw codedError(
        QUEUE_ERROR.VALIDATION_FAILED,
        `队列校验未通过（${result.issues.length} 条）：${result.issues
          .slice(0, 5)
          .map((i) => `${i.rule}@${i.path ?? '-'} ${i.message}`)
          .join(' | ')}`,
        { issues: result.issues },
      )
    }

    // ③ 原子写：temp(同目录) → fsync → rename。失败时目标文件保持旧内容。
    const target = this.pathOf(requirementId)
    try {
      await persistAtomic(target, JSON.stringify(file, null, 2))
    } catch (error) {
      throw codedError(QUEUE_ERROR.WRITE_FAILED, `写入队列失败 ${target}：${(error as Error).message}`, { cause: error })
    }
  }
}
