# 测试用例设计（REQ-261007191737-0eb5）

> 两份新用例文件 + 三条回归。每条 TC 都写「跑什么、看到什么」，可直接照着实现。

## 功能测试用例 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

### TC-1 代写命中：人工项零输入通过 <!-- serves: FR-1 -->

- `validates: FR-1` · 文件 `tests/needs-human-proxy.test.ts`
- 构造：`{ needsHuman: true, humanReason: '界面视觉需人对照权威原型', result: '与权威原型对照：布局一致；差异 1 处（格子取 208×n）' }`，裁决 `{ status: 'passed' }`（无 opinion）。
- 期望：`item.status === 'passed'`、`item.opinion === item.result`、`item.opinionSource === 'agent'`。
- 命令：`npx vitest run tests/needs-human-proxy.test.ts` → 退出码 0。

### TC-2 开关关闭逐字回今天 <!-- serves: FR-5 -->

- `validates: FR-5` · 同文件
- 构造：同 TC-1，但 `DSH_REQBOARD_NO_HUMAN_PROXY=1`。
- 期望：`item.status === 'unverified'`、`item.unverifiedReason === 'blank_pass'`、无 `opinionSource`。
- 命令：同上（用例内切换 env 或用例级注入 `humanProxyEnabled` 的布尔入参）。

### TC-3 无 result 的人工项不代写 <!-- serves: FR-3 -->

- `validates: FR-3` · 同文件
- 构造：`{ needsHuman: true }`（无 `result`），裁决 `passed`（无 opinion）。
- 期望：`status === 'unverified'`、`unverifiedReason === 'blank_pass'`，`opinion` 未写。
- 补偿路径断言：同一项由人补写合格文本后重裁 → `passed` 且 `opinionSource === 'human'`。

### TC-4 有 result 但不是事实形态 → 不代写 <!-- serves: FR-3 -->

- `validates: FR-3` · 同文件
- 构造：`{ needsHuman: true, result: 'PASS' }`（既短又无观察词）。
- 期望：与 TC-3 相同（`unverified(blank_pass)`）——证明代写**不是**无条件吃 `result` 兜底。

### TC-5 普通项回归：锚点兜底不变 <!-- serves: FR-3 -->

- `validates: FR-3` · 同文件
- 构造：`{ result: 'command: npx vitest run tests/x.test.ts → 10 passed' }`（非人工项、带锚点），裁决 `passed`（无 opinion）。
- 期望：`status === 'passed'`，`opinion` 取 `result`，且 `opinionSource` **不是** `'agent'`（普通项走既有锚点路径，不属代写）。

### TC-6 人自填太薄仍被拒 <!-- serves: FR-3 -->

- `validates: FR-3` · 同文件
- 构造：人工项，裁决 `{ status: 'passed', opinion: '通过' }`。
- 期望：抛错，消息含 `opinion_required`（传输码）与该 itemId；台账零改动。

### TC-7 人自填合格事实 → 来源为 human <!-- serves: FR-2 -->

- `validates: FR-2` · 同文件
- 构造：人工项 + agent 有 `result`，裁决 `{ status: 'passed', opinion: '我打开游戏与原型对照：布局一致，无错位' }`。
- 期望：`opinion` = 人写的文本、`opinionSource === 'human'`（人写的覆盖 agent 参照材料）。

### TC-8 看板渲染：候选属性与徽标 <!-- serves: FR-1, FR-2 -->

- `validates: FR-1, FR-2` · 文件 `tests/board-needs-human-proxy.test.ts`
- 构造：一张含三类行的验收单——a) 人工项 + 事实 `result`；b) 人工项无 `result`；c) 普通项带锚点。
- 期望：a 行含 `data-proxy-candidate="1"` 与「agent 代写（人已确认）」徽标；b、c 行不含该属性与徽标。

### TC-9 看板收集：候选行留空可提交、非候选行被拦 <!-- serves: FR-1, FR-4 -->

- `validates: FR-1, FR-4` · 同文件
- 构造：模拟 `submit-verdicts` 事件——a 行勾通过 + 留空；b 行勾通过 + 留空。
- 期望：a 行产生无 `opinion` 的 verdict 并被采纳；b 行被拦下，提示文本含 b 的 itemId 与样例（不发请求）。

### TC-10 FR-4 补问：补写落库 / 未补零改动 <!-- serves: FR-4 -->

