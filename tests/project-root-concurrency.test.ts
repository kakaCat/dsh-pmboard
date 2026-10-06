// serves: FR-1, FR-2, FR-3, FR-5
/**
 * 写盘根守卫：多窗口并行不再误判（REQ-261005123641-3982 t3）
 *
 * **复现的事故形态**：窗口 A 立项/落库期间，窗口 B（另一个工作区）的一次调用把**进程共享单例**的根改走，
 * A 的写前守卫把 B 的根当成「实际会写的根」→ 误报 `REQBOARD_PROJECT_ROOT_MISMATCH`
 * （实测：REQ-261005122915-9f90 的立项回执 @1791174555337，记录已建、状态已推进，回执却是 Error）。
 *
 * 本文件的两条主判据（与既有 `project-scope.test.ts` 的「零写入」一脉相承）：
 *   ① 邻居窗口改过单例根之后，本窗口的写入**仍然成功**，且产物只落在**自己记录声明的**项目目录里
 *      （另一项目目录零新增——这是钉住隔离的真判据，不是「产物存在」）；
 *   ② 真错配（记录声明的绝对根不可用 / 校正失效）仍然**响亮拒绝**，绝不静默写别处。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ensureWritableProjectRoot,
  INVALID_WORKSPACE,
  PROJECT_ROOT_MISMATCH,
} from '../src/application/internal/support.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'

function tempProject(prefix: string): string {
  return resolve(mkdtempSync(join(tmpdir(), prefix)))
}

/**
 * 邻居窗口对共享单例做的事：用例入口 `agentIdFromExec` → `syncWorkspaceRootFromExec`
 * → `applyWorkspaceRoot(deps, 本窗口 cwd)`，那一层最终就是 `docs.setWorkspaceRoot(自己的根)`
 * （见 `src/application/internal/support.ts`）。只读工具（`reqboard_status`）与看板渲染同样会走到它——
 * 这正是事故的触发条件，故本文件如实模拟这一步，而不是绕过它。
 */
function neighbourWindowTouchesSharedRoot(docs: FileDocRepository, itsRoot: string): void {
  docs.setWorkspaceRoot(itsRoot)
}

