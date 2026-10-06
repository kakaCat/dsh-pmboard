# 自评审报告（REQ-261005213603-eaed）

> 范围：本需求全部改动的对抗式复核（**作者自审 + 逐卡复核段留痕，非独立评审人**）。
> 结论：**未发现需返工的缺陷**；三处与计划/设计相关的偏离或外部事实已具名（见 §三）。
> 独立复核以验收单的人工逐项裁决为准，本报告不作为通过依据。

## 一、复核对象

| 文件 | 角色 |
|------|------|
| `src/client/session-running.ts` | 判据唯一实现处：`requirementRunInFlight` / `requirementRunningMark` / `requirementBusy` + `RunningMark` |
| `src/client/render/dom-utils.ts` | `renderRunningDot`（唯一渲染单点，入参由布尔改 mark） |
| `src/client/views/artifacts.ts` | 泳道卡透传 mark |
| `src/client/views/board.ts` | 泳道卡与列表行两处映射改调 `requirementRunningMark` |
| `src/client/types.ts` | `RequirementRecord.advanceLockAt?` 读侧声明 |
| `docs/architecture/client-running-indicator.md`、`283d/design/{data-model,architecture}.md` | 旧红线取代标注（FR-6） |
| `tests/client-session-running.test.ts` / `client-view.test.ts` / `board-attach.test.ts` | TC-1～TC-22 |
| `docs/knowledge/code-map.{symbols.tsv,md}` | 签名变更后的知识层重生成（构建期产物） |

## 二、逐条对抗式检查

| 检查项 | 方法 | 结论 |
|--------|------|------|
| 判据是否只有一处 | 全仓 `grep requirementRunningMark` | 定义 1 处、调用 2 处（泳道卡 / 列表行），无第二份映射逻辑 |
| 渲染是否只有一处 | 全仓 `grep renderRunningDot(` | 定义 1 处、调用 2 处；无残留布尔传参（typecheck 兜底） |
| 阈值是否单一来源 | `grep -n "advanceLockStaleMs" src/client/session-running.ts` | 仅注释与默认值各一处；文件内无 `15 * 60_000` 字面量 |
| 运算符是否与 host 同口径 | 对照 `AdvanceChain.ts` 的 `runningOf` | 同为 `now - lock < staleMs`（恰好等于阈值判不在跑，TC-4 钉住） |
| 降级是否静默吞业务失败 | 通读新增函数 | 只把「非法输入 / 值不可得」判为不在跑，不吞业务失败；无 console 噪音 |
| 是否伪造运行态 | 复核新增判据的语义 | 推进锁是 host 认领 + 30s 心跳续租 + finally 清锁的证书，非时间戳近似；`updatedAt` / `autoRun` / `executions` 仍未启用 |
| 零回归 | TC-14 逐字节一致 + 位置契约两条断言 + token-card 2 参调用 | 全绿；`buildBoard` / `buildListView` 第 5/4 参签名未动 |
| 实时性是否引入新时序面 | `grep setInterval/setTimeout` 于改动文件 | 零新增；复用既有 SSE + 20s 轮询 |
| 样式与可访问性 | `BOARD_CSS` 断言 + aria/title 对照 | 样式分片与降级分支在；两种成因仅文案不同（读屏可辨） |
| 历史文档是否被改写 | 三处文档 `git diff --numstat` | 10/0、4/0、4/0——**纯新增**，283d 的历史结论与 D-x 表零改动 |
| 撤销范围是否最小 | 复核取代标注措辞 | 只撤销 `advanceLockAt` 一条；`executions[].outcome` 的禁用表述仍在（TC-25） |

## 三、偏离与外部事实（具名，不粉饰）

| # | 事实 | 处置 |
|---|------|------|
| 1 | 计划外的同文件改动：`session-running.ts` 模块头注「不伪造」段同步改写（原文把 `advanceLockAt` 与 `autoRun` 并列禁用，与本需求新增判据直接矛盾） | 保留并披露——注释与代码不能互相矛盾；已在 t1 汇报具名 |
| 2 | 工作区里两处**不属于本需求**的未提交改动：`src/client/types.ts` 的 `rollback?` 块（REQ-261005122915-9f90）、`src/client/views/artifacts.ts` 的 `renderPlanSection` 提示文案（FR-11） | 不改不碰；回滚演练与基线对比时逐文件只回退本需求 hunk，并在 t2 复核段与 t5 汇报具名 |
| 3 | 复核段自查抓出一处**自身偏离**：架构篇红线句最初被整行改写（2 行原文被替换），与「不删历史」纪律不一致 | 当场修正为「原文逐字保留 + 其后追加取代标注」，三处文档统一为纯新增 |
| 4 | KB 符号表陈旧（`renderRunningDot` / `renderListCard` 签名变更未重生成）导致 `kb-generate` 一度变红 | 跑 `pnpm kb:build` 重生成修掉；该次重生成按设计吸收了别的窗口在飞代码的符号（约 200 行），已在 t2/t5 汇报具名 |
| 5 | 全量并行时 `tests/header-progress-e2e.test.ts` 偶发 Chrome 启动失败 | 单跑 2 项通过（19.7s）；该探针渲染会话头部流程图，与本需求改动无交集；已在 t3/t5 汇报具名 |
| 6 | 拆分覆盖门的 UI 卡原型锚点维不消费 `prototype_exempt`，本需求无原型可锚 | 经人裁定按 `fullstack` 声明绕行（`decomposition.md` §4 披露），并建议另立需求修门 |

## 四、结论

- 判据、渲染、视图三处口径与设计文档逐条一致；无功能偏离；
- 反向验证（两次）证明用例可证伪；
- 回滚演练可逆、无残留；
- 遗留风险仅剩「残锁最多误亮 15min」（与 host 同阈值的刻意取舍）与第 6 条门禁缺口（已建议另立需求）。
