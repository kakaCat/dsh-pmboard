/**
 * 「零写入 / 状态不变」探针（REQ-261006201814-ac4f FR-7）。
 *
 * ## 为什么要有它
 *
 * 越权矩阵的每格不能只断言「被拒绝」——拒绝得再干脆，只要**仍然写了盘**，那格就是假绿。
 * 本仓此前没有统一的「这次调用到底动了什么」的读法：有的用例比 revision，有的比文件内容，
 * 有的干脆不比。三张矩阵要逐格给「码 + 零写入 + 状态不变」，就必须先把这三件事读成**同一个形状**。
 *
 * ## 读数口径（为什么是这三个）
 *
 * - **台账 revision**：`InMemoryRequirementStore.peekRevision()`——每次真落盘 +1，幂等无操作不变；
 * - **队列写入序号**：`InMemoryQueueRepository.writeSeqOf(reqId)`——同上，但覆盖任务侧（任务不在台账里）；
 * - **状态字段快照**：`peek(reqId)` 的指定字段——判「这个动作不该碰的字段有没有被碰」。
 *
 * 用 revision / 序号而不是文件内容哈希：内容哈希会被别窗口的并发写污染（D-4/D-6 的教训），
 * 而序号只随**本进程这次调用**是否真的落盘变化。
 *
 * @module dsh-pmboard/tests/helpers/ledger-probe
 */
import { expect } from 'vitest'
import type { InMemoryQueueRepository, InMemoryRequirementStore } from '../application/harness.js'

/** 一次探针读数（三者都取不到时按缺省处理，不伪造 0）。 */
export interface WriteProbe {
  /** 台账落盘版本（每次真实变更 +1）。 */
  readonly ledgerRevision: number
  /** 队列写入序号（同一需求真实写盘才 +1）。 */
  readonly queueSeq: number
  /** 需求记录上的字段快照（记录不存在 → undefined）。 */
  readonly fields: Readonly<Record<string, unknown>> | undefined
}

/** 取一次读数。`fields` 为空数组时只读 revision 与 queueSeq。 */
export function probeWrites(
  store: InMemoryRequirementStore,
  queueRepo: InMemoryQueueRepository,
  reqId: string,
  fields: readonly string[] = [],
): WriteProbe {
  const record = store.peek(reqId) as unknown as Record<string, unknown> | undefined
  const picked: Record<string, unknown> = {}
  for (const f of fields) picked[f] = record === undefined ? undefined : record[f]
  return {
    ledgerRevision: store.peekRevision(),
    queueSeq: queueRepo.writeSeqOf(reqId),
    fields: record === undefined ? undefined : picked,
  }
}

/** 断言「零写入」：台账 revision 与队列写入序号都没动。 */
export function expectNoWrite(before: WriteProbe, after: WriteProbe, label = ''): void {
  const where = label.length > 0 ? label + '：' : ''
  expect(after.ledgerRevision, where + '台账 revision 不该变').toBe(before.ledgerRevision)
  expect(after.queueSeq, where + '队列写入序号不该变').toBe(before.queueSeq)
}

/** 断言「状态不变」：逐字段比对这次动作**不该碰**的字段。 */
export function expectFieldsUnchanged(before: WriteProbe, after: WriteProbe, fields: readonly string[]): void {
  for (const f of fields) {
    expect(after.fields?.[f], '字段 ' + f + ' 不该被这次调用改动').toEqual(before.fields?.[f])
  }
}

/** 三件套的一体断言：码 + 零写入 + 状态不变（矩阵每格调用它）。 */
export function expectRejectedWithNoWrite(
  observedCode: string | undefined,
  expectedCode: string,
  before: WriteProbe,
  after: WriteProbe,
  fields: readonly string[],
  label = '',
): void {
  expect(observedCode, (label.length > 0 ? label + '：' : '') + '期望拒绝码 ' + expectedCode).toBe(expectedCode)
  expectNoWrite(before, after, label)
  expectFieldsUnchanged(before, after, fields)
}
