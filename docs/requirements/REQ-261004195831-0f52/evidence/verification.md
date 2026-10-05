# 交付证据（REQ-261004195831-0f52）

> 汇总本轮修复的可复核证据：命令 + 输出摘要 + 独立复核结论。
> 环境：`/Users/mac/Documents/ai/dsh/dsh-pmboard`（本仓），Node 侧 vitest（无 jsdom）。

## 1. 缺陷与根因（一句话）

`GET /state` 自 B12 阶段⑥-① 起只下发**摘要**（无 `comments` 等本体字段），客户端详情视图仍把摘要
当全文渲染 → `renderComments(req.comments)` 对 `undefined` 取 `.length`，
详情页点开即 `TypeError: Cannot read properties of undefined (reading 'length')`（`client.js:3010`）。

**线上实测（本机 GUI 服务 127.0.0.1:19387）**：

| 请求 | 观察 | 结论 |
|---|---|---|
| `GET /dashboard/api/reqboard` | 该需求键集合含 `commentCount`，**不含** `comments` | 首屏确实是摘要（崩溃输入形状成立） |
| `GET /dashboard/api/reqboard/requirements/REQ-261004195831-0f52` | `success=true`，`comments` 19 条、`artifacts` 存在 | 全文端点可用（修复的数据源成立） |

## 2. 新增/改动用例

```bash
npx vitest run tests/req-detail-ondemand.test.ts tests/state-payload-client.test.ts
```
→ `Test Files 2 passed | Tests 29 passed`（新增文件 29 例；含 FR-1~FR-5 与端到端接线分组）。

| 分组 | 判据 |
|---|---|
| `req-detail-store`（15 例） | 取数恰 1 次、在途去重、按 version/revision 失效、404→missing、5xx→error、丢弃响应不留 loading、同步抛不穿透、retry 幂等、淘汰语义、get 刷新淘汰序 |
| `detail-states`（7 例） | loading/missing/error 占位文案、转义、hint 缺省不留空块、与 `buildError` 同口径 |
| `detail-defense`（5 例） | 摘要形状调 `buildReqDetail` 不抛异常（本 bug 回归锚点）、`renderComments(undefined/null/[])` 逐字节一致 |
| `board-wiring`（2 例） | 经 `attachBoard` 端到端：详情恰 1 次请求且渲染出**全文里的真实评论**；404 落「未找到」且**不**弹回看板 |

## 3. 变异测试（证明用例真的能咬住）

改坏源码 → 跑用例 → 还原（每次均已用 sha256 校验还原）。

| 变异 | 结果 |
|---|---|
| M1 丢弃不匹配响应后不落 error（退回永久 loading 活锁） | 红 ✅ |
| M2 取数函数真·同步调用（异常穿透 ensure） | 红 ✅ |
| M3 容量淘汰不优先挑非 loading（在途条目被淘汰） | 红 ✅ |
| M4 retry 去掉在途幂等守卫 | 红 ✅ |
| M5 接线退回「摘要直传详情」（本 bug 原形态） | 红 ✅（board-wiring 2 例失败） |

## 4. 本仓 C 系列检查

```bash
npx tsc --noEmit -p tsconfig.json     # C-15
```
→ 全仓 **153** 个错误（本需求改动前同为 153）；本需求涉及文件 **0** 错误。

```bash
pnpm build:client                     # C-12
```
→ `[verify-client] OK  bundle=420360 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整`。

```bash
npx vitest run                        # C-14
```
→ `Test Files 47 failed | 375 passed | 3 skipped (425)` / `Tests 98 failed | 4479 passed | 20 skipped (4597)`
→ 失败数 **98 ≤ 基线 106**；其中 `tests/size-budget.test.ts` 为**既有失败**（清单里全是本需求未触碰的历史超限文件，
本次新增两个文件分别 296 / 73 行，均 ≤400；`client/board-mount.ts` 在白名单内）。

**副作用收益**：`tests/board-attach.test.ts` 由「1 failed」变为「9 passed」（TC-8b 是既有失败，
其根因同为本 bug：详情取全文失败后无法进入详情）。

## 5. 契约变更留痕（需人知晓）

- **行为变更（FR-2）**：详情取不到时**不再**静默 `mode = board` 弹回看板，而是留在详情态显示
  「未找到」/「失败 + 重试」。`tests/board-attach.test.ts` 的 TC-8 已按新契约改写。
- `ApiError` 新增可选 `status`（HTTP 状态码）：服务端 404 未带 `code` 时也能判「未找到」。
- 客户端内部新增：`src/client/req-detail-store.ts`、`src/client/views/detail-states.ts`（均纯函数/纯逻辑）。
- **retry 语义精化（interfaces.md §req-detail-store 的字面补全）**：该节写的是「清掉该 id 的旧结果后
  强制取数」。实现对**在途**情形补了一条：已在取数时 `retry` 是**幂等空操作**（连点不叠加请求，
  也不清掉正在渲染的条目 → 不闪空）。非在途时行为与文档逐字一致（清条目 → 立刻登记 loading → 取数）。
  这是补全而非推翻，故未重开设计确认门；若要写进设计文档，需在设计产物上走一次带 `change_note` 的重交。

