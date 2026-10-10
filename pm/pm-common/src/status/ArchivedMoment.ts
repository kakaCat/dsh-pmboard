/**
 * 归档时刻的唯一判定点（REQ-261006123819-3af3 FR-3 / D-2）。
 *
 * 为什么需要它：原先那个「归档时间」字段**从来没有写入者**（64 条归档记录命中 0），三个渲染点却读它，
 * 于是「已归档」这个分支永远不可达、人看到的永远是「待归档（材料已备）」。删掉字段后，
 * 「这条需求是什么时刻进入 archived 的」必须有**唯一**答案——就是本函数。
 *
 * 取 statusHistory 中**最后一条** `status === 'archived'` 事件的 at（归档可回退后再归档，
 * 最后一条才是当前这次）；取不到返回 undefined —— 调用方必须**整体省略**该键，
 * 不得发 undefined / null（本仓无损 JSON 铁律，见 ClearPause 的自述规则）。
 *
 * 层边界：domain 不得 import `shared/protocol`（tests/layer-boundary.test.ts:50），
 * 故此处只收**结构化最小投影**（与 domain/status/Predicates.ts 同款处置），
 * 不引用 StatusEvent 类型；`StatusEvent[]` 天然可赋给本签名。
 *
 * @module dsh-pmboard/domain/status/ArchivedMoment
 */

/** statusHistory 事件的最小投影（只需要这两个字段）。 */
export type StatusMomentEvent = { status: string; at: number }

/** 需求进入 archived 的时刻；未进入过 / 拿不到事件表 → undefined。 */
export function archivedMomentOf(req: { statusHistory?: readonly StatusMomentEvent[] }): number | undefined {
  const history = req.statusHistory
  if (history === undefined) return undefined
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i]
    if (e !== undefined && e.status === 'archived') return e.at
  }
  return undefined
}
