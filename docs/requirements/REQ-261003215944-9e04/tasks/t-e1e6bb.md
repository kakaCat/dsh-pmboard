# t-e1e6bb 把推进弹框与看板继续接到同一方法

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把推进弹框与看板继续接到同一方法

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
集成测：driverHealth=paused(reason='round-limit(brainstorming:3)') 时人对推进弹框确认 → roundsInStage 归零、driverHealth 复位 healthy、activation 未被改写；人先按 clear_pause（disarmed+idle）再确认推进 → activation 仍为 disarmed；看板「继续」→ activation 变 armed 且留痕 createdBy.kind==='human'；pnpm test 全绿。

## 实施方案（implementation）
在确认推进路径（src/application/use-cases/AskConfirm.ts 落章+推进、src/application/use-cases/ConfirmArtifact.ts）接 confirm-advance 事件：阶段变了走 advance-stage 语义（归零 + attempts=0），同阶段且 driverHealth=paused 走 recover-auto 语义；红线是绝不改写 activation。在 src/http/routers/requirements.ts 的看板「继续」处显式走 arm-explicit（现状见 requirements.ts:557 调 armExplicit）。

## 上游产出摘要（dependsSummary）
- 收敛六处调用点到唯一入口

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T15:09:34.813Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

这一步做完，「人确认了这道门，链就接着跑」不再靠运气：以前确认路径根本不碰 autopilot 的停手位，于是确认完链还是停着、或者同阶段确认干脆什么都不发生。现在两条确认入口都统一去复位它，而且**绝不顺手把自动化打开**——那是看板「继续」才有的权力。

### 完成项

- 两条确认入口都接上 confirm-advance：弹框收敛点 confirm-settle.ts（落章+推进的唯一实现）与会话/工具入口 ConfirmArtifact.ts（它有自己的推进块，是同语义的第二条入口）
- 落点选在「推进之后」：跨阶段时阶段推进已把回合计数归零（t10 的 advance-stage），但运行时暂停位没人复位——这正是「确认了、链却不动」的成因；同阶段时更是什么都没发生
- 红线写进代码与测试：confirm-advance 绝不改写 activation（确认这道门 ≠ 同意自动跑）
- 看板「继续」继续走 arm-explicit（既有 armExplicit 接线不动），它是**唯一**能打开自动化的动作且留痕记 human
- 新增 tests/dive-confirm-advance.test.ts 五例：达上限确认→归零+健康复位+intent 不变；先 clear_pause 再确认→automation 仍关；同阶段确认也复位；看板继续→human 留痕；确认路径重放幂等

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/application/use-cases/ConfirmArtifact.ts`
- `tests/dive-confirm-advance.test.ts`

### 下一步

联调段：跑确认/闸门相关守门测试，确认新写入没有惊动既有语义。

---
## 汇报 2（2026-10-03T15:09:42.999Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

联调这一段确认了一件要紧的事：确认/闸门那一带的测试里有 6 个文件是红的，但逐个查过——它们**在我动手之前就是红的**，且全量失败集合与开工前一模一样，说明这次接线没有惊动任何既有语义。

### 完成项

- 确认/闸门相关守门测试全跑：15 个文件里 9 个全过；6 个有失败（gate-handlers / gate-aware-questions / dive-gate-prompt / auto-chain-approval / design-gate-messages / confirm-settle-plan-persist）
- 逐个核对：这 6 个**全部在既有红基线内**（开工前就在 46 个失败文件里），不是本次引入——全量失败文件集合与失败数（46 / 98）与开工前逐字相同
- 本卡新增写入未惊动既有语义：默认路径下 confirm-advance 只在「确实有暂停位要复位或阶段变了」时才写，其余情况纯函数判 changed:false → 零写入

### 下一步

测试段：按卡的验收三条逐条取证。

---
## 汇报 3（2026-10-03T15:09:59.898Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

测试段把卡上三条验收逐条跑到：达上限停下时人确认→额度还回来且停手位复位、人的意图没被动；人自己关过自动化的，确认推进**不会**偷偷打开；看板「继续」才是那个唯一能打开的动作且留痕记的是「人」。类型错误零新增，全量失败集合与开工前一模一样。

### 完成项

- 验收 1：driverHealth=paused(reason=round-limit:brainstorming) 时人确认推进 → roundsInStage 归零、driverHealth 复位 healthy、activation 未被改写（走真实 applyConfirmDecision 收敛点，非单元造桩）
- 验收 2：人先 clear_pause（disarmed+idle）再确认推进 → activation 仍为 disarmed、phase 仍 idle
- 验收 3：看板「继续」→ activation 变 armed 且留痕 createdBy.kind==='human'
- 补充覆盖（超出卡面但同属该语义）：同阶段确认（advance=false）也复位停手位；确认路径重放幂等（第二次零变化）
- 类型检查：149，与开工基线相同（零新增）
- 全量：98 失败 / 3495 通过，失败文件 46 个且集合与开工前逐字相同

### 下一步

复核段：复核两条入口是否同义、红线是否真的不可越过、以及写入频率影响。

---
## 汇报 4（2026-10-03T15:11:56.129Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

复核确认三件事：两条确认入口用的是同一个事件、红线在结构上就成立（那个分支里根本没有改 automation 的代码）、而且只在该动的时候动——人要是选「需修改」，链路不会被顺手重新带起来（这条是特意去追了分支才敢说的）。

### 完成项

- 复核①两条入口同义：confirm-settle（弹框/收敛点）与 ConfirmArtifact（会话/工具入口）都调 `confirm-advance` 同一个事件，规则仍在唯一模块里
- 复核②红线在**结构上**成立：confirm-advance 分支内不出现任何 activation 赋值（只在注释里声明不许碰）——不是靠调用方自觉
- 复核③只在该触发的地方触发：特意追了 AskConfirm 的分支——肯定答复才走 applyConfirmDecision，选「需修改」走 recordDeclinedConfirmation（不碰 dive）。即：人退回来时**不会**被本卡顺手把链重新带起来
- 复核④写入频率：纯函数判 changed:false 时零写入，故正常确认（无暂停位、未跨阶段）不产生额外写盘
- 复核⑤低severity记录：两处未注入 commentId/onError（用默认「事件名+毫秒」留痕 id）；confirm-advance 本就不产留痕，故当前无影响，接线时若要统一可一并注入

### 下一步

FR-10 闭环（t9 写入口 → t10 收敛 → t11 接线）。链上下一批就绪卡：t2 席位授权判定、t5 跨窗口自署 kind 投递、t6 本窗口多项目共存。

---
