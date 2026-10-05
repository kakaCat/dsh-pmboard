/**
 * 系统记录屏的**纯逻辑**（REQ-261004103330-005f t14 / 设计 `frontend.md` 屏 3）。
 *
 * 纪律与 `limits.ts` / `storage.ts` 同款：**零 DOM、零 IO、零时间**——输入是服务端给的数据，
 * 输出是"该显示什么"的视图模型；渲染在 `render/records.ts`，DOM 只在 `controller.ts` 里碰。
 *
 * ## 三条不许越界的口径（都来自上游裁定，见 `notes/t2-upstream-notes.md`）
 *
 * 1. **丢事件计数两个口径永不相加**：进程内 = "现在还在丢"（红字，可行动）；已落盘 = "历史累计"（灰字）。
 * 2. **档案损坏不是白屏**：服务端返回 `ok:false + invalid:true`，本屏红字说明原因与路径，其余屏不受影响。
 * 3. **陈旧要红字，但不给合并入口**：本设计**不做合并**——只提示"重启前请重跑迁移"。
 *
 * ## 一条"不编"的纪律
 *
 * `confirmedBy`（谁确认的）**有就显示、没有就不显示**。迁移事件的这个字段在生产路径上暂时取不到
 * （脚本 CLI 没有对应参数，见 `notes/findings.md` 发现 G）——**不拿"系统"或"未知"去填**，
 * 那会让人以为留痕是全的。
 *
 * @module dsh-pmboard/client/settings/records
 */

import type { SystemRecordInvalidView, SystemRecordView, SystemStoresView, SystemSummaryView } from './types.ts'
import type { SettingsShellEvent } from './model.ts'

export type Tone = 'ok' | 'warn' | 'error' | 'plain'

/** 时间线上的一条（`history[]` 的元素被翻译成人话）。 */
export interface TimelineEntry {
  readonly at: string
  /** 原始事件名（保留，便于排查时对日志）。 */
  readonly event: string
  readonly title: string
  readonly tone: Tone
  readonly lines: readonly string[]
  /** 触发者留痕（`confirmedBy`）：**有才给**，没有就不显示。 */
  readonly by?: string
}

export interface PathRow {
  readonly label: string
  readonly value: string
}

export interface CompatView {
  readonly consistent: boolean
  readonly lines: readonly string[]
  /** 不一致时的重建指引（不许硬读旧表）。 */
  readonly rebuildHint?: string
}

export interface DroppedRow {
  readonly label: string
  readonly text: string
  readonly tone: Tone
}

export type RecordsMode = 'loading' | 'error' | 'invalid' | 'ready'

export interface RecordsPaneModel {
  readonly mode: RecordsMode
  /** 取数失败的人话（仅 mode='error'）。 */
  readonly errorText?: string
  /** 档案损坏的红字（含"不自动重建"的处置说明）。 */
  readonly invalidText?: string
  /** 陈旧红字（条数或迁移时刻判出来的）。 */
  readonly staleText?: string
  readonly updatedAt?: string
  /** 当前生效后端的人话。 */
  readonly activeText?: string
  /** 记录文件自身的路径（原型「记录文件 · 路径」行）。 */
  readonly systemFilePath?: string
  /** 插件版本与构建指纹（原型「本安装版本」行：`dsh-pmboard 0.1.0 · build …`）。 */
  readonly pluginVersion?: string
  readonly pluginBuildStamp?: string
  /** 记录建档时刻（原型「初始化」行括号里的"本记录创建于…"；拿不到就不编）。 */
  readonly recordedAt?: string
  readonly timeline: readonly TimelineEntry[]
  readonly paths: readonly PathRow[]
  readonly compat: CompatView
  readonly dropped: readonly DroppedRow[]
  /**
   * 记录文件的**原始 JSON**（缩进 2 空格）。
   *
   * 为什么要它：人说「打开配置文件，应该是系统文件 json、路径等信息」——分组信息是"我们的解读"，
   * 而人有时要看**文件里到底写了什么**（对账、报障、怀疑我们解读错）。给一份原文最省事。
   * 拿不到就不给这个键（渲染层据此不显示那一段），**绝不编**。
   */
  readonly rawJson?: string
}

