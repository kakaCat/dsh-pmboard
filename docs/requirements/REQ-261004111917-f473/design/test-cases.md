---
req: REQ-261004111917-f473
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 测试用例设计 · 看板深链 404 兼容（REQ-261004111917-f473）

> 每个用例标 `validates: FR-x`；`covers` 在拆分阶段回填任务 key（设计期还没有任务卡，
> 不在这里编造 t-xxxxxx）。
> 环境：vitest 默认 node，无 jsdom——用例按仓内既有手法注入最小桩（见 `tests/board-attach.test.ts`）。

## 新增/改动的测试文件 `serves: FR-1, FR-5`

| 文件 | 动作 | 覆盖 |
|---|---|---|
| `tests/legacy-board-route.test.ts` | 新增 | TC-1、TC-2（宿主 handler，最小假 `req/res`，零网络） |
| `tests/deep-link.test.ts` | 新增 | TC-3 ~ TC-6（解析 + 消费时序 + 重试兜底） |
| `tests/board-focus.test.ts` | 改（追加） | TC-7（订阅语义），既有 5 条必须继续全绿 |
| `tests/board-attach.test.ts` | 改（追加） | TC-8（已挂载看板被深链定向）、TC-9（dispose 退订） |
| `tests/tool-schema-board-link.test.ts` | 新增（可选） | TC-10（三处 schema 文案，FR-4） |

**跑法**：

```
npx vitest run tests/legacy-board-route.test.ts tests/deep-link.test.ts \
                tests/board-focus.test.ts tests/board-attach.test.ts
# 期望：全绿；且 tests/board-focus.test.ts 的既有 5 条用例仍在
```

## TC-1 · 兼容路由：GET 不再 404 且形状正确 `validates: FR-1` `serves: FR-1`

**目标**：`/dashboard` 的响应形状（状态、头、落点表达式）被钉死。

**前置**：`createLegacyBoardRouteHandler()`（假 `res` 收集 `writeHead`/`end`，同
`tests/reqboard/degraded-startup.test.ts` 手法）。

**步骤与预期**：

| 步骤 | 预期 |
|---|---|
| `handler({ method:'GET' }, res)` | `status === 200` |
| 查响应头 | `content-type` 含 `text/html`；`cache-control === 'no-store'` |
| 查响应体 | 含 `location.replace`；同时含 `location.search` 与 `location.hash` |
| `handler({ method:'HEAD' }, res)` | `status === 200`（无体由 Node 处理，handler 不自造分支） |

**可证伪点**：若 body 只写 `location.replace('/')`（丢 hash）→ 断言红——那会让「定位到需求」失效。

## TC-2 · 兼容路由：方法约束与幂等 `validates: FR-1` `serves: FR-1`

| 步骤 | 预期 |
|---|---|
| `handler({ method:'POST' }, res)` | `status === 405`；响应头含 `allow: GET, HEAD` |
| 连续两次 GET | 两次 `body` **逐字节相等**（无时间戳/随机） |
| 检查 body | 不含任何 `REQ-` 字样、不含台账字段名（`requirements`/`tasks`） |

## TC-3 · 解析六态表 `validates: FR-2, FR-3` `serves: FR-2, FR-3`

逐行断言 `parsePmboardDeepLink`（表见 `interfaces.md` §解析规则）：

| 输入 | 期望 |
|---|---|
| `''` / `'#'` / `'#other'` / `'#pmboardx'` | `{ kind: 'ignored' }` |
| `'#pmboard'` / `'#pmboard?'` / `'#pmboard?foo=1'` | `{ kind: 'ok' }`（`reqId` 为 undefined） |
| `'#pmboard?req=REQ-261004111917-f473'` | `{ kind: 'ok', reqId: 'REQ-261004111917-f473' }` |
| `'#pmboard?req=abc'` / `'#pmboard?req='` | `{ kind: 'malformed', raw: 'abc' \| '' }` |
| `'#pmboard?req=%20REQ-a%20'` | `{ kind: 'ok', reqId: 'REQ-a' }`（trim + 解码） |
| `'#pmboard?req=REQ-a&req=REQ-b'` | `reqId === 'REQ-a'`（取首） |

## TC-4 · 消费时序与结论 `validates: FR-2` `serves: FR-2`

**手法**：假端口记录调用序列（`calls: string[]`），`selectPanel` 立即成功。

| 场景 | 期望序列 | 期望返回值 |
|---|---|---|
| `#pmboard?req=REQ-a` | `clearHash` → `requestFocus(REQ-a)` → `selectPanel('dsh-pmboard')` | `'focused'` |
| `#pmboard` | `clearHash` → `selectPanel('dsh-pmboard')` | `'opened'` |
| `#pmboard?req=abc` | `clearHash` → `selectPanel(...)`（**无** `requestFocus`） | `'malformed'` |
| `#other` | （空序列） | `'ignored'` |

**可证伪点**：顺序颠倒（先 `selectPanel` 后 `requestFocus`）→ 序列断言红（不变量 I-4）。

## TC-5 · 重试与失败兜底 `validates: FR-3` `serves: FR-3`

注入同步 `defer`（`(run) => run()`）以便断言次数。

| 场景 | 期望 |
|---|---|
| `selectPanel` 前 2 次抛、第 3 次成功 | 返回 `'focused'`；`selectPanel` 恰好 3 次；`clearFocus` **0** 次 |
| `selectPanel` 恒抛（`maxAttempts: 3`） | 返回 `'failed'`；`selectPanel` 恰好 3 次；`clearFocus` 1 次；`peekBoardFocus() === undefined`（不变量 I-6） |
| `clearHash` 抛错 | 不中断：仍走到 `selectPanel`，返回 `'focused'`；`log` 被调 1 次 |
| `selectPanel` 抛非 Error（如字符串） | 不冒泡：仍按重试/失败路径收敛（不变量 I-8） |

