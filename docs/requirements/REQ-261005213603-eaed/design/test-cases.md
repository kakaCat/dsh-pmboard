# 测试用例设计（REQ-261005213603-eaed）

> 只写**可执行、可失败**的判据：每条 = 「跑什么 / 看到什么算过」。
> 任务级 `covers: t-*` 标注由实施阶段回填（任务在拆分阶段才存在，本阶段不虚构编号）。

## 测试层级与命令 `serves: FR-1`

| 层级 | 位置 | 命令 | 判据来源 |
|---|---|---|---|
| 判据单测（纯函数） | `tests/client-session-running.test.ts`（扩展） | `npx vitest run tests/client-session-running.test.ts` | FR-1、FR-2、FR-5 |
| 渲染 / 位置契约 | `tests/client-view.test.ts`（扩展） | `npx vitest run tests/client-view.test.ts` | FR-1、FR-3、FR-5 |
| 挂载实时增隐 | `tests/board-attach.test.ts`（扩展） | `npx vitest run tests/board-attach.test.ts` | FR-4 |
| 文档取代标注 | 无需测试框架（grep 探针） | `grep -n "REQ-261005213603-eaed" <两处文件>` | FR-6 |
| 类型 / 构建 | 仓库规范 C-15 / C-12 | `pnpm typecheck`、`pnpm build:client` | 交付底线 |
| 全量回归 | 仓库规范 C-14 | `pnpm test`（与改动前基线比对，不许新增失败） | 交付底线 |

## 判据真值表 `serves: FR-1, FR-2, FR-5`

被测对象：`requirementRunInFlight(req, now, staleMs?)` / `requirementRunningMark(req, isRunning, now, staleMs?)`。

| # | 输入 | 期望 | 失败即意味着 |
|---|---|---|---|
| TC-1 | `{ advanceLockAt: now - 60_000 }`，阈值缺省 | `true`（新鲜） | 判据没生效 |
| TC-2 | `{}`（键缺失） | `false` | 缺键被当成在跑 |
| TC-3 | `{ advanceLockAt: null }` / `'123'` / `NaN` / `Infinity` | `false` | 非有限值被强转 |
| TC-4 | `{ advanceLockAt: now - 15 * 60_000 }`（恰好阈值） | `false` | 运算符写成 `<=`（与 host 分叉） |
| TC-5 | `{ advanceLockAt: now + 60_000 }`（未来） | `true` | 负差值被误判过期（与 host 分叉） |
| TC-6 | 显式 `staleMs = 1_000` + `lockAt = now - 5_000` | `false` | 阈值参数没被使用 |
| TC-7 | 席位窗口在跑 + 锁也新鲜 | `{ cause: 'session' }` | 成因优先级被写反 |
| TC-8 | 仅锁新鲜 | `{ cause: 'run' }` | run 成因不可达 |
| TC-9 | 都不成立 | `undefined` | 返回了空对象（会被渲染成空壳） |
| TC-10 | `requirementBusy` 与 `requirementRunningMark` 在同四组输入下 | 两者结论恒一致（`true ⟺ mark !== undefined`） | 两个导出漂移 |

**计数**：新增 ≥10 条断言（并入既有 17 项之上，模式照 `tests/client-session-running.test.ts` 的 `fakeAccess` 风格——判据用例不需要假服务，注入 `now` 即可）。

## 渲染与位置契约 `serves: FR-3`

| # | 输入 / 操作 | 期望 | 失败即意味着 |
|---|---|---|---|
| TC-11 | `buildBoard(state, now, 'lanes', {}, undefined, new Set())`，需求 `advanceLockAt = now - 60_000` | 含 `data-running="true"` 且含 `aria-label="后台 run 进行中"` | run 成因没接到渲染 |
| TC-12 | 同需求，`running` 集合含绑定窗口（锁也新鲜） | `data-running="true"` 出现次数 == 1，且 `aria-label="会话进行中"` | 双成因渲染两个圈 / 成因串号 |
| TC-13 | 同需求，`advanceLockAt = now - 15 * 60_000` | 不含 `data-running` | 过期锁仍亮 |
| TC-14 | 同需求，`advanceLockAt` 缺省 + 省略 `running` 参数 | 输出与 `buildBoard(state, 1)` / 空集版本**逐字节相等**，不含 `data-running` | 破坏「旧调用点零回归」（既有 TC-09） |
| TC-15 | A 需求持锁、B 需求不持锁（同页） | 只有 A 的卡含 `data-running` | 判据串了需求 |
| TC-16 | 列表视图同一需求 | 含 `data-running="true"`；`dsh-pm-td-title` 切片内不含 | 位置回归到标题列（既有位置契约） |
| TC-17 | 泳道卡切片 | 仍含 `<span class="dsh-pm-card-id">REQ-x</span><span class="dsh-pm-running"` | 位置契约被破坏 |
| TC-18 | `BOARD_CSS` | 仍含 `.dsh-pm-running` 与 `@keyframes dsh-pm-running-spin` | 样式分片被改坏 |

