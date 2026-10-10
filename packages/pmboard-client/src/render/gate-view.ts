/**
 * 卡面门读数的**读侧 helper**（REQ-261006175040-12d4 t6 / FR-1、FR-3、FR-4、FR-6 · D-2）。
 *
 * ## 为什么要有它
 *
 * 客户端**不再判定**门状态：判定在服务端（`shared/board-summary` 装配 + `domain/artifact/GateReadings`
 * 纯函数），随 `GET /state` 的摘要下发。本模块只做一件事——把 `req.gates` 读出来，供
 * chips / 派生行 / 确认按钮 / 验收 chip 四处**共用同一种读法**（各处自己 `find` 就会长出多份口径，
 * 那正是本仓反复吃过的亏）。
 *
 * ## 缺省语义（FR-6：读不到 ≠ 缺失）
 *
 * `req.gates === undefined` = **读数不可得**（旧服务端未下发 / 服务端读对象失败）。
 * 调用方必须据此**不渲染**，绝不能退化成 `missing`（渲染成红色 ✗）——
 * 本次缺陷的成因就是把"读不到"渲染成了"缺失"。
 *
 * @module dsh-pmboard/client/render/gate-view
 */
import type { GateReading, RequirementRecord } from '../types.ts'

/**
 * 该需求的全部门读数。
 *
 * 返回 `undefined`（而不是空数组）表示**读数不可得**，与"分类真的没有门"（空数组）区分开——
 * 前者不渲染，后者也没东西可渲染，但语义不同，调用方读代码时不该靠猜。
 */
export function gatesOf(req: RequirementRecord): readonly GateReading[] | undefined {
  return req.gates
}

/** 某一道门的读数；读数不可得、或该门不在生效门清单里 ⇒ `undefined`。 */
export function gateOf(req: RequirementRecord, kind: string): GateReading | undefined {
  return req.gates?.find(g => g.kind === kind)
}
