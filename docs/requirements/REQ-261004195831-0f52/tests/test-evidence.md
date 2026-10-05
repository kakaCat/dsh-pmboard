# 测试证据（REQ-261004195831-0f52）

> 环境：`/Users/mac/Documents/ai/dsh/dsh-pmboard`；本包 vitest 为 **node 环境（无 jsdom）**，
> 故取数编排走注入桩、渲染断言走纯函数 + 最小 DOM 桩（`attachBoard` 端到端）。

## 1. 新增用例（`tests/req-detail-ondemand.test.ts`，35 例）

```bash
npx vitest run tests/req-detail-ondemand.test.ts
# → Test Files 1 passed | Tests 35 passed
```

| 分组 | 例数 | 判据 |
|---|---|---|
| `req-detail-store` | 18 | 首次 ensure 恰 1 次取数；同 tick 三次 ensure 仍只 1 次请求；摘要 version / 台账 revision **上游更新才重取**且落后时不得重取（D2 锚点）；404→missing、5xx→error（message/hint/code 原样）；`null` 载荷落可恢复 error；结算回调抛错落 error（不被吞成卡死）；响应 id 不一致→丢弃且可重试恢复；retry 在途幂等、失败后可恢复；淘汰语义（谁被淘汰、在途条目不被淘汰）；get() 刷新淘汰序；reset 后迟到响应/迟到失败不写回；载荷无 revision 不得混源判失效 |
| `detail-states` | 7 | loading/missing/error 三态文案与标记；转义；hint 缺省不留空块；与 `buildError` 同口径 |
| `detail-defense` | 5 | **本 bug 回归锚点**：摘要形状调 `buildReqDetail` 不抛异常且含「暂无评论」；`null`/非数组同样不崩；全文路径仍渲染真实评论（兜底不掩盖）；`renderComments(undefined/null/[])` 逐字节一致 |
| `board-wiring` | 5 | 端到端经 `attachBoard`：恰 1 次详情请求且**渲染出全文里的真实评论**；404 落「未找到」且**不**弹回看板；先成功后删除 → 不拿旧数据顶着；首屏看板视图 **0 次**详情请求；卸载后迟到响应不写回 |

## 2. 既有契约与相关面

```bash
npx vitest run tests/state-payload-client.test.ts        # → 2 passed（首屏 0 次详情请求，未放宽断言）
npx vitest run tests/board-attach.test.ts                # → 9 passed（同根因既有失败 TC-8b 已修；TC-8 按 FR-2 新契约改写）
npx vitest run tests/stage-detail.test.ts tests/client-view.test.ts tests/prototype-parity.test.ts  # → 全绿
```

## 3. 变异测试（证明用例真的咬得住）

改坏源码 → 跑用例 → 还原（每次以 sha256 校验还原）：

| 变异 | 结果 |
|---|---|
| M1 丢弃不匹配响应后不落 error（回到永久 loading 活锁） | 红 |
| M2 取数函数真·同步调用（异常穿透 ensure） | 红 |
| M3 容量淘汰不优先挑非 loading | 红 |
| M4 retry 去掉在途幂等守卫 | 红 |
| M5 接线退回「摘要直传详情」（本 bug 原形态） | 红（端到端 2 例失败） |
| M6 终态优先级退回（旧数据压过「未找到」） | 红 |
| M7 null 守卫退回 `=== undefined` | 红 |
| M8 方向性判据退回 `!==` | 红 |
| M9 settle 的 catch 退回静默 | 红（敌意 getter 用例） |
| M10 `revision` 混源回落（第三轮 ③-1 原形态） | 红 |

## 4. 全量与类型检查

```bash
npx vitest run            # → Tests 98 failed | 4489 passed | 20 skipped（基线 106 failed；本需求未新增失败）
npx tsc --noEmit          # → 149 个错误（本需求改动前同状态 153）；本需求涉及文件 0 错误
pnpm build:client         # → [verify-client] OK  bundle=421051 bytes；构建戳 1adec318f8d0
```

残留失败说明：`tests/size-budget.test.ts` 为**既有失败**——其清单里全是本需求未触碰的历史超限文件；
本次新增文件为 315 行与 73 行（均 ≤400），`client/board-mount.ts` 在该门禁的白名单内。

## 5. 人工验收

GUI 手工项 M-1…M-5 见 `../verification.md`（证据文件）§6，**待人在验收单逐项打勾**。
浏览器需刷新页面以加载新 bundle（面板会提示「插件已更新」）。

## 6. 任务覆盖（`covers:` 标注 · 门禁可解析）

> 每个用例块对应一张任务卡（父卡 / 研发 / 复核 / 测试），证据指向本文件前五节与被钉住的用例文件。

## TC-1: 详情取数模块（父卡）

covers: t-41d3fe
validates: FR-1, FR-3

