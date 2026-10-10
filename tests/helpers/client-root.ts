/**
 * client 面的**布局无关**路径口径（REQ-261009174713-7bc8 · t17）。
 *
 * client 正要搬进 `packages/pmboard-client/src/`；知识层（code map / design tokens）里到处都是
 * `packages/pmboard-client/src/...` 这样的路径，判据若钉死一种写法，搬迁当刻就会红一片。
 *
 * 本模块把两种前缀都**归一成包内相对形态**（如 `styles/base.ts`），于是：
 *   · 今天（扁平布局）行为一字不变；
 *   · 搬迁后同一个断言照样成立。
 *
 * @module tests/helpers/client-root
 */
const PREFIXES = ['packages/pmboard-client/src/', 'packages/pmboard-client/src/'] as const

/** 把 client 路径归一成「client 根相对」形态（两种布局等价）。 */
export function clientRel(p: string): string {
  for (const pre of PREFIXES) if (p.startsWith(pre)) return p.slice(pre.length)
  return p
}