/** 对象取值的安全包装（服务端字段在客户端是 `Record<string, unknown>`，逐处判型避免运行时炸）。 */
function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function backendName(v: unknown): string {
  return v === 'sqlite' ? 'SQLite' : v === 'json' ? 'JSON 分片' : String(v ?? '未知')
}

/** 时间线上"谁确认的"一行：**没有就返回 undefined**（不编）。 */
function confirmedByText(v: unknown): string | undefined {
  const cb = obj(v)
  if (cb === undefined) return undefined
  const at = str(cb.at)
  const channel = str(cb.channel)
  const parts: string[] = []
  if (channel !== undefined) parts.push(channel === 'board-confirm' ? '看板确认' : channel)
  if (at !== undefined) parts.push(at)
  if (parts.length === 0) return undefined
  return '人已确认（' + parts.join(' · ') + '）'
}

/** 事件 → 人话标题 + 细节（未知事件如实标出，不硬套成已知种类）。 */
function entryOf(raw: Record<string, unknown>): TimelineEntry | undefined {
  const at = str(raw.at)
  const event = str(raw.event)
  if (at === undefined || event === undefined) return undefined
  const by = confirmedByText(raw.confirmedBy)
  const withBy = (e: Omit<TimelineEntry, 'by'>): TimelineEntry => (by === undefined ? e : { ...e, by })

  switch (event) {
    case 'startup': {
      const requirements = num(raw.requirements)
      return withBy({
        at, event, title: '启动', tone: 'plain',
        lines: [
          '后端：' + backendName(raw.backend) + (str(raw.source) !== undefined ? '（来源：' + String(raw.source) + '）' : ''),
          ...(requirements !== undefined ? ['需求：' + String(requirements) + ' 条'] : []),
          ...(obj(raw.detected)?.staleSqlite === true ? ['检出陈旧库（重启前需重跑迁移）'] : []),
        ],
      })
    }
    case 'upgrade': {
      const from = obj(raw.from)
      const to = obj(raw.to)
      return withBy({
        at, event, title: '插件升级', tone: 'ok',
        lines: [
          ...(from !== undefined && to !== undefined
            ? [String(from.version ?? '?') + ' → ' + String(to.version ?? '?')]
            : []),
          ...(from !== undefined && to !== undefined
            ? ['构建 ' + String(from.buildStamp ?? '?') + ' → ' + String(to.buildStamp ?? '?')]
            : []),
        ],
      })
    }
    case 'migration': {
      const ok = raw.result === 'ok'
      const requirements = num(raw.requirements)
      const duration = num(raw.durationMs)
      return withBy({
        at, event,
        title: ok ? '迁移到 SQLite' : '迁移失败',
        tone: ok ? 'ok' : 'error',
        lines: [
          ...(requirements !== undefined ? ['条数：' + String(requirements)] : []),
          ...(duration !== undefined ? ['耗时：' + String(duration) + ' ms'] : []),
          ...(str(raw.backupDir) !== undefined ? ['备份：' + String(raw.backupDir)] : []),
          ...(str(raw.windowKey) !== undefined ? ['窗口：' + String(raw.windowKey)] : []),
          ...(str(raw.error) !== undefined ? ['原因：' + String(raw.error)] : []),
        ],
      })
    }
    case 'backend-switched': {
      const to = raw.to
      return withBy({
        at, event,
        title: to === 'json' ? '回滚到 JSON 分片' : '切换到 SQLite',
        tone: to === 'json' ? 'warn' : 'ok',
        lines: [
          backendName(raw.from) + ' → ' + backendName(to),
          ...(str(raw.reason) !== undefined ? ['原因：' + String(raw.reason)] : []),
          ...(raw.keptOtherStore === true ? ['另一侧数据保留不删'] : []),
        ],
      })
    }
    case 'settings-invalid':
      return withBy({
        at, event, title: '设置项被作废', tone: 'warn',
        lines: [
          String(raw.key ?? '?') + '：' + String(raw.reason ?? '未给原因'),
          '回落：' + String(raw.fellBackTo ?? '未说明'),
        ],
      })
    default:
      return withBy({ at, event, title: '未知事件：' + event, tone: 'plain', lines: [] })
  }
}