## 实时增隐与门控 `serves: FR-4, FR-5`

| # | 操作 | 期望 | 失败即意味着 |
|---|---|---|---|
| TC-19 | 挂载看板后，把 `state` 里该需求的 `advanceLockAt` 改为新鲜 → 触发一次状态刷新（模拟 SSE） | 重绘后出现 `data-running="true"` | run 判据没随载荷刷新 |
| TC-20 | 再把锁改为过期 / 删除并刷新 | 重绘后不含 `data-running` | 熄灭路径缺失 |
| TC-21 | 只让**无关**会话 `running` 抖动（会话 store 通知），需求锁不变 | 重绘次数不增加（既有门控仍生效） | 门控被破坏 |
| TC-22 | `dispose()` 后触发刷新 | 不发生重绘、不抛错（既有断言） | 生命周期回归 |

## 文档取代标注 `serves: FR-6`

| # | 命令 | 期望 |
|---|---|---|
| TC-23 | `grep -n "REQ-261005213603-eaed" docs/architecture/client-running-indicator.md` | 至少 1 处命中（取代标注） |
| TC-24 | `grep -n "REQ-261005213603-eaed" docs/requirements/REQ-261004210128-283d/design/data-model.md` | 至少 1 处命中 |
| TC-25 | `grep -n "executions\[\].outcome" docs/architecture/client-running-indicator.md` | 仍命中（执行记录判据**未被**解禁） |

## 人工 E2E 复现 `serves: FR-4, FR-5`

6 步可失败路径（agent 无浏览器操作能力时，把本条交给验收人执行）：

1. 打开项目看板（泳道视图），记下目标需求卡面**没有**转圈；
2. 在窗口里调 `reqboard_task_run`（或等自动链自动触发）——投递即返回，窗口回合结束；
3. 看板**不刷新**，等 ≤1 次 SSE 往返 → 卡面 REQ id 后出现转圈，hover 文案为「后台 run 进行中（子卡链在执行，窗口可以已空闲）」；
4. 切到列表视图 → 同一需求 ID 单元格内出现同款圈（位置与泳道一致）；
5. 等 run 跑完 → ≤20s 内圈消失（不刷新页面）；
6. 反向对照：另一条无 run 的需求全程无圈。

## 判定标准 A → 用例对照 `serves: FR-1`

| 条款 | 对应断言 |
|---|---|
| FR-1 | TC-1、TC-7、TC-8、TC-15、TC-19 |
| FR-2 | TC-2～TC-6、TC-10、TC-13 |
| FR-3 | TC-11、TC-12、TC-16、TC-17、TC-18 |
| FR-4 | TC-19、TC-20、TC-21、TC-22、人工 E2E 第 3/5 步 |
| FR-5 | TC-3、TC-9、TC-14、TC-15、TC-21 |
| FR-6 | TC-23、TC-24、TC-25 |

## 基线阈值（不许放宽） `serves: FR-1`

- `pnpm typecheck`：退出码 0（规范 C-15）。
- `pnpm build:client`：`[verify-client] OK`（规范 C-12；client 源码改了必建 bundle）。
- `pnpm test`：改动前后各跑一次全量，**失败集合不得新增**（规范 C-14）；基线必须取改动前的同一命令输出（不许 stash 整份文件取基线）。
- 三个目标用例文件：`tests/client-session-running.test.ts`、`tests/client-view.test.ts`、`tests/board-attach.test.ts` 全绿。

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 判据验证方式 | 起服务跑 E2E 判新鲜度 | 纯函数真值表 + 渲染断言 | 判据是纯函数，穷举边界（恰好 stale / 未来时间）比 E2E 更可靠 |
| 实时性验证 | 起浏览器计时 | 挂载用例模拟一次状态刷新 + 人工 E2E 步数 | 20s 轮询与 SSE 是既有机制，单测不该重玩 |
| 残锁场景 | 等 15min 实测 | 用注入的 `staleMs` 缩小窗口 | 同一判据、可控时钟；不引入测试专用分支 |

## 技术方案与亮点 `serves: FR-1`

- **判据与时间解耦**：`now` 与 `staleMs` 都注入 ⇒ 15min 窗口、未来时间、恰好阈值三类边界可在毫秒内跑完（可核验指向：TC-4/TC-5/TC-6）。
