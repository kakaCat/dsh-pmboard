# t-cd44d6 对齐投递器装配契约（组合根三参 + 可注入 id 工厂）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
对齐投递器装配契约（组合根三参 + 可注入 id 工厂）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx tsc --noEmit -p tsconfig.json 2>&1 过滤 pm-capture-root 输出为空（修前为 TS2554 Expected 3 arguments, but got 2）；tsx 脚本调 createCaptureRuntime 产出的 deliverer.createRoundMessage 返回非空 messageId；第二参传非函数（如 {plugin}）时构造期抛 TypeError。

## 实施方案（implementation）
改 src/wiring/pm-capture-root.ts（三参 + CaptureRuntimeDeps.idFactory?: () => string，缺省 newCommentId()）；改 src/adapters/AgentDeliverer.ts 构造期校验（传了而非函数即抛 TypeError，投递语义不变）；改 src/index.ts 调用处传入 id 工厂；验证：tsc 过滤 pm-capture-root 无输出 + tsx 直接调 createRoundMessage 不抛。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T12:23:02.784Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**「人工门确认后不唤醒」这条断链的断点被接上了**——组合根不再把配置对象塞进 id 工厂的位置，投递器第一次能真正构造出回合消息；同时装配错误不再潜伏到运行期，配错了在启动时就响亮报错，而不是让所有需求静默停摆。

### 完成项

- 组合根按类签名三参构造投递器：src/wiring/pm-capture-root.ts:56 由 new AgentDeliverer(agents, { plugin }) 改为 new AgentDeliverer(agents, idFactory, plugin)
- CaptureRuntimeDeps 新增可选 idFactory?: () => string，缺省回落到 protocol 的 newCommentId()（消息 id 不入台账）
- src/index.ts 调用处显式注入 idFactory: () => newCommentId()
- 适配器构造期校验：idFactory 不是函数时立即抛 TypeError（构造严格、投递宽容），杜绝「装配错误被拖到运行期再被吞掉」
- 验收：tsc 过滤 pm-capture-root 无输出（修前 TS2554）；显式与缺省两条路径都能产出非空 messageId；非法 idFactory 构造抛 TypeError；离线投递仍是 delivered=false 且不抛

### 改动文件

- `src/wiring/pm-capture-root.ts`
- `src/adapters/AgentDeliverer.ts`
- `src/index.ts`

### 下一步

同行卡 t2（装配形状守卫与投递契约单测）接续：把「组合根形状 = 类签名」锁成修前必红的回归测试。

---