/** 时间线（保持记录里的**追加顺序** = 时间顺序）。 */
export function timelineOf(record: SystemRecordView | undefined): readonly TimelineEntry[] {
  const history = record?.history ?? []
  const out: TimelineEntry[] = []
  for (const raw of history) {
    const parsed = obj(raw)
    if (parsed === undefined) continue
    const entry = entryOf(parsed)
    if (entry !== undefined) out.push(entry)
  }
  return out
}

/** 数据路径档案（实际解析值；备份目录是数组，逐个列出）。 */
export function pathArchiveOf(record: SystemRecordView | undefined): readonly PathRow[] {
  const paths = record?.paths
  const rows: PathRow[] = []
  const push = (label: string, v: unknown): void => {
    const s = str(v)
    if (s !== undefined) rows.push({ label, value: s })
  }
  push('分片数据根', paths?.shardDataRoot)
  push('SQLite 库', paths?.sqliteFile)
  push('设置文件', paths?.settingsFile)
  push('旧单册', paths?.legacyLedger)
  const backups = paths?.backupDirs
  if (Array.isArray(backups)) {
    backups.forEach((b, i) => push(backups.length > 1 ? '备份目录 ' + String(i + 1) : '备份目录', b))
  }
  return rows
}

/**
 * 版本一致性核对（FR-16）。
 *
 * 两条判据：① 记录里的一致性结论（服务端算好的）；② 库结构版本与插件声明的库结构版本对不上。
 * 任一不成立即"不一致"，并给**重建库**的指引——**不许硬读旧表**。
 */
export function compatOf(record: SystemRecordView | undefined): CompatView {
  const compat = record?.compat ?? {}
  const consistentRaw = compat.consistent === true
  const current = str(compat.currentPluginVersion) ?? str(record?.plugin?.version)
  const last = obj(compat.lastMigrationBy)
  const pluginSqliteSchema = num(record?.plugin?.sqliteSchemaVersion)
  const upgrades = Array.isArray(compat.upgrades) ? compat.upgrades : []
  const lines: string[] = []
  if (current !== undefined) lines.push('当前插件版本：' + current)
  if (last !== undefined) {
    lines.push('最近一次迁移由：' + String(last.pluginVersion ?? '?') + '（' + String(last.at ?? '?') + '）')
  } else {
    lines.push('最近一次迁移：无记录')
  }
  lines.push('升级历史：' + String(upgrades.length) + ' 次')
  lines.push('库结构版本：' + String(pluginSqliteSchema ?? '未知'))
  const consistent = consistentRaw
  if (consistent) return { consistent, lines }
  return {
    consistent,
    lines,
    rebuildHint: '版本不一致：请**重建库**（迁移会先备份旧库再全量重建）——不得硬读旧表，否则可能把数据读坏。',
  }
}

/**
 * 陈旧判定（FR-13）：与**服务端同一口径**（分片条数 > 库条数）。
 *
 * 为什么客户端也要算一遍：档案可能刚被迁移窗口改过，而看板手里的摘要稍旧——
 * 两处都算、任一命中即红字，宁可多提示一次"重启前重跑迁移"，也不要让人带着陈旧库重启。
 * `sqlite.stale` 由服务端算好时优先采信它。
 */
export function stalenessTextOf(stores: SystemStoresView | undefined): string | undefined {
  const sqlite = stores?.sqlite
  if (sqlite?.stale === true) {
    return '库已陈旧：重启前请重跑迁移'
      + (typeof sqlite.staleReason === 'string' && sqlite.staleReason.length > 0 ? '（' + sqlite.staleReason + '）' : '')
  }
  const shards = num(stores?.shards?.requirements)
  const lib = num(sqlite?.requirements)
  if (shards !== undefined && lib !== undefined && shards > lib) {
    return '库已陈旧：重启前请重跑迁移（分片 ' + String(shards) + ' 条，库 ' + String(lib) + ' 条）'
  }
  return undefined
}

