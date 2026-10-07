/**
 * 测试进程沙箱的启动自检（REQ-261006201814-ac4f FR-5⑤-a）。
 *
 * ## 它是什么
 *
 * `vitest.config.ts` 给 forks worker 下发了 Node 权限模型（`--permission` +
 * `--allow-fs-write=<临时目录>`）。本文件在**每个 worker 启动时**做一次自检：
 * 真去写一个仓内探针路径，看它**是不是真被内核拒绝**。
 *
 * ## 为什么要自检（本需求最重要的一条纪律）
 *
 * 第一版曾把「改写 `fs` 导出」当作拦截机制写进设计——实测**技术上不可能**
 * （`node:fs` 的 ESM 命名空间只读，且病灶用**具名导入**），于是那道守卫是**假**的，
 * 却会一直"绿"。教训是：**拦截机制必须自证真的在拦**。
 * 故本文件不做任何断言式声明，只做一次**真实写入试验**，结论进 `permissionModelStatus()`。
 *
 * ## 版本差异
 *
 * Node 20 上开关名为 `--experimental-permission`；Node 22+ 为 `--permission`。
 * 不支持时**不静默通过**：状态标 `unsupported`，由用例决定是红还是如实标注跳过。
 *
 * @module dsh-pmboard/tests/setup/hermetic-guard
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（`tests/setup/` → 上溯两级）。 */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** ⑤-a 的实际生效状态（启动自检的结论，不是配置的声明）。 */
export interface PermissionModelStatus {
  /** `active` = 真被内核拒绝过；`inactive` = 能写进仓库（守卫失效）；`unsupported` = 平台不支持 */
  readonly state: 'active' | 'inactive' | 'unsupported'
  /** 探测时观察到的错误码（`active` 时恒为 `ERR_ACCESS_DENIED`） */
  readonly observedCode?: string
  /** 人读说明（进用例消息） */
  readonly note: string
}

let cache: PermissionModelStatus | undefined

/**
 * 跑一次真实写入试验并缓存结论（幂等：一个 worker 进程只探一次）。
 *
 * 探针写在仓库根下、用完**立刻删除**（若真被拒绝，就自然没有残留）。
 */
export function permissionModelStatus(): PermissionModelStatus {
  if (cache !== undefined) return cache
  const probe = join(REPO_ROOT, '__hermetic-probe-' + String(process.pid) + '.tmp')
  try {
    writeFileSync(probe, 'probe')
    // 没被拒绝 ⇒ 守卫失效。立刻清掉探针（这是我们自己写进去的，必须收拾干净）
    if (existsSync(probe)) rmSync(probe, { force: true })
    cache = {
      state: 'inactive',
      note: '权限模型**未生效**：仓内写入成功了（探针=' + probe + '）。'
        + '⑤-a 这道真拦守卫现在是假的——检查 vitest.config.ts 的 poolOptions.forks.execArgv 是否真下发。',
    }
    return cache
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'ERR_ACCESS_DENIED') {
      cache = {
        state: 'active',
        observedCode: code,
        note: '权限模型已生效：仓内写入被内核拒绝（' + code + '），探针零残留。',
      }
      return cache
    }
    cache = {
      state: 'unsupported',
      observedCode: code,
      note: '平台不支持权限模型（观察到的错误码=' + String(code) + '；本机 Node ' + process.version + '）。'
        + '⑤-a 本次运行未覆盖——不得当成通过。',
    }
    return cache
  }
}

/** 临时目录（供用例断言「写 /tmp 放行」用；realpath 后比较，避开 macOS 软链）。 */
export function tempDir(): string {
  return tmpdir()
}

// 启动即探测并打印结论：红/绿由用例断言，这里只负责**让结论可见**
const status = permissionModelStatus()
if (status.state === 'active') {
  console.log('[hermetic-guard] ⑤-a 生效：仓内写入被拒绝（' + String(status.observedCode) + '）')
} else {
  console.warn('[hermetic-guard] ⚠️ ⑤-a ' + status.state + '：' + status.note)
}
