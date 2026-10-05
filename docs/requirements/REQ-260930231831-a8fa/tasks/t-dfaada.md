# t-dfaada 对齐投递器装配契约（组合根三参 + 可注入 id 工厂）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
对齐投递器装配契约（组合根三参 + 可注入 id 工厂）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/dive-wake-wiring.test.ts` 通过（至少 T1 1 passed）；`tsc --noEmit -p tsconfig.json 2>&1 | grep pm-capture-root` 无输出（退出码 1 = 未命中，即本次根因的 TS2554 已消失）

## 实施方案（implementation）
改 src/wiring/pm-capture-root.ts:56 附近的构造调用为三参并引入 id 工厂注入（缺省 newCommentId，来自 src/shared/protocol.ts）；CaptureRuntimeDeps 接口增 newMessageId?: () => string 并在 createCaptureRuntime 内解析缺省；src/adapters/AgentDeliverer.ts 构造函数内 this.idFactory = typeof 参数 === 'function' ? 参数 : () => randomUUID()（保持三态返回与永不抛契约不变）；新增 tests/dive-wake-wiring.test.ts：前 20 行带 serves 标注，用例 T1 断言不抛、id 同值、source.kind='dive'。验证：npx vitest run tests/dive-wake-wiring.test.ts；tsc --noEmit -p tsconfig.json 2>&1 | grep pm-capture-root 应无输出。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T07:47:24.469Z，窗口 session-efdc21df-1dea-4d14-8dbd-ef80756f9082）

装配错位已消除：组合根按三参构造投递器，装配错误在启动期就响亮暴露，不再被拖到运行期并被吞掉。本卡由 REQ-261001201200-8f8b 交付，本次仅复核，未改代码。

### 完成项

- createCaptureRuntime 现为三参构造（pm-capture-root.ts:69）
- idFactory 可注入，缺省回落 newCommentId
- AgentDeliverer 构造期拒绝非函数 idFactory（响亮抛错）
- 复核：tsc 对该两文件零错误

### 下一步

无（重复交付复核，不做重复实施）

---
