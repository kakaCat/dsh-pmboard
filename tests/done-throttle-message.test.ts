/**
 * L1 领域单测 · 节流拒绝文案可执行化（REQ-261001154450-b918 t6 / serves: FR-4）。
 *
 * 为什么要这条用例：REQ-8475 实测里，agent 面对"请稍后"只能自己猜节奏，最后打了 32 次
 * `sleep 62`（纯等待 33.1 分钟 = 该需求墙钟 65%）。本用例把"文案必须给出确定等待时间 +
 * 合规路径 + 子卡豁免说明"钉死，防止退回模糊措辞。
 */
import { describe, it, expect } from 'vitest'
import { checkDoneEvidence } from '../src/domain/workflow/DoneEvidenceSpec.js'

const base = {
  hasReport: true,
  reportFilesChanged: ['src/x.ts'],
  reportCompleted: ['做了点什么'],
  hasTraceWork: true,
  fileEvidence: true,
  pagesSrcFiles: [],
  clientBuildExists: false,
  clientBuildMtime: 0,
  newestPagesSrcMtime: 0,
}

describe('节流拒绝文案（FR-4）', () => {
  it('命中节流时给出剩余秒数、合规路径与子卡豁免说明', () => {
    const v = checkDoneEvidence({
      ...base,
      recentDoneTask: { id: 't-abc123', title: '别的卡' },
      throttleRemainingMs: 42_400,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.code).toBe('REQBOARD_BULK_CLOSE')
    expect(v.reason).toContain('还需等待约 43 秒')
    expect(v.reason).toContain('reqboard_task_run')   // 合规路径之一：交给自动链
    expect(v.reason).toContain('子卡')                 // 说明子卡不受此限
    expect(v.reason).toContain('t-abc123')             // 点名是哪张卡挡住的
  })

  it('拿不到剩余时间时退化为明确话术，不出现"剩余 0 秒"这类假精确', () => {
    const v = checkDoneEvidence({ ...base, recentDoneTask: { id: 't-1', title: 'x' } })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.reason).toContain('请稍后重试')
    expect(v.reason).not.toContain('剩余 0 秒')
  })

  it('不命中节流时正常放行（不误伤）', () => {
    expect(checkDoneEvidence({ ...base }).ok).toBe(true)
  })
})