/** 从系统记录里取体检快照（`GET /settings/system` 的 `stores` 是 `Record<string, unknown>`）。 */
export function storesOfRecord(record: SystemRecordView | undefined): SystemStoresView | undefined {
  const stores = obj(record?.stores)
  if (stores === undefined) return undefined
  return stores as SystemStoresView
}

/** 丢事件计数：**两个口径分别给、永不相加**。 */
export function droppedRowsOf(summary: SystemSummaryView | undefined): readonly DroppedRow[] {
  const rows: DroppedRow[] = []
  const now = num(summary?.droppedEvents)
  if (now !== undefined && now > 0) {
    rows.push({ label: '本次运行', text: '已丢弃 ' + String(now) + ' 条事件（记录文件可能不可写）', tone: 'warn' })
  }
  const total = num(summary?.droppedEventsTotal)
  if (total !== undefined && total > 0) {
    rows.push({ label: '累计', text: '历史累计丢弃 ' + String(total) + ' 条', tone: 'plain' })
  }
  return rows
}

/** 档案损坏的红字（服务端刻意不 500；这里要给出人能照做的处置）。 */
export function invalidTextOf(summary: SystemSummaryView | undefined): string | undefined {
  if (summary?.ok !== false) return undefined
  const reason = str(summary.reason) ?? '记录文件无法解析'
  const path = str(summary.path)
  return '系统记录文件损坏：' + reason + (path !== undefined ? '（' + path + '）' : '')
    + '。不自动重建；改名或删除该文件后重启，会新建一份。'
}

export interface RecordsInput {
  readonly record?: SystemRecordView | SystemRecordInvalidView
  readonly summary?: SystemSummaryView
  /**
   * 系统记录文件自身的路径（来自 GET /settings 摘要的 system.paths.systemFile）。
   * 记录内容里没有这个字段——文件不记自己叫什么；别再去 record.paths 里找。
   */
  readonly systemFilePath?: string
  readonly loading?: boolean
  /** 取数失败的人话（与"档案损坏"是两件事：这是**读不到**，那是**读到了但内容坏**）。 */
  readonly error?: string
}

/** 组装整屏视图模型（渲染层只管把它铺成 HTML）。 */
export function recordsPaneModelOf(input: RecordsInput): RecordsPaneModel {
  const emptyCompat: CompatView = { consistent: true, lines: [] }
  if (input.error !== undefined && input.error.length > 0) {
    return {
      mode: 'error', errorText: input.error, timeline: [], paths: [], compat: emptyCompat,
      dropped: droppedRowsOf(input.summary),
    }
  }
  const record = input.record
  // 损坏形态（`ok:false`）与"还没取到"要分开：前者要红字 + 处置，后者才是加载中
  if (record !== undefined && record.ok === false) {
    const invalid = record as SystemRecordInvalidView
    const path = str(invalid.path)
    return {
      mode: 'invalid',
      invalidText: '系统记录文件损坏：' + String(invalid.reason ?? '记录文件无法解析')
        + (path !== undefined ? '（' + path + '）' : '')
        + '。不自动重建；改名或删除该文件后重启，会新建一份。',
      timeline: [], paths: [], compat: emptyCompat, dropped: droppedRowsOf(input.summary),
    }
  }
  if (record === undefined || record.ok !== true) {
    return {
      mode: 'loading', timeline: [], paths: [], compat: emptyCompat,
      dropped: droppedRowsOf(input.summary),
      ...(invalidTextOf(input.summary) !== undefined ? { invalidText: invalidTextOf(input.summary) } : {}),
    }
  }
  const full = record as SystemRecordView
  const stores = storesOfRecord(full) ?? input.summary?.stores
  const stale = stalenessTextOf(stores)
  const active = obj(full.active)
  const plugin = obj(full.plugin)
  // 路径来源：调用方显式给的（状态里那份摘要值）→ 摘要 → 都没有就留空（渲染成未知，不编）
  const sysPath = input.systemFilePath ?? input.summary?.paths?.systemFile
  // 原始 JSON：序列化失败（理论上不会，视图对象是纯数据）也不抛——宁可少一段，不炸整屏
  let rawJson: string | undefined
  try {
    rawJson = JSON.stringify(full, null, 2)
  } catch {
    rawJson = undefined
  }
  return {
    mode: 'ready',
    ...(sysPath !== undefined ? { systemFilePath: sysPath } : {}),
    ...(rawJson !== undefined ? { rawJson } : {}),
    ...(str(plugin?.version) !== undefined ? { pluginVersion: String(plugin?.version) } : {}),
    ...(str(plugin?.buildStamp) !== undefined ? { pluginBuildStamp: String(plugin?.buildStamp) } : {}),
    ...(str(plugin?.recordedAt) !== undefined ? { recordedAt: String(plugin?.recordedAt) } : {}),
    ...(str(full.updatedAt) !== undefined ? { updatedAt: String(full.updatedAt) } : {}),
    ...(active !== undefined
      ? { activeText: '当前生效：' + backendName(active.backend) + '（自 ' + String(active.since ?? '?') + '，来源 ' + String(active.source ?? '?') + '）' }
      : {}),
    ...(stale !== undefined ? { staleText: stale } : {}),
    timeline: timelineOf(full),
    paths: pathArchiveOf(full),
    compat: compatOf(full),
    dropped: droppedRowsOf(input.summary),
  }
}