- `validates: FR-4` · 文件 `tests/needs-human-proxy.test.ts`（弹框路径）
- 构造甲：人工项无事实 `result` + 人留空 → 触发一轮补问（question id 以 `#human-fact` 结尾、题干含 itemId）→ 人补写合格文本 → 期望整批落库且该项 `passed`、来源 `'human'`。
- 构造乙：同上但人未补（取消）→ 期望裁决前后 `verification.json` 的 `sheet.items[].status` **逐项不变**（零改动）。

### TC-11 老台账兼容 <!-- serves: FR-2 -->

- `validates: FR-2` · 同文件
- 构造：一项只有 `opinion`、无 `opinionSource`（存量形态）。
- 期望：渲染/回执不报错，**不**显示代写徽标，也不把它算作 agent 代写（按「人写 / 未知」）。

### TC-12 verification.md 渲染标注 <!-- serves: FR-2 -->

- `validates: FR-2` · 同文件
- 构造：一张含 `opinionSource='agent'` 与 `'human'` 两行的验收单 → 生成 `verification.md` 文本。
- 期望：代写行含「代写」字样；人写行不含。

### TC-13 生效链：构建产物含新符号 <!-- serves: FR-1 -->

- `validates: FR-1` · 构建后执行（KB C-11 / C-12 / `kb-0006`）
- 命令：`pnpm build && pnpm build:client` → 均退出码 0；`grep -c "opinionSource" dist/index.mjs` ≥ 1、`grep -c "data-proxy-candidate" lib/client.js` ≥ 1。
- 期望：宿主重启 / 页面刷新后现场行为即新口径（不构建则现场照旧，这是本仓实测过的坑）。

## 测试覆盖度统计 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| FR | 覆盖用例 |
|---|---|
| FR-1（零输入采纳） | TC-1、TC-8、TC-9、TC-13 |
| FR-2（来源可辨） | TC-7、TC-8、TC-11、TC-12 |
| FR-3（不达标仍拦） | TC-3、TC-4、TC-5、TC-6 |
| FR-4（提交前补问） | TC-9、TC-10 |
| FR-5（回滚开关） | TC-2 |

| 回归套件 | 命令 | 期望 |
|---|---|---|
| 验收裁决快照 | `npx vitest run tests/accept-verdicts-snapshot.test.ts` | 退出码 0（原子性与文案不变） |
| 零输入通过 | `npx vitest run tests/accept-sheet-zero-input.test.ts` | 退出码 0（普通项穷尽探针） |
| 验收判据 | `npx vitest run tests/acceptance-criteria.test.ts` | 退出码 0 |
| 类型检查 | `pnpm typecheck` | 退出码 0（C-15） |
| 基线比对 | `pnpm baseline:check` | 失败用例集合差为空（C-14，基线 `docs/reviews/test-baseline.md`） |

## 关键决策与取舍 <!-- serves: FR-3, FR-5 -->

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 两份新用例文件而不是把用例塞进既有文件 | 少建文件 | 新口径集中可读（回滚、兼容、通道同构都在一处）；既有文件已经承载快照与穷举探针，混进来会让失败定位变慢 |
| 代写判据用**纯函数穷举**而不是只跑端到端 | 只写一条端到端用例 | 端到端只覆盖一条路径；判据是「三条件同时成立」的组合逻辑，穷举成本极低（纯函数），能挡住组合回归 |
| TC-2 用 env 开关而不是删掉代写代码 | mock 掉函数 | 开关是本需求交付物的一部分（FR-5），用例必须走真实开关读取路径 |
| 明确排掉「agent 自动通过」的用例 | 写一条「无人在场也归档」的用例 | 那不是待实现行为，而是**不得存在**的行为；它由 `design/backend.md` 的安全设计表逐路径排查 + TC-3/TC-4 的负例间接守住 |

## 技术方案与亮点 <!-- serves: FR-1 -->

- **负例优先**：13 条里 5 条是「不该代写/不该通过」的负例——本需求的回归风险几乎全在「放得太开」，用例重心压在边界上。
- **可复制执行**：每条 TC 都给了可直接粘贴的命令（`npx vitest run <file>`），实施期不必再解释怎么跑。
- **生效链进用例**：TC-13 把「改 src 不构建则现场照旧」变成一条可断言的读数，避免「代码改了、现场没变」被误判成功能没做。
