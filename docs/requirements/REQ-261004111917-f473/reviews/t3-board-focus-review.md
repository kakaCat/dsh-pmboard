# 复核报告 · t3 定位订阅通道（t-5f475a 研发段 t-45ecd7）

- **复核方式**：独立子代理（fresh context、**只读**）
- **被复核对象**：`src/client/board-focus.ts`（订阅通道 + `requestBoardFocus` 语义分叉）、`src/client/board-mount.ts`（挂载订阅 / dispose 退订）、两个测试文件
- **对照契约**：`design/interfaces.md` §board-focus 契约变更 / §board-mount 订阅点契约、`design/data-model.md` 不变量 I-7（与 I-6 的失败清理）
- **结论**：**可以过复核（条件放行）**：代码与契约、I-7/I-6 逐条一致，19/19 用例与 tsc 全绿；两条新用例对「去掉订阅」「dispose 不退订」都是真能变红的

## 逐条核对（摘要）

| 检查项 | 结论 |
|---|---|
| 语义分叉：有订阅者→同步通知全部 + pending 清空；无订阅者→**逐字**保持原一次性语义；空白/非字符串只清 pending 不通知 | 一致（与 HEAD 版旧实现逐字等价已核对） |
| 防双跳（I-7）；`take/peek/clear` 语义未破坏 | 一致；复核者另指出更强的不变式：**subscribers>0 ⟹ pending===undefined**（pending 只在无订阅者分支被写） |
| 订阅生命周期：退订幂等、dispose 必退订、重复 dispose / 多次挂载 / HMR | 一致（R8/R9 低危见下） |
| 订阅者隔离：单个抛错不影响其他与调用方；通知期间集合被改 | 一致（快照拷贝） |
| handler 与既有 `open-req` 一致；`disposed` 后不改状态 | 一致（逐句同款；`render()` 首行早退 + `viewEl=undefined` 双保险） |
| 与 t2 消费端交互（focused 记账 + 失败清理是否自洽） | 一致（有订阅者时 deep-link 不写 pending，失败兜底对自己是 no-op） |
| 对既有调用方（board-entry / conversation-progress）两种顺序的影响 | **改善**：未挂载顺序与改造前一致；已挂载顺序从「点了没反应 + 意图滞留」变成当场切详情 |
| 测试可证伪性 | TC-8/TC-9 确实走订阅通道（`data-detail-req` 全仓唯一产出点已核） |

## 偏离与风险清单 + 处置

| # | 风险 | 处置 |
|---|---|---|
| R1 | **运行态产物 `lib/client.js` 未含本卡改动**（中高，运维项；产物 11:42 早于源码 11:43） | **已修**：当场 `pnpm build:client` → `[verify-client] OK`，并取证产物含订阅诊断串 |
| R2 | **订阅无可见性门闩：已挂载但不可见的看板会「吃掉」意图**（中低） | **已修**：监听者可显式返回 `false` 表示「本实例没消费」；handler 在 `disposed \|\| !isActive()` 时返回 `false`；**全部未消费时意图回落为 pending**；新增 TC-8c（`isActive()=false` → 不切详情且 peek 仍得值） |
| R3 | 唯一订阅者抛错 → 意图被静默吞掉（低） | **已修**：抛错按「未消费」处理并 `console.warn`；新增 TC-7h（全部抛错也回落 pending） |
| R4 | 用例/文档追溯漂移：新用例无 TC-7 编号、attach 里出现两条同名 TC-8、test-cases 与 interfaces 对空白输入措辞相左 | **已修/已记账**：新用例补 TC-7a~TC-7i；attach 改名 TC-8b/TC-8c/TC-9b；措辞冲突按 interfaces 实现（清 pending、不通知）并在验收材料记账 |
| R5 | 空白输入「清 pending」不可证伪（前置本身 pending 为空） | **已修**：TC-7e 先留一条 pending 再传空白，断言 peek 为空 |
| R6 | 覆盖缺口：通知期间集合被改 / 通知早于首次 fetchAll / 两实例只 dispose 其一 / `host-panel.test.ts` 缺 react-dom 无法加载 | **部分已修**：补 TC-7i（迭代中退订/新增不打乱本次）；其余记账（host-panel 为预存在债） |
| R7 | a) UC-3 真机可达性偏窄（深链是**整页加载**，消费在 apply 期、看板通常尚未挂载）→ t5 不能用「再点一次链接」构造 UC-3；b) deep-link 失败兜底无法按身份区分自己的 pending（t2 既有语义）；c) HMR 部分替换的模块身份风险（预存在）；d) `unsubFocus()` 排在 removeEventListener 之后 | **a** 已转 t5 并写进 evidence E-4；**b/c** 记账为既有债；**d 已修**：退订提到最前 |

## 命令输出摘要

- `npx vitest run tests/board-focus.test.ts tests/board-attach.test.ts` → 复核时 19 passed；处置后 **23 passed**
- 只读回归：board-entry 7 / board-focus 11 / legacy-board-route 11 / deep-link 21 / client-view 52 / board-attach 8 / session-progress 4 → 114 passed
- `tests/host-panel.test.ts` → 环境缺 `react-dom/server` 无法加载（预存在，非本卡）