/**
 * 系统记录取数的**编排**（唯一的"有动作"函数，但它不碰 DOM：DOM 由注入的 `dispatch` 做）。
 *
 * 为什么放这里而不是控制器：控制器的行数上限只够"接线"（t14 接手时它已 387 行）。
 * 怎么保证仍然是纯的：本函数不 import 任何 DOM/网络——取数能力由 `api` 注入，
 * 状态迁移由 `dispatch` 注入；测试可以拿两个替身把整条链路跑一遍。
 */
export function makeSystemRecordLoader(input: {
  readonly api: { fetchSystemRecord?: () => Promise<SystemRecordView | SystemRecordInvalidView> }
  readonly dispatch: (event: SettingsShellEvent) => void
}): () => Promise<void> {
  return async (): Promise<void> => {
    if (input.api.fetchSystemRecord === undefined) {
      // 通道没装就**如实说**，不假装读取成功、也不留一个永远转的 loading
      input.dispatch({ kind: 'record-fail', message: '系统记录通道未装配（fetchSystemRecord 缺失）' })
      return
    }
    input.dispatch({ kind: 'record-start' })
    try {
      // **形状归一**（2026-10-04 实测）：宿主这条接口回的是**包了一层**的外壳
      // `{ ok, record: { …真记录… }, paths, historyTotal, … }`，真记录在 `record` 里。
      // 以前把外壳当记录喂下去：`plugin/history/compat/stores` 全读不到（界面一片「未知」），
      // 而更糟的是**一旦形状不被识别，界面就永远停在「正在读取…」**——永不收敛的加载态。
      // 故这里显式归一：有 `record` 就用它；既不像记录、也认不出外壳 → 如实报错，**不许挂在那儿转**。
      const payload = await input.api.fetchSystemRecord() as unknown as Record<string, unknown>
      const inner = payload['record']
      const rec = (inner !== null && typeof inner === 'object') ? inner : payload
      if (rec === null || typeof rec !== 'object' || !('schemaVersion' in (rec as object) || 'plugin' in (rec as object))) {
        input.dispatch({ kind: 'record-fail', message: '读取系统记录失败：服务端返回的形状不认识（' + Object.keys(payload).slice(0, 6).join(',') + '）' })
        return
      }
      input.dispatch({ kind: 'record-ok', record: rec as never })
    } catch (err) {
      const message = (err as { message?: string } | undefined)?.message ?? String(err)
      input.dispatch({ kind: 'record-fail', message: '读取系统记录失败：' + message })
    }
  }
}
