# t-ef4b17 尾部增量投递：内容哈希去重、去抖与降级兜底

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
尾部增量投递：内容哈希去重、去抖与降级兜底

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

① npx vitest run tests/volatile-notice.test.ts 全绿（25 例）：相同文本只投 1 次、走 next-step、followup 调用数 = 0；capture 与 stage 不推进时间即投；task 把「A → 空(24 秒) → B」合并为 2 次；空态久留 5 分钟补投一次且不重复。② **头部让位为一次性永久且只在到达确认后上闩**（sealed 只由 claimed 置位，回收仅经迟滞：连续 3 次未确认），故每窗口头部重写 ≤1 次——剧本「连续 8 次变更后头部版本数 = 1」已绿。③ **覆盖不依赖穷举生产者**：协调层在写路径、装配缝、回合末三处做状态比对与差异投递；剧本「经 rollup 不经生产者推进到 accepting」仍能让窗口收到状态行与 accepting 纪律，已绿。④ **到达确认**：claimed 上闩、discarded 清在途并补投、disposed 清理；未确认期间头部继续承载（剧本已绿，两路至少一路在场）。⑤ 五条 P2 落地：直投废旧槽与冲刷前重投影（不再投已消失的任务块）、空态去重优先不推后、迟滞 noticeReclaimAfterFailures=3、哈希改 sha1 且经端口注入（application 层禁 node: 前缀）、空态文案按 implementing 判据。⑥ ⑪ 的恒真断言已改为有意义的有界断言；⑦ 补装配断言；两条把缺陷当预期的用例已明确改写。⑦ 三回归文件仅存量红「不许沉默」；apply-wiring 7 绿、contract-types 10 绿；pnpm typecheck 仅他人在飞那条 TS2415；pnpm build 与 build:client 退出码 0。⑧ 归属：layer-boundary 三条与定向 6 条均与仓内 10-06 留底逐字同号（存量红），baseline 差集与返工前一致且无一条落在本卡。⑨ 口径如实标注：⑪ 的 token 增量仍为等价有界断言而非真实请求读数（如需真读数应单列测量卡）。⑩ 文件尺寸：notice-delivery 387 / notice-reconciler 377 / volatile-notice 400，均未越 400 上限；volatile-notice 已无余量。

## 实施方案（implementation）
① 新增 src/application/internal/notice-delivery.ts（编排：hash 比对 → 去抖 → 投递 → 更新哈希表 → 留痕；实现 VolatileNoticePort，永不抛）；② 新增 src/adapters/VolatileNoticeAdapter.ts：agents.get(windowKey) → inboxOf(agent).prepend('next-step', msg)，msg 自署 source（kind:'dive'，禁止冒充 user）；失败分支退回头部并留痕；③ 改 src/application/internal/injection-log.ts 加 origin 取值 'system-notice'（只增，读端容忍未知）；④ src/domain/limits.ts 加 noticeDebounceMs=1000；⑤ src/index.ts 装配端口；⑥ 新增 tests/volatile-notice.test.ts。禁用 agent.followup（会新起回合）。

## 上游产出摘要（dependsSummary）
- 头部段稳定化：易变内容移出 system prompt

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T03:49:13.682Z，窗口 session-57f49896-70ca-4e67-b9f2-acc2cbdcc531）

t3 父卡交付：易变内容改走会话尾部增量投递，覆盖由协调层保证、让位一次性永久、到达才确认，经复核返工后闭环。

### 完成项

- 子卡 t-9a1d24（研发）与 t-5dd294（复核）均 done
- 易变内容改从会话尾部增量投递：经 agents.get 与 inbox.prepend 投 next-step，自署 kind=dive
- 按 kind 分化窗口：capture 与 stage 立即投，task 与 status 三十秒合并翻版
- 空态不单独投递：只在阶段变化时随阶段投，空态久留五分钟补投一次且不重复
- 新增协调层做状态比对覆盖，任何来源的状态变化都在下一次装配前被投出
- 头部让位为一次性永久，且只在到达确认后上闩；未确认期间头部继续承载
- 到达确认：claimed 上闩、discarded 清在途并补投、disposed 清理
- 降级：通道不可得退回头部并留痕，冻结与 capture 段都不静默丢
- 五条 P2 落地：直投废旧槽、冲刷前重投影、空态去重优先、迟滞回收、sha1 走端口
- 客户端提示词面板新增尾部注入标签并重建通过
- 新套件 25 例全绿（含四条新剧本），apply-wiring 7 绿、contract-types 10 绿
- 归属：layer-boundary 三条与定向六条均与仓内留底逐字同号；baseline 差集与返工前一致，无一条落在本卡

### 改动文件

- `src/application/internal/notice-reconciler.ts`
- `src/application/internal/notice-delivery.ts`
- `src/adapters/VolatileNoticeAdapter.ts`
- `src/application/internal/volatile-notice.ts`
- `src/domain/limits.ts`
- `src/application/internal/injection-log.ts`
- `src/application/ports.ts`
- `src/shared/protocol.ts`
- `src/application/dive/session-driver.ts`
- `src/wiring/pm-capture-root.ts`
- `src/index.ts`
- `src/application/use-cases/MoveTask.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/client/views/panels/prompts.ts`
- `tests/volatile-notice.test.ts`
- `tests/stage-prompts.test.ts`
- `tests/capture-section-stability.test.ts`
- `tests/prompts-panel.test.ts`

### 下一步

t5 子卡预算开工；t7 兼容回归需覆盖尾部投递的到达确认与降级路径。

---