## TC-6 · ignored 零副作用 `validates: FR-3` `serves: FR-3`

传入 `#other`，断言 **`clearHash` / `requestFocus` / `clearFocus` / `selectPanel` 调用次数全为 0**
（不变量 I-1）；并且调用前后 `peekBoardFocus()` 不变。

## TC-7 · board-focus 订阅语义 `validates: FR-2` `serves: FR-2`

| 场景 | 期望 |
|---|---|
| 无订阅者 `requestBoardFocus('REQ-a')` | `takeBoardFocus() === 'REQ-a'`（既有语义不变） |
| 有 1 个订阅者 `requestBoardFocus('REQ-a')` | 订阅者收到 `'REQ-a'`；**`peekBoardFocus() === undefined`**（不变量 I-7：不留 pending） |
| 有 2 个订阅者 | 两个都收到；退订其中一个后再登记 → 只有另一个收到 |
| 订阅者抛错 | 其他订阅者仍收到；调用方不抛（逐个 try/catch） |
| `requestBoardFocus('   ')` | 不清不通知订阅者；`peekBoardFocus() === undefined` |
| 既有 5 条用例 | 继续全绿（`take`/`peek`/`clear` 语义未被破坏） |

## TC-8 · 已挂载看板被深链定向（UC-3）`validates: FR-2` `serves: FR-2`

**手法**：复用 `tests/board-attach.test.ts` 的 `richContainer` + `stateWith([REQ_A])` 桩。

**步骤**：

1. `attachBoard(el, { poll: false })` → `await vi.waitFor(...)` 等首屏渲染完成（此时不为详情页）。
2. **挂载之后**调 `requestBoardFocus('REQ-a')`（模拟 UC-3：人已站在看板上点链接）。
3. `await vi.waitFor(() => expect(el.innerHTML).toContain('data-detail-req="REQ-a"'))`。

**期望**：无需重新挂载即切到该需求详情；`peekBoardFocus() === undefined`（走的是订阅通道，不是 pending）。

**可证伪点**：把订阅通道去掉 → 本用例红（正好证明它覆盖的是既有持有器覆盖不到的路径）。

## TC-9 · dispose 退订 `validates: FR-2` `serves: FR-2`

1. `attachBoard` → `dispose()`。
2. `requestBoardFocus('REQ-a')` → 断言 `peekBoardFocus() === 'REQ-a'`
   （订阅者已退订，故回到一次性语义 = 退订真的生效）。
3. `clearBoardFocus()` 收尾。

## TC-10 · 工具 schema 文案 `validates: FR-4` `serves: FR-4`

对 `StatusTool` / `CaptureTool` / `CreateTool` 三处的 `board_link.description` 断言：
含「并定位」，**不含**「可在会话中点击跳转」。同时断言三处 `/dashboard#pmboard?req=` 的
**产出字符串未变**（在 `QueryState` / `CreateRequirement` / `CaptureRequirement` 各自用例中断言）。

## E2E-1 · 真机端到端（人工，验收必做）`validates: FR-1, FR-2` `serves: FR-1, FR-2`

```
① curl -i http://127.0.0.1:19387/dashboard
   → 200 + text/html + body 含 location.replace（修复前 = 404，反向演练的基线证据）

② 重建后刷新 GUI：点会话里一条 board_link → 看板面板打开且停在该需求详情

③ 面板已在屏时再点一次 → 当场切换（UC-3）

④ 手工改 hash 为 #pmboard?req=abc 后刷新 → 看板打开、不定位、控制台一条诊断（UC-4）
```

## 回归与门禁清单 `serves: FR-1, FR-5`

| 命令 | 期望 |
|---|---|
| `npx vitest run tests/legacy-board-route.test.ts tests/deep-link.test.ts tests/board-focus.test.ts tests/board-attach.test.ts` | 全绿（含既有 5 条 focus 用例与既有 attach 用例） |
| `npx vitest run tests/reqboard tests/application tests/http` | 失败数 ≤ 开工基线（开工时实测并记进任务卡） |
| `npx tsc --noEmit` | 改动文件零新增 `error TS`（与开工基线比对） |
| `pnpm build:client` | `[verify-client] OK`（C-12：改了客户端源码必须重建） |
| `pnpm build` | 退出码 0，`dist/index.mjs` 与 `lib/client.js` 均有新产物（C-11） |

## 反向演练（故意破坏必红，证明用例真的在测东西）`serves: FR-5`

| 破坏 | 必须变红的用例 |
|---|---|
| 中转页写成 `location.replace('/')`（丢 hash） | TC-1 |
| 路由 handler 不判方法（POST 也回 200） | TC-2 |
| `consume` 里删掉 `clearHash()` | TC-4（I-2） |
| 把 `requestFocus` 挪到 `selectPanel` 之后 | TC-4（I-4） |
| `failed` 分支不调 `clearFocus` | TC-5（I-6） |
| 订阅者路径仍写 `pending` | TC-7（I-7）、TC-8 |
| 去掉 `board-mount` 的订阅（保留 `takeBoardFocus`） | TC-8（并证明它覆盖 UC-3） |
| `attachBoard` 的 dispose 不退订 | TC-9 |
