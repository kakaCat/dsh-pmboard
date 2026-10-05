/**
 * 插件构建指纹（REQ-261003222428-3556 FR-3）——**陈旧构建可见化**。
 *
 * 为什么需要：本仓两次「已修缺陷表现为线上事故」（capture 弹框契约、depends_on 假丢失
 * 排查期）都源于同一形态——运行中插件加载的是**旧构建产物**，src 早已修好。
 * 指纹让「我在跑哪份构建」随时可查：装配层（允许 fs）计算一次并盖章；
 * application 层（禁 node: 依赖，layer-boundary 门禁）只经 getter 读取，不碰 fs。
 *
 * @module dsh-pmboard/shared/build-stamp
 */

/** 构建指纹（sha256(产物)[0:12]，与客户端构建戳同口径）；未盖章 = undefined（测试/直跑 src 时）。 */
let stamp: string | undefined

/** 盖章（仅装配层调用，幂等：同值不重写）。 */
export function setBuildStamp(value: string): void {
  if (value.length === 0 || stamp === value) return
  stamp = value
}

/** 读取指纹（application 层安全：纯内存读）。 */
export function getBuildStamp(): string | undefined {
  return stamp
}