describe('多窗口并行：共享单例根被改走，不得让本窗口的写入被误拒（REQ-261005123641-3982）', () => {
  it('TC-1 邻居窗口改过单例根后，本窗口两次写入都成功，且产物只落在自己项目里', async () => {
    const dirA = tempProject('pmboard-conc-A-')
    const dirB = tempProject('pmboard-conc-B-')
    try {
      const docs = new FileDocRepository({ workspaceRoot: dirA })
      const recordA = { id: 'REQ-A', workspaceRoot: dirA }

      // 第一次：A 自己的写入（入口刚按 A 的会话 cwd 校正过单例根）
      expect(ensureWritableProjectRoot({ docs }, recordA, { callerRoot: dirA })).toBe(dirA)
      await docs.write('docs/requirements/REQ-A/requirement.md', 'A')

      // 事故触发条件：弹框停留期间，邻居窗口 B 的调用把共享单例根改成了 B 的项目根
      neighbourWindowTouchesSharedRoot(docs, dirB)

      // 第二次：A 继续写 —— 旧实现在这里抛 PROJECT_ROOT_MISMATCH（记录已建却报立项失败）
      expect(ensureWritableProjectRoot({ docs }, recordA, { callerRoot: dirA })).toBe(dirA)
      await docs.write('docs/requirements/REQ-A/rtm-lifecycle.yml', 'A')

      // 单例根被校正回**记录声明的根**；A 的产物落在 A；B 项目零新增
      expect(docs.workspaceRoot()).toBe(dirA)
      expect(existsSync(join(dirA, 'docs/requirements/REQ-A/requirement.md'))).toBe(true)
      expect(existsSync(join(dirA, 'docs/requirements/REQ-A/rtm-lifecycle.yml'))).toBe(true)
      expect(readdirSync(dirB), 'B 项目目录必须零新增').toEqual([])
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })

  it('TC-2 记录声明的根是权威：调用方当前根不同 → 校正到声明根，调用方目录零新增', async () => {
    const dirA = tempProject('pmboard-auth-A-')
    const dirB = tempProject('pmboard-auth-B-')
    try {
      // 当前根 = A（别的窗口留下的缓存值），记录声明 = B → 写进 B，而不是拒、也不是留在 A
      const docs = new FileDocRepository({ workspaceRoot: dirA })
      const got = ensureWritableProjectRoot({ docs }, { id: 'REQ-B', workspaceRoot: dirB }, { callerRoot: dirA })
      expect(got).toBe(dirB)
      expect(docs.workspaceRoot()).toBe(dirB)
      await docs.write('docs/requirements/REQ-B/rtm-lifecycle.yml', 'B')
      expect(existsSync(join(dirB, 'docs/requirements/REQ-B/rtm-lifecycle.yml'))).toBe(true)
      expect(readdirSync(dirA), '调用方当前根目录零新增').toEqual([])
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })

  it('TC-3 声明根不可用（绝对但不存在）→ 响亮拒绝，且不写到任何地方', () => {
    const dirA = tempProject('pmboard-badroot-A-')
    const missing = join(tmpdir(), 'pmboard-not-a-real-dir-' + String(Date.now()))
    try {
      const docs = new FileDocRepository({ workspaceRoot: dirA })
      let err: { code?: string; message?: string } | undefined
      try {
        ensureWritableProjectRoot({ docs }, { id: 'REQ-X', workspaceRoot: missing }, { callerRoot: dirA })
      } catch (e) {
        err = e as { code?: string; message?: string }
      }
      expect(err?.code, '声明根不可用必须响亮拒绝，而不是写进别处').toBe(INVALID_WORKSPACE)
      expect(String(err?.message)).toContain(missing)
      // 写侧**不降级**到会话 cwd：调用方目录一个文件都没多
      expect(readdirSync(dirA)).toEqual([])
      expect(docs.workspaceRoot()).toBe(dirA)
    } finally {
      rmSync(dirA, { recursive: true, force: true })
    }
  })

  it('TC-4 非绝对声明根（相对写法）→ 不判，返回探针当前值（变更记①：用户裁决「宽容」）', () => {
    const dirA = tempProject('pmboard-rel-A-')
    try {
      const docs = new FileDocRepository({ workspaceRoot: dirA })
      // application 层解析不了 '.' 指向哪 → 既不改写、也不拒绝（与改动前逐字一致）
      expect(ensureWritableProjectRoot({ docs }, { id: 'REQ-R', workspaceRoot: '.' })).toBe(dirA)
      expect(docs.workspaceRoot()).toBe(dirA)
    } finally {
      rmSync(dirA, { recursive: true, force: true })
    }
  })

  it('TC-5 存量记录（未声明根）→ 回落调用方根并校正到它；没有调用方根则不判', () => {
    const dirA = tempProject('pmboard-legacy-A-')
    const dirB = tempProject('pmboard-legacy-B-')
    try {
      const docs = new FileDocRepository({ workspaceRoot: dirB })
      expect(ensureWritableProjectRoot({ docs }, { id: 'REQ-legacy' }, { callerRoot: dirA })).toBe(dirA)
      expect(docs.workspaceRoot()).toBe(dirA)
      expect(ensureWritableProjectRoot({ docs }, { id: 'REQ-legacy' }), '无调用方根 → 不判').toBeUndefined()
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })

  it('TC-6 校正失效（仓储不支持 setWorkspaceRoot）→ 最后防线仍抛 MISMATCH，给两个绝对路径', () => {
    const dirA = tempProject('pmboard-nofix-A-')
    const dirB = tempProject('pmboard-nofix-B-')
    try {
      // 只读替身：读得回根、但校正不生效 → 观测到不一致，必须拒绝（不是「不判」）
      const docs = { workspaceRoot: () => dirB }
      let err: { code?: string; message?: string } | undefined
      try {
        ensureWritableProjectRoot({ docs }, { id: 'REQ-X', workspaceRoot: dirA }, { callerRoot: dirA })
      } catch (e) {
        err = e as { code?: string; message?: string }
      }
      expect(err?.code).toBe(PROJECT_ROOT_MISMATCH)
      expect(String(err?.message)).toContain(dirA)
      expect(String(err?.message)).toContain(dirB)
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })
})
