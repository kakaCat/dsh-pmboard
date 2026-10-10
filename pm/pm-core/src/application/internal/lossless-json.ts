/**
 * 无损 JSON 清洗（REQ-261008103718-f1ea FR-1）——跨 remote 边界的请求体必须满足
 * `JSON.parse(JSON.stringify(x))` 与原值等价（"lossless JSON"）。
 *
 * 为什么需要：值为 `undefined` 的**对象键**在这个往返里会整体消失（键没了），
 * 于是宿主的 api gateway 判定请求 `not lossless JSON data` 并**拒收整条请求**。
 * 2026-10-08 实测现场：立项弹框的 questions 里有一个
 * `{ label, description: undefined }`（`i === 0 ? '…' : undefined` 的写法产生），
 * 整条弹框请求在 host→client 的 remote 事件上被拒——浏览器侧根本收不到请求，
 * 而错误还被上层误报成「用户未作答（取消 / 暂离）」，把**通道故障说成了人的选择**。
 *
 * 口径：
 *  - 剔除值为 `undefined` 的对象键、以及数组里的 `undefined` 项；
 *  - `null` **保留**（它是合法 JSON，语义上与"没有这个键"不同）；
 *  - 只递归 plain object / array；其它对象（类实例、Date、AbortSignal…）原样返回，
 *    绝不在这里改写我们看不懂的东西。
 *
 * @module dsh-pmboard/application/internal/lossless-json
 */

/** 是否是"纯数据"对象（对象字面量或 null 原型）——只有这种才安全递归重建。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 深度剔除 `undefined`，返回**可无损 JSON 往返**的等价数据。
 * @param value - 任意数据；类实例/`null`/原始值原样返回。
 * @returns 去掉 undefined 键与项之后的新值（不修改入参）。
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item: unknown) => item !== undefined)
      .map((item: unknown) => stripUndefinedDeep(item)) as unknown as T
  }
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    out[key] = stripUndefinedDeep(item)
  }
  return out as unknown as T
}

/**
 * 清洗是否真的删掉了东西（用于诊断：有变化 = 上游构造出了 undefined 键，
 * 这正是"请求不可无损序列化"的源头，值得留痕而不是静默修好）。
 * @param before - 清洗前
 * @param after - 清洗后
 * @returns 两者 JSON 文本是否不同
 */
export function stripChangedAnything(before: unknown, after: unknown): boolean {
  try {
    return JSON.stringify(before) !== JSON.stringify(after)
  } catch {
    return true
  }
}
