/**
 * 「改路径」的**宿主接线**（REQ-261004103330-005f 对齐趟 2 / 界面基准原型 `#btnPathEdit`）。
 *
 * ## 为什么单独一个文件
 *
 * `controller.ts` 在该趟开工时已 **398 行**（门禁 400）——再往里塞逻辑就是拿"文件尺寸"换"功能"，
 * 而这个仓的纪律是：**新逻辑进新文件，控制器只留接线**（t14 的 `makeSystemRecordLoader` 就是这么做的）。
 * 故本文件自带一个挂在宿主上的点击监听，控制器只加**一行** `attachStoragePathEditor(host, …)`。
 *
 * ## 它做的事只有一件
 *
 * 读输入框里的路径 → `PATCH /settings`（`storage.sqlitePath`）→ 把结果交给注入的回调。
 * **不做**后端切换（那要过人工确认门，见 `render/storage.ts` 头注）、**不碰**迁移状态机。
 *
 * ## 一条纪律
 *
 * 保存前**先做最基本的形状检查**（非空、看起来像路径）——不是为了替代服务端校验，
 * 而是为了不当场把空串发过去、让人以为"点了没反应"。
 *
 * @module dsh-pmboard/client/settings/storage-path
 */

/** 本模块用到的宿主与取数能力（全部注入：不 import DOM API，便于测试）。 */
export interface StoragePathDeps {
  readonly api: {
    patchRunSettings?(body: {
      stageMaxRounds?: Record<string, number>
      storage?: { sqlitePath?: string }
    }): Promise<unknown>
    /**
     * 弹宿主操作系统的选择窗口取文件路径。缺省 = 该部署弹不出（非 macOS 等）→
     * 如实说清并**保留手输**，不假装选了路径。
     */
    pickStoragePath?(): Promise<{ ok: boolean; path?: string; cancelled?: boolean }>
  }
  /** 保存结束的回调：`ok=false` 时 `message` 是**人话**（服务端原话优先）。 */
  readonly onResult: (ok: boolean, message?: string) => void
}

/** 输入框的 `data-role`（渲染层与本模块共用的唯一约定）。 */
export const STORAGE_PATH_ROLE = 'storage-path'

/** 保存/取消两个动作（与 `SETTINGS_ACTIONS` 里的字面量一致）。 */
export const STORAGE_PATH_SAVE = 'settings-storage-path-save'
export const STORAGE_PATH_CANCEL = 'settings-storage-path-cancel'
/** 「选择…」：弹宿主操作系统的选择窗口（2026-10-04 人要求"和操作系统一样"）。 */
export const STORAGE_PATH_PICK = 'settings-storage-path-pick'

/** 极简宿主形状（只要求能挂监听、能查到输入框；测试用替身即可）。 */
interface HostLike {
  addEventListener(type: string, listener: (e: unknown) => void): void
  querySelector(selector: string): unknown
}

interface ClickLike {
  readonly target: {
    closest?(selector: string): { getAttribute(name: string): string | null; value?: string } | null
  } | null
}

/**
 * 把选中的路径填进输入框，并**标脏**（`is-dirty`），让"改过了、还没保存"在页面上看得见。
 *
 * 为什么还要 `dispatchEvent('input')`：程序化改 `value` **不会**触发 `input` 事件——
 * 若界面上另有监听（例如把保存键点亮），不派发就等于"填了但界面没反应"。两件事都做。
 */
function fillPicked(host: HostLike, path: string): void {
  const el = host.querySelector('[data-role="' + STORAGE_PATH_ROLE + '"]') as {
    value?: string
    classList?: { add(name: string): void }
    dispatchEvent?: (e: unknown) => void
  } | null
  if (el === null || el === undefined) return
  el.value = path
  el.classList?.add('is-dirty')
  el.dispatchEvent?.({ type: 'input' })
}

function pathInputOf(host: HostLike): { value: string; valueOf(): string } | undefined {
  const el = host.querySelector('[data-role="' + STORAGE_PATH_ROLE + '"]')
  return el === null || el === undefined ? undefined : (el as { value: string; valueOf(): string })
}

/**
 * 挂上「改路径」的点击监听（幂等：重复调用只会再挂一个监听——**调用方负责只调一次**，
 * 控制器在 `hostOf()` 里建宿主时调一次，这就是唯一调用点）。
 */
export function attachStoragePathEditor(host: HostLike, deps: StoragePathDeps): void {
  host.addEventListener('click', (raw) => {
    const e = raw as ClickLike
    const el = e?.target?.closest?.('[data-action]') ?? null
    if (el === null) return
    const action = el.getAttribute('data-action')
    if (action !== STORAGE_PATH_SAVE && action !== STORAGE_PATH_CANCEL && action !== STORAGE_PATH_PICK) return

    if (action === STORAGE_PATH_PICK) {
      // 通道未装配 → 说清并保留手输（不能静默：这是本项目刚修过的缺陷类型）
      if (deps.api.pickStoragePath === undefined) {
        deps.onResult(false, '这台机器拿不到系统选择窗口：请手动输入库文件路径')
        return
      }
      void deps.api.pickStoragePath().then(
        (r) => {
          if (r?.cancelled === true) return              // 取消：什么都不改、也不提示（不是错误）
          const picked = (r?.path ?? '').trim()
          if (picked.length === 0) {
            deps.onResult(false, '选择窗口没返回路径：请手动输入，或再点一次「选择…」')
            return
          }
          fillPicked(host, picked)                        // 填入 + **标脏**（保存仍由人点，两步语义不变）
          deps.onResult(true, '已选择：' + picked + '（点「保存」写入设置文件）')
        },
        (err: unknown) => {
          const message = (err as { message?: string } | undefined)?.message ?? String(err)
          // 501 是"这台机器弹不出窗口"，不是异常——给人话，并明确可以手输
          deps.onResult(false, /501|path_picker_unavailable/.test(message)
            ? '这个平台拿不到系统选择窗口，请手动输入路径'
            : '打开选择窗口失败：' + message)
        },
      )
      return
    }

    if (action === STORAGE_PATH_CANCEL) {
      deps.onResult(true)
      return
    }
    const input = pathInputOf(host)
    const value = (input === undefined ? '' : input.value).trim()
    if (value.length === 0) {
      deps.onResult(false, '路径没写：请输入库文件的完整路径（例如 ~/.dsh/reqboard.sqlite）')
      return
    }
    // 通道未装配（测试替身 / 宿主没接）时如实说清，不假装保存成功
    if (deps.api.patchRunSettings === undefined) {
      deps.onResult(false, '保存通道未装配：当前宿主没有接 PATCH /settings，无法保存路径')
      return
    }
    void deps.api.patchRunSettings({ storage: { sqlitePath: value } }).then(
      () => { deps.onResult(true) },
      (err: unknown) => {
        const message = (err as { message?: string } | undefined)?.message ?? String(err)
        deps.onResult(false, '路径未保存：' + message)
      },
    )
  })
}
