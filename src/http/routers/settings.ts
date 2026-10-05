/**
 * 运行设置路由（REQ-261004103330-005f t8 / FR-3、FR-4、FR-6、FR-11、FR-14）。
 *
 * ## 五条路由与它们的"谁能调"
 *
 * | 路由 | 语义 | 门槛 |
 * |---|---|---|
 * | `GET /settings` | 生效设置（逐项带来源）+ 插件版本 + 系统记录摘要 + 路径 | 无 |
 * | `PATCH /settings` | 改阶段回合上限 / 库路径 | 无（**刻意不收 `storage.backend`**） |
 * | `POST /settings/storage/request` | 建**待确认票据**并尝试弹框 | 无（这只是"问"，不是"答"） |
 * | `POST /settings/storage/switch` | 真正切后端 | **必须消费已落章且人已同意的票据** |
 * | `GET /settings/system` | 系统记录全量 | 无 |
 *
 * ## 两处必须写清楚的实现口径（来自 t7 / t2 的 upstream notes）
 *
 * ### ① 403 只能由 `consume` 判定，不能查"有没有挂起"
 *
 * storage-action 票据**刻意不进** `pendingForWindow`（宿主级动作不该拦住任何需求的写路径）。
 * 所以判定必须是 `consume(ticket)` 的三合一（已落章 + 未过期 + 未消费），**不能**写成
 * "没有挂起 → 403"——那会把合法票据一起拒掉，且理由与真实原因不符。
 *
 * ### ② `consume` 成功 ≠ 人已同意（本卡实测发现的 fail-open）
 *
 * t7 的 `consume` 只校验"outcome + stamp 都在"，**不校验 outcome 是肯定还是否定**：
 * 人在确认框里点「取消」同样会落章，于是 `consume` 返回 `ok:true` + `confirmed:false`。
 * 若路由只看 `ok` 就切库，**人点了取消也会切** —— 这是实打实的 fail-open。
 * 故本文件在 `consume` 之后**必须**再判 `r.confirmed === true`，否则 403 且不写任何文件。
 *
 * ## 组合根未装配时的行为
 *
 * 端口缺失是**组合根 bug**（本项目的老教训：可选字段 + 运行期兜底会把"装配漏了"从编译期挪到运行期）。
 * 这里选择**响亮 500** 并点明"未装配 + 怎么修"，**绝不**伪造空设置或"已确认"。
 *
 * @module dsh-pmboard/http/routers/settings
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { LIMITS } from '../../domain/limits.js'
import {
  stageLimitRangeText,
  validateRunSettingsPatch,
  type RunSettingsPatch,
  type StorageBackend,
} from '../../application/settings/resolve-settings.js'
import type { SystemEvent } from '../../application/settings/events.js'
import { SETTINGS_STORE_ERROR, type SettingsStore } from '../../application/ports.js'
import { SYSTEM_RECORD_INVALID } from '../../adapters/SystemRecordFile.js'
import {
  requireSettingsOf,
  requireStorageActionsOf,
  requireSystemRecordOf,
  actionFromBody,
  codeOf,
  coded,
  filePathsOf,
  historyLimitOf,
  isObject,
  messageOf,
  pluginPayloadOf,
  reasonText,
  assertStorageTicket,
  openMigrationWindow,
  pickStoragePathOf,
  pushStorageConfirmBox,
  openWhitelistedConfigFile,
} from './settings-support.js'
import type { RouterCtx, StorageActionKind } from './shared.js'

export function createSettingsRouter(ctx: RouterCtx) {
  const { ok, json, badInput, readBody } = ctx

  /**
   * 400 的本地包装——**为什么不用 `ctx.badInput` 直接判**：
   * 解构出来的常量拿不到 TypeScript 的 never 收窄（实测 4 处编译错误：`typeof x !== 'string'`
   * 守卫之后 `x` 仍是宽类型）。显式标注返回 `never` 的别名才触发收窄；它直接指向 `ctx.badInput`，
   * 信封与状态码一字不差（不是另写一个 400 构造器）。
   */
  const bad: (message: string) => never = badInput

  /**
   * 系统记录摘要：**损坏不 500**（t2 裁定）——档案设施坏掉不该让设置页白屏，
   * 但也不能静默当空：`invalid:true` + 可复制路径 + 一句可行动的指引。
   */
  async function systemSummary(): Promise<Record<string, unknown>> {
    const paths = filePathsOf(ctx.deps)
    const rec = ctx.deps.systemRecord
    if (rec === undefined) {
      return { ok: false, invalid: false, reason: '系统记录端口未装配（组合根 bug）', droppedEvents: 0 }
    }
    try {
      const r = await rec.read()
      return {
        ok: true,
        exists: true,
        updatedAt: r.updatedAt,
        events: r.history.length,
        active: r.active,
        plugin: r.plugin,
        compat: r.compat,
        stores: r.stores,
        // 两个口径都暴露、**永不相加**（t2 裁定）：进程内 = "现在还在丢"，已落盘 = 历史累计
        droppedEvents: rec.droppedEvents(),
        droppedEventsTotal: r.counters.droppedEvents,
        ...(paths === undefined ? {} : { paths: { ...paths, shardDataRoot: r.paths.shardDataRoot, sqliteFile: r.paths.sqliteFile } }),
      }
    } catch (err) {
      if (codeOf(err) !== SYSTEM_RECORD_INVALID) throw err
      const p = paths?.systemFile
      return {
        ok: false,
        invalid: true,
        reason: messageOf(err),
        ...(p === undefined ? {} : { path: p }),
        hint: '记录文件损坏' + (p === undefined ? '' : '：' + p) + '。不自动重建；改名或删除后重启会新建一份。',
        droppedEvents: rec.droppedEvents(),
      }
    }
  }

  // ── GET /settings ─────────────────────────────────────────────────────────
  async function handleGetSettings(res: ServerResponse): Promise<void> {
    const settings = requireSettingsOf(ctx.deps)
    const snap = settings.snapshot()
    const system = await systemSummary()
    // 「打开配置文件」按钮要知道文件到底在不在（FR-17 惰性创建：不存在是正常态）
    let fileExists = false
    try {
      fileExists = (await settings.readFile()) !== undefined
    } catch {
      // 文件损坏 → 视为"存在但不可读"：按钮可用（让人打开看坏在哪），真实原因在 system 摘要里
      fileExists = true
    }
    const paths = filePathsOf(ctx.deps)
    ok(res, {
      plugin: pluginPayloadOf(ctx.deps),
      stageMaxRounds: snap.stageMaxRounds,
      storage: snap.storage,
      problems: snap.problems,
      settingsFile: { exists: fileExists, ...(paths === undefined ? {} : { path: paths.settingsFile }) },
      system,
    })
  }

  // ── PATCH /settings ───────────────────────────────────────────────────────
  async function handlePatchSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const settings = requireSettingsOf(ctx.deps)
    const body = await readBody(req)

    const storageRaw = body.storage
    if (isObject(storageRaw) && storageRaw.backend !== undefined) {
      bad(
        '设置未写入：storage.backend 不能经 PATCH 修改——后端切换必须过人工确认门（FR-11）。'
        + '正确路径：先 POST /settings/storage/request 取票据，由人确认后带 ticket 调 POST /settings/storage/switch',
      )
    }

    const patch: RunSettingsPatch = {}
    if (body.stageMaxRounds !== undefined) {
      if (!isObject(body.stageMaxRounds)) bad('设置未写入：stageMaxRounds 需为对象（形如 {"implementing":800}）')
      patch.stageMaxRounds = body.stageMaxRounds as RunSettingsPatch['stageMaxRounds']
    }
    if (isObject(storageRaw) && storageRaw.sqlitePath !== undefined) {
      if (typeof storageRaw.sqlitePath !== 'string') bad('设置未写入：storage.sqlitePath 需为字符串')
      patch.storage = { sqlitePath: storageRaw.sqlitePath }
    }
    if (patch.stageMaxRounds === undefined && patch.storage === undefined) {
      // 空 PATCH 不做任何事：更**不建文件**——FR-17 的惰性创建不允许"空请求把文件写出来"
      bad('设置未写入：请求体没有任何可改的字段（可用 stageMaxRounds / storage.sqlitePath）')
    }

    const problems = validateRunSettingsPatch(patch)
    if (problems.length > 0) {
      bad('设置未写入：' + problems.map((p) => p.key + ' ' + p.reason).join('；')
        + '——请改成 ' + stageLimitRangeText() + ' 后重试')
    }

    try {
      const next = await settings.update(patch)
      ok(res, {
        stageMaxRounds: next.stageMaxRounds,
        storage: next.storage,
        problems: next.problems,
        restartRequired: next.storage.restartRequired,
      })
    } catch (err) {
      if (codeOf(err) === SETTINGS_STORE_ERROR.INVALID) bad(messageOf(err))
      throw err
    }
  }

  // ── POST /settings/storage/request ────────────────────────────────────────
  async function handleStorageRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const registry = requireStorageActionsOf(ctx.deps)
    const body = await readBody(req)

    const action = actionFromBody(body)
    if (action === undefined) {
      bad('未建票据：缺少 action（switch-to-sqlite / switch-to-json / migrate）或 backend（sqlite / json）')
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const rec = registry.registerStorageAction({ windowKey: sessionId, action })
    const delivered = pushStorageConfirmBox({ deps: ctx.deps, registry, ticket: rec.ticket, action, sessionId })
    ok(res, {
      ticket: rec.ticket,
      action,
      expiresAt: rec.createdAt + LIMITS.pendingConfirmTtlMs,
      delivered,
      ...(delivered ? {} : {
        hint: '弹框通道不可用：票据已建但**未落章**。请在能弹框的窗口发起确认，或等持票方从作答通道落章后再调 switch（未落章的票据调 switch 必被 403 拒绝）。',
      }),
    })
  }

  // ── POST /settings/storage/switch ─────────────────────────────────────────
  /**
   * 唯一允许写 `storage.backend` 的地方（见文件头注释②）。
   *
   * **为什么这里需要一次类型放宽**：t1 把 `storage.backend` 从 `RunSettingsPatch` 里移除了
   * （防"一个 PATCH 就换库"），但没有给"确认门之后的合法写入"留方法——适配器 `update()` 的合并
   * 语义本来就能写它，缺的只是类型通道。故此处**单点**放宽，并把前置条件写死在调用链上：
   * 本函数只允许在 `consume()` 成功**且** `confirmed === true` 之后调用。
   * （已在回报里提请裁定：端口应补 `updateStorageBackend(backend, by)` 这类显式方法，取代这处放宽。）
   */
  async function writeStorageBackend(settings: SettingsStore, backend: StorageBackend): Promise<void> {
    const patch = { storage: { backend } } as unknown as RunSettingsPatch
    await settings.update(patch)
  }

  async function handleStorageSwitch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const settings = requireSettingsOf(ctx.deps)
    const registry = requireStorageActionsOf(ctx.deps)
    const sys = requireSystemRecordOf(ctx.deps)
    const body = await readBody(req)

    const backend = body.backend
    if (backend !== 'json' && backend !== 'sqlite') bad('切换未执行：backend 只接受 json 或 sqlite')

    // ⓪ "已经在用这个后端" = 空操作：如实说清，且**必须排在 consume 之前**。
    //
    // 为什么顺序不能反：consume 是**一次性**消费，票据用了就作废。一次"没有可做的事"的请求
    // 若先把票据烧掉，人就得重新确认一遍——那不是谨慎，是折腾（而且会让人以为"我确认过了却没生效"）。
    // 为什么在接口层判、而不是只让前端不显示按钮：接口可能被直接调用（脚本 / 另一个窗口 / curl），
    // 契约得自己站得住。
    const effectiveBackend = settings.snapshot().storage.effective
    if (backend === effectiveBackend) {
      const name = effectiveBackend === 'sqlite' ? 'SQLite' : 'JSON 分片'
      bad('切换未执行：当前已在用 ' + name + '，无需切换。'
        + '若你刚改过设置但还没重启，请重启宿主使其生效（本进程仍在使用 ' + name + '）')
    }

    const ticket = typeof body.ticket === 'string' ? body.ticket.trim() : ''
    if (ticket.length === 0) {
      throw coded('confirmation_required', '切换未执行：缺少人工确认票据。先 POST /settings/storage/request，由人确认后带 ticket 重试')
    }

    // ① 票据三合一（已落章 + 未过期 + 未消费）——**只能**用 consume 判，不查"有没有挂起"
    const consumed = registry.consume(ticket)
    if (!consumed.ok) {
      throw coded('confirmation_required', '切换未执行：人工确认票据不可用（' + reasonText(consumed.reason) + '）。请重新发起确认')
    }
    // ② 第二道（源头那道在 PendingConfirmRegistry.consume 的 `denied`）：即使将来有人改坏 consume 的返回语义，
    //    这里也切不动后端。留着不是重复——是"同一条纪律的两道"。
    if (consumed.confirmed !== true) {
      throw coded('confirmation_required', '切换未执行：人工确认未通过（作答为否定）。未写任何文件、未切换后端')
    }
    // ③ 票据动作必须与本次请求一致（防止拿"切回 json"的票去切 sqlite）
    const wantAction: StorageActionKind = backend === 'sqlite' ? 'switch-to-sqlite' : 'switch-to-json'
    if (consumed.action !== wantAction) {
      bad('切换未执行：票据动作与请求不符（票据是 ' + consumed.action + '，本次请求是 ' + wantAction + '）')
    }

    // ④ 切到 SQLite 前必须先有数据：库不存在/空库 → 409（先走迁移），绝不让"空库"被当成现状
    if (backend === 'sqlite') {
      const rec = await sys.read()
      if (!rec.stores.sqlite.exists || rec.stores.sqlite.requirements === 0) {
        throw coded('sqlite_not_migrated', '切换未执行：SQLite 库里还没有数据。先走迁移（POST /settings/storage/migrate），完成后再切')
      }
    }

    const before = settings.snapshot().storage.effective
    await writeStorageBackend(settings, backend)

    const at = new Date(ctx.now()).toISOString()
    const reason = typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : undefined
    const event: SystemEvent = {
      at,
      event: 'backend-switched',
      from: before,
      to: backend,
      ...(reason === undefined ? {} : { reason }),
      // 另一侧存储**从不删除**（回滚靠它）——这条是硬事实，不是估计
      keptOtherStore: true,
      confirmedBy: {
        kind: 'human',
        at: new Date(consumed.by.at).toISOString(),
        channel: consumed.by.channel,
        ...(consumed.by.sessionId === undefined ? {} : { sessionId: consumed.by.sessionId }),
        pluginVersion: consumed.by.pluginVersion ?? pluginPayloadOf(ctx.deps).version,
      },
      plugin: { version: pluginPayloadOf(ctx.deps).version, buildStamp: pluginPayloadOf(ctx.deps).buildStamp },
    }
    await sys.append(event)

    ok(res, {
      backend,
      restartRequired: true,
      systemEvent: 'backend-switched',
      confirmedBy: consumed.by,
      from: before,
    })
  }

  // ── GET /settings/system ──────────────────────────────────────────────────
  async function handleGetSystemRecord(res: ServerResponse, url?: URL): Promise<void> {
    const rec = requireSystemRecordOf(ctx.deps)
    const paths = filePathsOf(ctx.deps)
    const rawLimit = url?.searchParams.get('limit') ?? undefined
    const limit = historyLimitOf(rawLimit)

    try {
      const r = await rec.read()
      const history = limit === undefined ? r.history : r.history.slice(-limit)
      ok(res, {
        ok: true,
        record: { ...r, history },
        historyTotal: r.history.length,
        droppedEvents: rec.droppedEvents(),
        droppedEventsTotal: r.counters.droppedEvents,
        ...(paths === undefined ? {} : { paths }),
      })
    } catch (err) {
      if (codeOf(err) !== SYSTEM_RECORD_INVALID) throw err
      const p = paths?.systemFile
      // 200 + invalid:true（t2 裁定）：其余两屏与系统记录无关，必须照常可用；但绝不静默当空
      json(res, 200, {
        success: true,
        data: {
          ok: false,
          invalid: true,
          reason: messageOf(err),
          ...(p === undefined ? {} : { path: p }),
          hint: '记录文件损坏' + (p === undefined ? '' : '：' + p) + '。不自动重建；改名或删除后重启会新建一份。',
          droppedEvents: rec.droppedEvents(),
        },
      })
    }
  }

  // ── POST /settings/storage/migrate ────────────────────────────────────────
  /**
   * 发起一次性迁移：**开一个 Agent 窗口**去跑迁移脚本（FR-10）。
   *
   * 本函数只做三件事：① 过票据门槛（与 switch 同一口径的共用实现）；② 开窗 + 投递底稿；
   * ③ 如实回报窗口码。**不写任何系统记录事件**——事件的语义是"发生了什么"而不是"请求了什么"，
   * 迁移结果由脚本在结束时写 `migration` 事件（口径见 `settings-support.openMigrationWindow`）。
   */
  async function handleStorageMigrate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const registry = requireStorageActionsOf(ctx.deps)
    const settings = requireSettingsOf(ctx.deps)
    const systemRecord = requireSystemRecordOf(ctx.deps)
    const body = await readBody(req)

    const ticket = typeof body.ticket === 'string' ? body.ticket.trim() : ''
    assertStorageTicket(registry, ticket, 'migrate', '迁移未发起')
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const out = await openMigrationWindow({ deps: ctx.deps, settings, systemRecord, sessionId })
    ok(res, { windowKey: out.windowKey, sessionId: out.windowKey, task: out.task })
  }

  /** `POST /settings/storage/pick-path`：弹**宿主操作系统**的选择窗口取路径（浏览器拿不到真实绝对路径）。三态：选中 / 取消（不是错误）/ 不可用 → 501。 */
  async function handleStoragePickPath(res: ServerResponse): Promise<void> {
    const port = pickStoragePathOf(ctx.deps)
    if (port === undefined) {
      throw coded('path_picker_unavailable',
        '这台机器拿不到系统选择窗口（组合根未装配 pickStoragePath）：请手动输入库文件路径')
    }
    const outcome = await port.pick()
    if (outcome.kind === 'picked') return ok(res, { ok: true, path: outcome.path })
    if (outcome.kind === 'cancelled') return ok(res, { ok: false, cancelled: true })
    throw coded('path_picker_unavailable',
      '这台机器拿不到系统选择窗口（' + outcome.reason + '）：请手动输入库文件路径')
  }

  /** `POST /settings/open-file` —— 用**系统默认程序**打开配置文件（实现与白名单见 settings-support）。 */
  async function handleOpenConfigFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const want = typeof body.path === 'string' ? body.path : ''
    const r = await openWhitelistedConfigFile(ctx.deps, want)
    if (r.ok !== true) {
      if (r.code === 'failed') return ok(res, { ok: false, reason: r.reason })
      return bad(r.message)
    }
    return ok(res, { ok: true, path: r.path })
  }

  return { handleGetSettings, handlePatchSettings, handleStorageRequest, handleStorageSwitch, handleGetSystemRecord, handleStorageMigrate, handleStoragePickPath, handleOpenConfigFile }
}
