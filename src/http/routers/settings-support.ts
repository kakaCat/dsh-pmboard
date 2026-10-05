/**
 * settings 路由的**纯辅助**（REQ-261004103330-005f t8）——从 `settings.ts` 拆出来，只为尺寸门禁。
 *
 * 为什么单独一个文件：`http/routers/settings.ts` 一度到 452 行，超过本仓 `MAX_FILE_LINES = 400`
 * 的硬门禁。拆分的判据是"**有没有 ctx**"：本文件的函数要么是纯函数（形状/文案/解析），
 * 要么只吃 `RouterCtx['deps']` 而**不持有闭包状态**；留在 `settings.ts` 的才是真正需要
 * `ok/json/bad/readBody` 的处理器。
 *
 * @module dsh-pmboard/http/routers/settings-support
 */
import { createSystemFileOpener, type SystemFileOpenerPort } from '../../adapters/SystemFileOpener.js'
import { isAbsolute, join } from 'node:path'
import { SETTINGS_FILE_REL } from '../../application/settings/resolve-settings.js'
import { SYSTEM_HISTORY_MAX, SYSTEM_RECORD_FILE_REL } from '../../application/settings/events.js'
import { getBuildStamp } from '../../shared/build-stamp.js'
import type { SettingsStore, SystemRecordStore } from '../../application/ports.js'
import type { RouterCtx, StorageActionKind, StorageActionPort } from './shared.js'

/** 确认框的肯定/否定选项（唯一一处定义：文案与判定必须同源，否则"点了确认却判成取消"）。 */
export const CONFIRM_YES = '确认执行'
export const CONFIRM_NO = '取消'

/** 宿主级动作全集（校验用）。 */
export const ACTIONS: readonly StorageActionKind[] = ['switch-to-sqlite', 'switch-to-json', 'migrate']

export function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

