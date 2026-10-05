/**
 * 旧看板深链兼容入口（REQ-261004111917-f473 FR-1）。
 *
 * ## 它解决什么
 *
 * 看板早已从「`/dashboard` SPA 页面」迁成 DSH **原生面板**：宿主没有任何 `/dashboard` 路由，
 * 静态兜底只服务 `/`、`/index.html`、`/assets/*`、`/favicon.svg`、`/manifest.webmanifest`，
 * 其余路径一路走到「未知路径 → 404」（无 SPA 兜底）。而插件仍在本仓三处产出
 * `/dashboard#pmboard?req=REQ-…` 这条「看板链接」（PM 引导段与三个工具回执都在用），
 * 用户点一下就整页 404（2026-10-04 实测）。
 *
 * 本模块给这条**死路径**补一个兼容入口：把它送回应用根，并把**片段原样保留**
 * ——`req` 只存在于 `location.hash` 里，HTTP 请求根本看不到它，所以「保留定位」这件事
 * 只能由客户端脚本完成（见 `src/client/deep-link.ts` 消费端）。
 *
 * ## 为什么是 200 中转页而不是 302
 *
 * 302 的片段继承虽由规范保证（RFC 9110 §10.2.2），但那依赖「自定义协议（`dsh-app://`）下
 * 渲染器是否跟随重定向」这一未经取证的平台行为；一旦不跟随，用户看到的是空白页——
 * **失败形态比 404 更差**。200 中转页的落点由我们自己的脚本决定，且响应形状可单测。
 *
 * ## 三条硬约束（design/interfaces.md §宿主 HTTP 路由契约）
 *
 * 1. **零业务数据**：不读台账、不回任何 REQ 字段——这条路径无鉴权，不能变成信息出口；
 * 2. **逐字节幂等**：无时间戳、无随机，同一请求两次响应相等；
 * 3. **方法显式**：命名路由先于 fallback 匹配，不判方法的话一个 `POST /dashboard` 会被当成
 *    「打开看板」成功返 200，把错误吞掉（响亮失败纪律）→ 非 GET/HEAD 一律 405。
 *
 * @module dsh-pmboard/http/legacy-board-route
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * 需要注册为 exact 路由的路径（两条都注册）。
 *
 * 旧链接没有尾斜杠；但手工输入、二次转发、某些客户端规范化都可能给出带尾斜杠的形态——
 * 两者行为必须一致，否则「有时能开、有时 404」这种最难查的形态就回来了。
 *
 * **已知约定例外（复核 R2）**：宿主 `WebRoute.path` 的约定是「不带尾斜杠」
 * （`@deepseek-ai/dsh-host-webserver` 的 `WebRoute` 注释）。这里**有意**多注册一条
 * `/dashboard/`：当前宿主既不校验也不规范化 pathname，两条都能命中；
 * 若将来宿主加了校验（装配期抛错）或去尾斜杠规范化（由 `/dashboard` 兜住），
 * 本例外都可安全撤销——为可读性保留两条，而不是靠调用方规范化。
 */
export const LEGACY_BOARD_PATHS: readonly string[] = ['/dashboard', '/dashboard/']

/**
 * 中转页正文（**唯一允许的实现形状**，测试按其中子串断言）。
 *
 * `location.search` 一并带上：万一将来链接带 query（如 `?session=`）也不丢；
 * `location.hash` 必须带——`req` 就在里面。
 */
export const LEGACY_BOARD_BODY: string = [
  '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
  '<title>项目看板</title></head><body>',
  '<script>location.replace("/" + location.search + location.hash)</script>',
  '<noscript>项目看板已迁到应用内：请打开侧栏「项目看板」。</noscript>',
  '</body></html>',
].join('')

/** 允许的方法（其余一律 405）。 */
const ALLOWED_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD'])
/**
 * 造兼容入口 handler：把 `/dashboard`（含尾斜杠形态）送回应用根并保留片段。
 *
 * handler **不依赖任何端口**（零台账读取）——它只是一段固定响应，
 * 因此不需要 `RouterCtx`，也不会因为装配缺依赖而失败。
 */
export function createLegacyBoardRouteHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? 'GET'
    if (!ALLOWED_METHODS.has(method)) {
      res.writeHead(405, {
        'content-type': 'text/plain; charset=utf-8',
        allow: 'GET, HEAD',
      })
      res.end('method not allowed')
      return
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      // 中转页不可缓存：缓存住一次点击之后这条入口就长期失效了
      'cache-control': 'no-store',
    })
    // HEAD 的响应体由 Node 自行去体（`_hasBody=false`），此处不另造分支
    res.end(LEGACY_BOARD_BODY)
  }
}

/** 注册端口的最小投影（宿主 `webServer.register` 的形状；只声明本模块用到的部分）。 */
export interface ExactRouteRegistrar {
  register(route: { kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }): () => void
}

/**
 * 把兼容入口注册到宿主（两条 exact 路径），返回**幂等**的组合撤销句柄。
 *
 * 为什么单独抽出来（复核 R4）：两条路由是**一组**，第 2 条注册失败（例如该路径已被别的
 * 占用者占了）时，第 1 条会变成「没有 disposer 的泄漏注册」，而 effect 回调又把异常抛了出去
 * ——半注册 + 抛错是最难查的形态。这里显式回滚已注册者再抛，且撤销可被单测直接证伪。
 */
export function registerLegacyBoardRoutes(
  webServer: ExactRouteRegistrar,
  handler: (req: IncomingMessage, res: ServerResponse) => void = createLegacyBoardRouteHandler(),
): () => void {
  const disposers: Array<() => void> = []
  try {
    for (const path of LEGACY_BOARD_PATHS) {
      disposers.push(webServer.register({ kind: 'exact', path, handler }))
    }
  } catch (err) {
    for (const dispose of [...disposers].reverse()) {
      try { dispose(); } catch { /* 回滚失败不掩盖原始错误 */ }
    }
    throw err
  }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    // 撤销顺序与注册相反（后注册的先撤）
    for (const dispose of [...disposers].reverse()) {
      try { dispose(); } catch { /* 单个撤销失败不阻塞其余清理 */ }
    }
  }
}
