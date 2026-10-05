// serves: FR-5
/**
 * 人工门即停手（REQ-261004065652-5c1c · t4 / TC-7）。
 *
 * ## 复现的事故
 *
 * 2026-10-03：REQ-261003203909-55f2 验收材料已提交、验收单 9 项全 `pending`，
 * 而 Dive 仍在反复唤醒窗口——台账评论自己写着「Dive 连续唤醒回合均无新输入、agent 无待办」。
 * 原因是当时的唯一停手判据是"弹框**在途**"（内存态），**台账上的等人状态不是停手条件**。
 *
 * ## 判据的三条形态（域层 humanGateOf 判定，本文件验"驱动真的会停"）
 *
 * ① 验收单有待裁决项；② 有已登记未确认的门类产物；③ 拆分计划已提交未批准。
 * 三者的共同语义：**这一步该由人裁决，agent 现在没有可做的事**。
 *
 * ## 反向演练
 *
 * 把 `round-driver.ts` `drive()` 里那段 `humanGate` 检查删掉 → 本文件三条用例必红。
 */
import { describe, it, expect } from 'vitest'
import { harness, makeReq } from './support/dive-loop-harness.js'

describe('TC-7 · 人工门开着 → 一拍都不唤醒', () => {
  it('验收单待裁决（acceptance-pending）：20 拍零投递，台账不被写健康位', async () => {
    const h = harness({ humanGate: () => ({ open: true, reason: 'acceptance-pending' }) })
    for (let i = 0; i < 20; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered, '等人裁决期间回合增量为 0').toHaveLength(0)
    expect(h.diveOf('REQ-a')?.driverHealth, '等人不是故障：不写健康位').toBeUndefined()
    expect(h.diveOf('REQ-a')?.activation, '不改人的意图').toBe('armed')
    expect(h.infos.join(' ')).toContain('人工门开着')
  })

  it('产物待确认（artifact-unconfirmed）：同样零投递', async () => {
    const h = harness({ humanGate: () => ({ open: true, reason: 'artifact-unconfirmed' }) })
    for (let i = 0; i < 20; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered).toHaveLength(0)
  })

  it('计划待批准（plan-unapproved）：同样零投递', async () => {
    const h = harness({ humanGate: () => ({ open: true, reason: 'plan-unapproved' }) })
    for (let i = 0; i < 20; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered).toHaveLength(0)
  })

  it('门关上（人裁决完）→ 下一次空闲即可起轮（不需要人再点一次）', async () => {
    let open = true
    const h = harness({ humanGate: () => (open ? { open: true, reason: 'acceptance-pending' } : { open: false }) })
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(0)
    open = false
    await h.idle('agent-1')
    expect(h.delivered, '门一关就该自己继续跑').toHaveLength(1)
  })

  it('判据抛错 → 按门关处理（fail-open）并响亮留痕，不把自动化整体停摆', async () => {
    const h = harness({
      humanGate: () => { throw new Error('判据炸了') },
    })
    await h.idle('agent-1')
    expect(h.delivered, '判据的 bug 不该变成"整个自动化停摆"').toHaveLength(1)
    expect(h.warns.join(' ')).toContain('人工门判据抛错')
  })

  it('缺省不装配（undefined）→ 行为与改动前逐字一致', async () => {
    const h = harness()
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)
  })
})

describe('人工门只挡自动起轮，不挡别的', () => {
  it('多需求：门按需求判定，另一条不受影响', async () => {
    const h = harness({
      reqs: [makeReq('REQ-a', 'agent-1'), makeReq('REQ-b', 'agent-2')],
      humanGate: (id) => (id === 'REQ-a' ? { open: true, reason: 'acceptance-pending' } : { open: false }),
    })
    await h.idle('agent-1')
    await h.idle('agent-2')
    expect(h.deliveredFor('REQ-a')).toBe(0)
    expect(h.deliveredFor('REQ-b'), '门只挡该需求').toBe(1)
  })
})