证据：`tests/req-detail-ondemand.test.ts` `req-detail-store` 分组 18 例全绿；`npx vitest run tests/req-detail-ondemand.test.ts -t req-detail-store` → 18 passed。

## TC-2: 详情取数模块·研发

covers: t-3fde63
validates: FR-1

证据：`src/client/req-detail-store.ts`（315 行）落盘；首次 ensure 恰 1 次取数、在途去重、按版本方向性失效三条判据各有用例。

## TC-3: 详情取数模块·复核

covers: t-79aecb
validates: FR-1, FR-3

证据：`reviews/independent-review.md` 三轮独立对抗式复核；必修项全部闭合（含接线缺口、永久 loading、重取风暴三条变异验证）。

## TC-4: 详情取数模块·测试

covers: t-efcbe6
validates: FR-1, FR-5

证据：`npx vitest run tests/req-detail-ondemand.test.ts` → 35 passed；全量 `npx vitest run` → 98 failed ≤ 基线 106。

## TC-5: 三态占位（父卡）

covers: t-35fe33
validates: FR-2

证据：`detail-states` 分组 7 例全绿（loading / missing / error 文案与标记、hint 缺省不留空块、与 buildError 同口径）。

## TC-6: 三态占位·研发

covers: t-d65f18
validates: FR-2

证据：`src/client/views/detail-states.ts`（73 行）三个纯函数；`npx vitest run tests/req-detail-ondemand.test.ts -t detail-states` → 7 passed。

## TC-7: 三态占位·复核

covers: t-5d1ccc
validates: FR-2

证据：对照 `design/interfaces.md §views/detail-states.ts` 逐条核对；外壳与 `buildReqDetail` 同根、事件委派零改动；无偏离。

## TC-8: 三态占位·测试

covers: t-ef3e09
validates: FR-2

证据：`-t detail-states` 7 passed；全文件 35 passed；`npx tsc --noEmit` 不高于基线。

## TC-9: 缺字段防御（父卡）

covers: t-48dfcb
validates: FR-4

证据：`detail-defense` 分组 5 例全绿，含本 bug 回归锚点（摘要形状调 `buildReqDetail` 不抛异常）。

## TC-10: 缺字段防御·研发

covers: t-c86e99
validates: FR-4

证据：`renderComments` 放宽入参（undefined/null/非数组 → 与空数组逐字节一致）；`stage-detail` / `stage-panel` / `timeline` 同口径兜底。

## TC-11: 缺字段防御·复核

covers: t-3a2c18
validates: FR-4

证据：反向断言在用例里（全文路径仍渲染真实评论，兜底不掩盖）；既有调用点零影响；无偏离。

## TC-12: 缺字段防御·测试

covers: t-63ab91
validates: FR-4

证据：`npx vitest run tests/stage-detail.test.ts tests/client-view.test.ts tests/prototype-parity.test.ts` 全绿。

## TC-13: 详情接线（父卡）

covers: t-f075e2
validates: FR-1, FR-2, FR-3

证据：`board-wiring` 分组 5 例端到端（经 `attachBoard` 真渲染全文评论、404 不弹回看板、旧数据不遮终态、首屏 0 次详情请求、卸载后迟到响应不写回）。

## TC-14: 详情接线·研发

covers: t-26fdc8
validates: FR-1, FR-2, FR-3

证据：`board-mount` `case 'req'` 四态渲染 + 删除静默回退 + retry-detail 委派 + 草稿/Tab 回填；变异 M5（退回摘要直传）判红。

## TC-15: 详情接线·复核

covers: t-969e89
validates: FR-2, FR-3

证据：独立复核确认首轮「决定性缺口」（模块零调用点）已闭合；终态优先级变异 M6 判红。

## TC-16: 详情接线·测试

covers: t-08ac32
validates: FR-1, FR-2

证据：`-t board-wiring` → 5 passed；`pnpm build:client` → `[verify-client] OK`（构建戳 1adec318f8d0）。

## TC-17: 回归收口（父卡）

covers: t-0f476e
validates: FR-5

证据：全量 98 failed ≤ 106；`npx tsc --noEmit` 149 ≤ 153；bundle 重建通过；证据文件齐备。

## TC-18: 回归收口·研发

covers: t-cd9ea3
validates: FR-5

证据：retry 用例（失败后强制取数、在途连点不叠请求）；`evidence/verification.md` 落盘。

## TC-19: 回归收口·复核

covers: t-d0920b
validates: FR-5

证据：证据文件逐项可复跑、复核结论如实（两轮必须返工 + 第三轮通过）、人工项标为待人打勾、残余风险登记。

## TC-20: 回归收口·测试

covers: t-d7d219
validates: FR-5

证据：`npx vitest run tests/req-detail-ondemand.test.ts tests/state-payload-client.test.ts` → 37 passed；全量与类型检查均低于基线。
