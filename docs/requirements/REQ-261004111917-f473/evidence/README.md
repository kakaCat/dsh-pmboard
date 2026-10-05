# 证据 · REQ-261004111917-f473（看板深链 404 修复）

本目录存放本需求的**可复核证据**。每条证据 = 命令 + 输出摘要 + 解读。

---

## E-1 · 真 HTTP 一级：exact 命名路由先于 fallback 命中（FR-1）

**为什么需要它**：`tests/legacy-board-route.test.ts` 用假 `res` 证明的是 **handler 的形状**；
`tests/apply-wiring.test.ts` 证明的是 **路由被注册**。两者都证明不了「在宿主真实 webServer 上，
`/dashboard` 会被命名路由接住而不是落到静态兜底的 404」——这条 dispatch 语义此前只有源码阅读。

**手法**：起一个宿主真实的 `@deepseek-ai/dsh-host-webserver` 服务（端口 0），
注册本需求的两条 exact 路由 + 一个模拟 `frontend-static` 的兜底座位（未知路径回 404），
然后真发 HTTP 请求（脚本 `/tmp/ws-probe.mts`，用 DSH 源码仓的 `tsx` 跑，
避免动到正在运行的 GUI 进程）：

```
cd /Users/mac/Documents/ai/dsh/deepseek-harness
npx tsx /tmp/ws-probe.mts
```

**输出（2026-10-04 实测）**：

```
GET /dashboard  -> 200 ct=text/html; charset=utf-8 cc=no-store allow=- body=<!doctype html><html lang="zh"><head><meta charset="utf-8"><
GET /dashboard/ -> 200 ct=text/html; charset=utf-8 cc=no-store allow=- body=<!doctype html><html lang="zh"><head><meta charset="utf-8"><
HEAD /dashboard -> 200 ct=text/html; charset=utf-8 cc=no-store allow=- body=
POST /dashboard -> 405 ct=text/plain; charset=utf-8 cc=- allow=GET, HEAD body=method not allowed
GET /nope      -> 404 ct=- cc=- allow=- body=fallback-404
```

**解读**：

- `GET /dashboard` 与 `GET /dashboard/` 都拿到 **200 + 中转页**（而不是 fallback 的 404）→
  exact 路由确实先于兜底命中（FR-1 的 dispatch 前提成立）；
- 同一次进程里 `GET /nope` 拿到 `fallback-404` → 对照组有效，证明 200 不是兜底给的；
- `HEAD` → 200 且**响应体为空** → 「Node 自行去体」的假设在真连接上成立（t1 复核的 R7 由此闭合）；
- `POST` → 405 + `allow: GET, HEAD` → 方法约束在真连接上成立（不吞方法错误）。

---

## E-2 · 构建产物取证（FR-4 · C-11 / C-12）

```
pnpm build            # host dist + client bundle
```

| 检查 | 命令 | 结果 |
|---|---|---|
| dist 有产物 | `stat -f %Sm -t %H:%M:%S dist/index.mjs` | `11:55:53` |
| lib 有产物 | `stat -f %Sm -t %H:%M:%S lib/client.js` | `11:55:54` |
| 兼容入口在 dist 里 | `grep -c location.replace dist/index.mjs` | `1` |
| 新文案在 dist 里 | `grep -c 点击后在应用内打开看板并定位该需求 dist/index.mjs` | `3`（三处工具 schema） |
| 旧文案已清除 | `grep -c 可在会话中点击跳转 dist/index.mjs` | `0` |
| 深链消费端在 client 里 | `grep -c 深链：面板选择失败 lib/client.js` | `1` |
| 订阅通道在 client 里 | `grep -c board-focus 订阅者抛错 lib/client.js` | `1` |
| client 门禁 | `pnpm build:client` | `[verify-client] OK  bundle=340871 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |

**解读**：文案与行为的对外生效点是**产物**（`package.json` 的 `main`/`exports` 指向 `dist/index.mjs`），
故三条都要在产物里检到，不能只看源码。

---

## E-3 · 运行中的宿主：重载插件前仍是 404（如实记录）

```
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:19387/dashboard
404
```

**解读**：正在运行的宿主进程是在**启动时**加载 dist 的；重建产物不会热替换已加载的模块。
所以「真机四步」必须在**重载插件（或重启宿主）之后**执行——这一步需要人在 GUI 侧操作，
证据（截图或文字记录）附在本目录或验收材料里。

---

## E-4 · 真机四步（待人工执行，重载插件后）

| # | 动作 | 期望 | 备注 |
|---|---|---|---|
| ① | `curl -i http://127.0.0.1:19387/dashboard` | 200 + `text/html` + body 含 `location.replace`（不再是 404） | 重载后执行；E-1 已在线级证明同一语义 |
| ② | 在会话里点工具回执中的 `board_link`（`/dashboard#pmboard?req=<REQ>`） | 看板面板打开并停在**该需求**详情 | 深链是**整页加载**，故 ② 才是主路径 |
| ③ | 看板面板已在屏时，从节点面板「项目看板 ↗」触发定位 | 当场切到目标需求（不刷新） | **不能靠「再点一次深链」构造**：那会整页刷新，走的是 ② 的路径 |
| ④ | 手工把 hash 改成 `#pmboard?req=abc`（或 `#pmboard`）后刷新 | 看板打开、不定位、控制台一条诊断，无报错 | UC-4；`?req=` 空值判 malformed |
