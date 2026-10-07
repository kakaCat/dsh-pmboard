/**
 * 沙箱自证：仓内写入必须被**内核**拒绝（REQ-261006201814-ac4f FR-5⑤-a）。
 *
 * ## 这个用例在防什么
 *
 * 第一版的「进程内写入守卫」是**假的**——它靠改写 `fs` 导出，而 `node:fs` 的 ESM 命名空间
 * **只读**，且病灶用**具名导入**。假守卫会一直绿，直到有人真去写仓才发现。
 *
 * 故本用例不声明「我们配了权限模型」，而是**当场写一次仓内路径**，看内核给不给过：
 *   · 被拒（`ERR_ACCESS_DENIED`）→ 通过，并把错误码打进输出（验收要求）；
 *   · 写成功 → **红**（守卫失效，探针同时被清理）；
 *   · 平台不支持 → **红**并说明（不得静默当通过）。
 *
 * @module dsh-pmboard/tests/hermetic-guard
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { permissionModelStatus, tempDir } from './setup/hermetic-guard.js'
import { assertDocDoubleContract, checkDocDoubleContract } from './setup/hermetic-contract.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('⑤-a 权限模型：仓内写入由内核拒绝', () => {
  it('启动自检结论必须是生效（active），且观察到的错误码是 ERR_ACCESS_DENIED', () => {
    const status = permissionModelStatus()
    expect(
      status.state,
      '⑤-a 未生效：' + status.note
      + '\n补齐：检查 vitest.config.ts 的 poolOptions.forks.execArgv 是否真把权限开关下发给 worker',
    ).toBe('active')
    expect(status.observedCode).toBe('ERR_ACCESS_DENIED')
    // 验收要求：错误码必须出现在用例输出里（证明是内核拒绝，不是断言自证）
    console.log('[⑤-a] 仓内写入被拒绝，内核错误码 = ' + String(status.observedCode))
  })

  it('当场再写一次仓内路径：必须抛 ERR_ACCESS_DENIED，且不留残留', () => {
    const probe = join(REPO_ROOT, '__hermetic-test-probe-' + String(process.pid) + '.tmp')
    let code: string | undefined
    try {
      writeFileSync(probe, 'x')
    } catch (err) {
      code = (err as { code?: string }).code
    } finally {
      // 万一根据失效真写进去了，也必须收拾干净（不许把探针留在仓库里）
      if (existsSync(probe)) rmSync(probe, { force: true })
    }
    console.log('[⑤-a] 直接写入仓内路径的观察结果 = ' + String(code ?? '（竟然写成功了）'))
    expect(
      code,
      '仓内写入没被拒绝：权限模型没生效，这道守卫是假的。'
      + '\n补齐：确认 worker 真的带上了 --permission 与 --allow-fs-write=<临时目录>',
    ).toBe('ERR_ACCESS_DENIED')
  })

  it('写临时目录必须放行（沙箱不能把正常用例一起打红）', () => {
    const p = join(tempDir(), '__hermetic-ok-' + String(process.pid) + '.tmp')
    let ok = false
    try {
      writeFileSync(p, 'ok')
      ok = true
    } finally {
      if (existsSync(p)) rmSync(p, { force: true })
    }
    expect(ok, '临时目录 ' + tempDir() + ' 的写入被拒了——沙箱允许范围太窄，会打红正常用例').toBe(true)
  })

  it('仓库根下不得留下任何探针文件', () => {
    const leftovers = readdirSync(REPO_ROOT).filter(n => n.startsWith('__hermetic-'))
    expect(leftovers, '发现沙箱探针残留：' + leftovers.join('、')).toEqual([])
  })

  it('⑤-a 的**已知残留洞**：放行 spawn 后，非 Node 子进程可绕过权限模型（记录在案，不是遗忘）', () => {
    // 这条**不是**自夸守卫有效，而是把权衡钉成事实：
    //   放行 spawn 是为了不打红 26 条需要起子进程的既有用例（D-9：既有用例零语义变更）；
    //   代价是 `sh` 之类的**非 Node** 子进程不继承权限模型，能写进仓库（实测）。
    // 若哪天这条变红（洞被堵上），说明能力变了——请同步更新
    // docs/reviews/REQ-261006201814-ac4f-readings.md 的 B-8。
    const probe = join(REPO_ROOT, '__hermetic-escape-probe-' + String(process.pid) + '.tmp')
    let escaped = false
    try {
      execSync('sh -c "echo x > ' + probe + '"', { stdio: 'ignore' })
      escaped = existsSync(probe)
    } catch {
      escaped = false
    } finally {
      // 探测文件是**子进程**写进去的，本进程（受权限模型）删不掉 ⇒ 只能用同一个通道清理。
      // 这也顺带证明：这个洞是「子进程不受模型约束」，不是「模型没生效」。
      try { execSync('rm -f ' + probe, { stdio: 'ignore' }) } catch { /* 清理失败会由下方的残留断言报出 */ }
    }
    // 设计决策同样钉住：worker 必须带 --allow-child-process（否则 26 条既有用例红）
    expect(process.execArgv.join(' '), 'worker 未放行 spawn——26 条既有用例会红').toContain('--allow-child-process')
    expect(escaped, '残留洞不见了——若已堵上，请同步更新读数文件的 B-8 并收窄本条判据').toBe(true)
    console.log('[⑤-a] 已知残留洞在案：非 Node 子进程（sh）可绕过权限模型写仓')
  })
})

describe('⑤-b 契约锚点：夹具根必须是绝对临时根，且绝对路径 ≡ 相对路径', () => {
  it('真实夹具满足契约（不满足则抛 TEST_HERMETIC_CONTRACT）', () => {
    // 抛错即红：这里不 catch——契约坏了就该让整个文件红
    assertDocDoubleContract()
  })

  it('判据自身不是空转：对故意坏掉的替身必须报出违反', () => {
    const violations = checkDocDoubleContract(
      { workspaceRoot: () => '.', exists: () => false },
      '故意坏掉的替身',
    )
    expect(
      violations.length,
      '契约判据对「根为 . 且 exists 恒假」的替身竟然没报违反——判据失效，整条契约是空话',
    ).toBeGreaterThan(0)
    console.log('[⑤-b] 契约判据自检：对坏替身报出 ' + String(violations.length) + ' 条违反')
  })

  it('替身的根落在仓库内也必须被判违反（写真实工作树的直因）', () => {
    const inRepo = join(REPO_ROOT, 'docs')
    const violations = checkDocDoubleContract(
      { workspaceRoot: () => inRepo, exists: p => p === inRepo },
      '根落在仓库内的替身',
    )
    expect(
      violations.some(v => v.what.includes('不在系统临时目录下')),
      '根落在仓库内（' + inRepo + '）没被判违反——这条守卫漏了最该拦的形态',
    ).toBe(true)
  })
})