export function codeOf(err: unknown): string | undefined {
  return (err as { code?: string } | undefined)?.code
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** `consume` 失败原因的人话（路由直接拼进 403 消息）。 */
export function reasonText(reason: string): string {
  switch (reason) {
    case 'unknown': return '票据不存在（或宿主重启后丢失）'
    case 'unsettled': return '票据存在但还没有人作答'
    // 否定作答与"没人答"是两件事：前者是人明确拒绝，后者是还没轮到人。混成一句会让排查者追错方向。
    case 'denied': return '人在确认框选了否定（取消 / 需要修改）'
    case 'expired': return '票据已过期'
    case 'consumed': return '票据已被消费（一次性票据不可重放）'
    default: return reason
  }
}

/** 确认框题干（≤120 字，避免把选项挤出可视区）。 */
export function questionTextFor(action: StorageActionKind): string {
  if (action === 'switch-to-json') {
    return '把台账存储切回 JSON 分片？切换后需重启宿主生效，SQLite 库文件保留不删。'
  }
  if (action === 'migrate') {
    return '由 Agent 执行台账迁移（备份 → 建库 → 迁移 → 校验 → 写设置）？失败会回滚，源数据不动。'
  }
  return '把台账存储切到 SQLite？迁移与校验由 Agent 执行，完成并重启宿主后生效。'
}

/** 从请求体解析动作：显式 `action` 优先，其次由 `backend` 派生。 */
export function actionFromBody(body: Record<string, unknown>): StorageActionKind | undefined {
  if (typeof body.action === 'string' && (ACTIONS as readonly string[]).includes(body.action)) {
    return body.action as StorageActionKind
  }
  if (body.backend === 'sqlite') return 'switch-to-sqlite'
  if (body.backend === 'json') return 'switch-to-json'
  return undefined
}

/** 插件版本载荷（FR-15）：读不到 `package.json` 就如实写 `unknown`——编一个版本号会让"我在跑哪份构建"永远查不清。 */
export function pluginPayloadOf(deps: RouterCtx['deps']): { name: string; version: string; buildStamp: string } {
  const info = deps.pluginInfo
  return {
    name: info?.name ?? 'dsh-pmboard',
    version: info?.version ?? 'unknown',
    buildStamp: getBuildStamp() ?? 'unstamped',
  }
}

/** 两个文件路径由 `dshHome` 派生（单一来源）；未装配 → `undefined`（响应里如实缺字段）。 */
export function filePathsOf(deps: RouterCtx['deps']): { settingsFile: string; systemFile: string } | undefined {
  const home = deps.dshHome
  if (home === undefined || home.length === 0) return undefined
  return { settingsFile: join(home, SETTINGS_FILE_REL), systemFile: join(home, SYSTEM_RECORD_FILE_REL) }
}

/**
 * 宿主级动作的**票据门槛**（t10：`switch` 与 `migrate` 共用同一口径）。
 *
 * 为什么抽出来而不是各写一遍：两处门槛必须**逐字同款**（缺失 / 不可用 / 否定 / 动作不符），
 * 各写一份必然漂移，而漂移的方向正是"某一条路径漏判否定作答"——那等于人工门被绕过。
 * 抛出的错误均带码（`confirmation_required` 走 403），由 `envelope.fail` 统一映射。
 */
export function assertStorageTicket(
  registry: StorageActionPort,
  ticket: string,
  wantAction: StorageActionKind,
  lead: string,
): void {
  if (ticket.length === 0) {
    throw coded('confirmation_required', lead + '：缺少人工确认票据。先 POST /settings/storage/request，由人确认后带 ticket 重试')
  }
  const consumed = registry.consume(ticket)
  if (!consumed.ok) {
    throw coded('confirmation_required', lead + '：人工确认票据不可用（' + reasonText(consumed.reason) + '）。请重新发起确认')
  }
  // 与 t8 同一口径的第二道：`consume` 成功 ≠ 人已同意（源头已判 denied，这里再兜一道）
  if (consumed.confirmed !== true) {
    throw coded('confirmation_required', lead + '：人工确认未通过（作答为否定）。未开窗、未投递、未写任何文件')
  }
  if (consumed.action !== wantAction) {
    throw coded('confirmation_required', lead + '：票据动作与请求不符（票据是 ' + consumed.action + '，本次需要 ' + wantAction + '）')
  }
}

/** 迁移底稿（投给新窗口的正文）：自带脚本路径、参数与四条硬要求，新窗口无需再问人。 */
export function migrationTaskText(input: { from: string; to: string; windowKey: string }): string {
  return [
    '【迁移任务】把需求台账从 JSON 分片搬进 SQLite 库（看板发起，人工已确认）。',
    '',
    '请在项目根目录执行：',
    '  npx tsx scripts/migrate-ledger-to-sqlite.ts --from ' + input.from + ' --to ' + input.to + ' --write-settings',
    '',
    '硬要求：',
    '1. 源分片目录**全程只读**（脚本已保证，不要手工去改它）；',
    '2. 只有脚本自己的校验（条数一致 + 抽样逐字段比对）通过后，才会写设置文件；',
    '3. 失败就如实报出退出码与原因，不要反复重试到"看着像成功"；',
    '4. 完成后汇报：退出码、迁移条数、备份目录、以及是否需要重启宿主才生效。',
    '',
    '（本窗口码：' + input.windowKey + '；任务由看板「存储与数据库」页在人工确认后发起。）',
  ].join('\n')
}

/**
 * 迁移开窗与投递的**机制**（t10 / FR-10）——路由只负责票据门槛，机制在这里。
 *
 * ## 为什么不用 `openWindow` 用例
 * 那个用例内部有 `deps.session.requireLiveDriver(exec)`，而 HTTP 路由**没有 exec**；
 * 故这里直接用端口（`windowOpener` + `crossWindowDeliver`），与 `reqboard_open_window` 的
 * 种子投递同一条路。
 *
 * ## 失败三态必须分得清（窗口有没有建成 / 任务有没有送到）
 * · `window_opener_unavailable`（503）：开窗能力未装配 —— 窗口没建成、任务没发出；
 * · `window_open_failed`（500）：建会话失败 —— 同上；
 * · `dispatch_failed`（502）：**窗口建成了但底稿没送到** —— 这句必须说清，否则人会以为白点了一下。
 *
 * ## 为什么不写系统记录事件（口径，2026-10-04 owner 裁定）
 * 事件种类只有五种（startup/upgrade/migration/backend-switched/settings-invalid），**没有**
 * "migration-requested"：事件的语义是"发生了什么"，不是"请求了什么"。本函数只发起、不记账；
 * 迁移**结果**由迁移脚本在结束时写 `migration` 事件。三个失败分支因此都不产生任何事件。
 */
export async function openMigrationWindow(input: {
  deps: RouterCtx['deps']
  settings: SettingsStore
  systemRecord: SystemRecordStore
  sessionId: string
}): Promise<{ windowKey: string; task: string }> {
  const deps = input.deps.applicationDeps
  const opener = deps?.windowOpener
  if (opener === undefined || !opener.available()) {
    throw coded('window_opener_unavailable', '迁移未发起：本宿主未装配会话开窗能力（sessionController 不可得）。**窗口没建成、任务没发出**，请在能开窗的宿主重试')
  }
  const deliver = deps?.crossWindowDeliver
  if (deliver === undefined) {
    throw coded('window_opener_unavailable', '迁移未发起：本宿主未装配跨窗口投递能力。**窗口没建成、任务没发出**')
  }

  // 源数据根取**系统记录里的实际路径**（每次启动刷新，是这一屏存在的意义）；
  // 记录不可读时**响亮失败**：算不出数据在哪，就不该猜着搬。
  let from: string
  try {
    from = (await input.systemRecord.read()).paths.shardDataRoot
  } catch (err) {
    throw coded('migration_paths_unknown', '迁移未发起：系统记录不可读（' + messageOf(err) + '），无法确定源数据根。先修复记录文件（看板「系统记录」屏有路径）或改名让宿主重建一份')
  }
  // `sqlitePath` 可能是相对的（未配 dshHome 时解析器就返回相对名）——有 dshHome 就补成绝对路径，
  // 因为底稿是给**另一个窗口**看的：它未必在同一个 cwd 下，相对路径会指到别处。
  const rawTo = input.settings.snapshot().storage.sqlitePath
  const to = isAbsolute(rawTo) || input.deps.dshHome === undefined ? rawTo : join(input.deps.dshHome, rawTo)
  if (from.length === 0) {
    throw coded('migration_paths_unknown', '迁移未发起：系统记录里没有源数据根（paths.shardDataRoot 为空）。先让宿主正常启动一次把路径档案写全')
  }

  // 落点：先按源会话解析项目；拿不到就用**台账同根**（组合根的 cwd）；都没有则响亮失败——
  // 绝不 `create()` 空参落进宿主 profile 目录（实测病灶：落到那儿的窗口随后写盘被 PROJECT_ROOT_MISMATCH 拒）。
  const target = (input.sessionId.length > 0 ? opener.resolveSourceProject?.(input.sessionId) : undefined)
    ?? (typeof input.deps.cwd === 'string' && input.deps.cwd.length > 0 ? { cwd: input.deps.cwd } : undefined)
  if (target === undefined) {
    throw coded('window_open_failed', '迁移未发起：拿不到新窗口的项目落点（源会话与工作区都不可得）。**不在宿主目录里静默建窗**，请在带会话上下文的窗口重试')
  }

  const opened = await opener.create(target)
  if (!opened.ok) {
    throw coded('window_open_failed', '迁移未发起：建会话失败（' + opened.reason + '）。**窗口没建成、任务没发出**')
  }

  const { message } = deliver.createMessage({
    text: migrationTaskText({ from, to, windowKey: opened.windowKey }),
    kind: 'ledger-migration',
  })
  const sent = await deliver.deliver(opened.windowKey, message)
  if (!sent.delivered) {
    throw coded('dispatch_failed', '迁移未发起：**窗口已建成**（' + opened.windowKey + '）但任务底稿**没有送达**（'
      + (sent.reason === undefined ? '原因未知' : sent.reason) + '）。可到该窗口让它手动重跑，或重新发起一次迁移')
  }
  return { windowKey: opened.windowKey, task: 'migrate-ledger-to-sqlite' }
}

  /**
   * 弹确认框并**在人的作答返回后落章**。
   *
   * 为什么 fire-and-forget（不 await）：`ask()` 会一直等人（上限一小时），而 HTTP 请求不能挂在那儿。
   * 落章发生在"作答"返回之后——作答来自 UI 通道，**不是这个请求**，所以"谁能落章"这条门槛没有被放宽。
   * 弹框失败 → 票据保持**未落章**，`consume` 必然拒绝（fail-closed），这里不吞语义、只吞异常。
   */
export function pushStorageConfirmBox(input: {
  deps: RouterCtx['deps']
  registry: StorageActionPort
  ticket: string
  action: StorageActionKind
  sessionId: string
}): boolean {
  const { registry, ticket, action, sessionId } = input
  const questions = input.deps.applicationDeps?.questions
  if (questions === undefined || !questions.available()) return false
  const text = questionTextFor(action)
  void questions
    .ask([{
      id: ticket,
      header: '存储后端切换',
      question: text,
      options: [{ label: CONFIRM_YES }, { label: CONFIRM_NO }],
    }], {})
    .then((answers) => {
      const a = answers[0]
      const selected = (a?.selected?.[0] ?? a?.custom ?? '').trim()
      registry.settleStorageAction(
        ticket,
        {
          confirmed: selected === CONFIRM_YES,
          advanced: false,
          ...(selected.length === 0 ? {} : { userChoice: selected }),
        },
        {
          channel: 'dialog-answer',
          ...(sessionId.length === 0 ? {} : { sessionId }),
          pluginVersion: pluginPayloadOf(input.deps).version,
        },
      )
    })
    .catch(() => {
      // 弹框通道抛错 = 这次没人作答：票据留在未落章，后续 consume 必然拒绝
    })
  return true
  }

/** 系统记录 history 的尾部条数：夹在 [1, 历史上限]（不另造一个数）。 */
export function historyLimitOf(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  return Math.min(Math.max(Number(raw) || 0, 1), SYSTEM_HISTORY_MAX)
}

/** 装配缺失的修法提示（唯一一处定义；三个 require 共用）。 */
export const WIRING_HINT =
  '修法：组合根构造 createReqboardHandler 时传 settings / systemRecord / storageActions（见 src/index.ts 装配期）'

/**
 * 三个"未装配就响亮失败"的取用器。
 *
 * 为什么不用可选链 + 兜底默认：缺装配是**组合根 bug**（本仓老教训：可选字段 + 运行期兜底会把
 * "装配漏了"从编译期挪到运行期）。这里统一 500 并点明"未装配 + 怎么修"，
 * **绝不**伪造一份空设置，也**绝不**伪造"已确认"。
 */
export function requireSettingsOf(deps: RouterCtx['deps']): SettingsStore {
  const s = deps.settings
  if (s === undefined) {
    throw coded('settings_store_unavailable', '运行设置端口未装配（组合根 bug）：设置不可读写。' + WIRING_HINT)
  }
  return s
}

export function requireSystemRecordOf(deps: RouterCtx['deps']): SystemRecordStore {
  const r = deps.systemRecord
  if (r === undefined) {
    throw coded('system_record_unavailable', '系统记录端口未装配（组合根 bug）：档案不可读写。' + WIRING_HINT)
  }
  return r
}

/**
 * 取文件路径选择端口（**可选**：缺省时由路由报 501 并提示可手输）。
 *
 * 为什么不做成 `require…`（像设置/系统记录那样直接抛）：宿主没接选择器**不是组合根 bug**——
 * 非 macOS 部署按设计就弹不出系统窗口。所以返回 `undefined` 让路由说清"可手动输入路径"。
 */
export function pickStoragePathOf(deps: RouterCtx['deps']): import('../../application/ports.js').StoragePathPickerPort | undefined {
  return deps.pickStoragePath
}

export function requireStorageActionsOf(deps: RouterCtx['deps']): StorageActionPort {
  const a = deps.storageActions
  if (a === undefined) {
    throw coded(
      'storage_actions_unavailable',
      '宿主级动作确认票据端口未装配（组合根 bug）：无法发起人工确认，因此也不能切换后端（绝不伪造"已确认"）。' + WIRING_HINT,
    )
  }
  return a
}

/**
 * `POST /settings/open-file` 的实现（REQ-261004103330-005f，2026-10-04）。
 *
 * 为什么走宿主：右侧栏那条通道只吃**工作区内**的文档，而这两份配置在 `~/.dsh/` 下，
 * 人点「打开配置文件」只会得到"打不开"（实测）。
 *
 * **白名单在宿主侧**：请求给了什么路径都不作数——只接受与宿主自己解析出的
 * `settingsFile` / `systemFile` **完全相等**的那一个；其余一律拒绝。
 * 否则这个接口就成了"让宿主打开任意文件"的把手。
 */
export type OpenConfigResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly code: 'not_allowed' | 'no_paths'; readonly message: string }
  | { readonly ok: false; readonly code: 'failed'; readonly path: string; readonly reason: string }

export async function openWhitelistedConfigFile(
  deps: RouterCtx['deps'],
  want: string,
  opener: SystemFileOpenerPort = createSystemFileOpener(),
): Promise<OpenConfigResult> {
  const allowed = filePathsOf(deps)
  if (allowed === undefined) {
    return { ok: false, code: 'no_paths', message: '打不开：宿主拿不到配置文件路径（组合根未装配 homeDir）' }
  }
  if (want !== allowed.settingsFile && want !== allowed.systemFile) {
    return { ok: false, code: 'not_allowed', message: '打不开：只允许打开设置文件或系统记录文件（收到的路径不在白名单里）' }
  }
  const outcome = await opener.open(want)
  return outcome.ok ? { ok: true, path: want } : { ok: false, code: 'failed', path: want, reason: outcome.reason }
}