## 5bis. 独立复核发现并已修的缺陷（第二轮，均已变异验证）

| 缺陷 | 现象 | 修法 | 变异验证 |
|---|---|---|---|
| D1（P0） | `requirement: null` 骗过 `typeof null === 'object'` → 守卫抛错被裸 catch 吞掉 → 条目永久 loading | 守卫改 `record == null`；`settle` 的 catch 落 `error` 条目（`REQBOARD_DETAIL_SETTLE_FAILED`） | MD1 红 ✅（null 用例）、MD3 红 ✅（敌意 getter 用例） |
| D2（P1） | 失效判据用 `!==`：详情响应比 `/state` 新（写入落在两次 head() 读之间）时恒真 → 重取→重绘→ensure 自持成环（复核实测 50ms 内 250 次请求） | 两个判据改**方向性**比较（`上游 > 手里`） | MD2 红 ✅ |
| D3（P1） | 旧全文优先于 missing/error → 需求被删后仍渲染陈旧全文、重试入口不可达 | missing/error 分支提到旧数据之前 | M6 红 ✅ |
| D6（P2） | `views/stage-detail.ts` 终态早退之后的两处死比较（tsc TS2367×3 / TS2678×1） | 删掉多余的 `!== 'done'/'canceled'/'archived'` 包裹与 `case 'done'` 死分支（早退已覆盖，行为不变） | 类型错误 153 → **151**；`tests/stage-detail.test.ts` / `client-view.test.ts` / `prototype-parity.test.ts` 全绿 |

残余（明确记录，不假装已覆盖）：D4「dispose → `reqDetail.reset()`」是**内存卫生 + 双保险**——
界面侧另有一道 `disposed` 守卫，故删掉 `reset()` 不会有可观察差异（复核的 MD2 变异实测仍全绿）。
本轮补的用例只覆盖可观察的一半（卸载后迟到响应不得写回界面），已在用例注释里如实标注。


## 6. 人工验收（GUI · 待人在验收单逐项打勾）

| 步骤 | 操作 | 期望 |
|---|---|---|
| M-1 | 刷新页面（浏览器当前仍加载旧 bundle，面板会提示「插件已更新」）→ 点任一需求卡 | 详情正常渲染；控制台无 `TypeError`；评论条数与台账一致 |
| M-2 | DevTools Network 过滤 `requirements/` | 打开详情恰 1 条 `requirements/<id>`（200）；首屏加载**没有**该请求 |
| M-3 | 详情停在「时间线」Tab → 另一窗口给该需求加评论 | 评论自动出现；Tab 未跳回「概览」；评论输入框草稿仍在 |
| M-4 | DevTools 把 `requirements/<id>` 设 500/offline 后刷新详情 | 显示失败原因 + 重试；恢复网络后点重试 → 进入正常详情 |
| M-5 | 手改 URL 为已删除需求的 `?req=` | 显示「未找到」+ 返回看板；**不**静默跳回看板 |

> 说明：M-1/M-2 的浏览器侧点击断言由**端到端用例 `board-wiring`** 机械覆盖（同一路径：
> `attachBoard` → 摘要首屏 → 详情取全文 → 渲染真实评论）；仍需人在真机确认观感与交互细节。

## 7. 独立复核

- 首轮（对抗式，subagent 独立上下文）：**必须返工** —— 抓到 2 个 P0（丢弃响应致永久 loading 活锁、
  同步抛穿透 ensure）、P1（淘汰×在途、通知早于在途登记）、P2/P3 若干、**接线缺口**（模块无人调用），
  并指出 2 条弱断言与 1 条把坏行为写死的断言。
- 第三轮（定点复核，独立上下文）：结论 **可复核通过** —— D1/D2/D3 与 stage-detail 死比较四条
  全部「复现 + 变异」双向闭合（含忠实复刻 board-mount 重绘环量请求数：修复版 1 次请求/2 次重绘，
  判据退回 `!==` 则 501 次请求/1000 次重绘）；另提 1 条同源收尾项（`revision` 混源回落 → 已修，
  新增「载荷不带 revision 不得混源判失效」用例，变异 M7 判红）与 4 条记录级建议（不阻塞）。
- 三份被复核文件在每轮复核前后均以 sha256 逐字节校验，复核者自证未留改动。
- **记录级残余（不阻塞，如实登记）**：① 上游版本号**后退**（迁移重编号 / 回滚脚本）时方向性判据
  不会自愈，页面停在旧全文直至刷新；② 上游前进 + 重取悬挂的窗口内（≤8s 超时）仍展示旧全文，
  无「更新中」提示；③ 摘要 version 与记录 version 不同源且载荷无 revision 时两个判据都不成立
  （选择「不重取」而非「混源成风暴」——宁可陈旧，不许自击）。

