# t-bdda9c 余量参考上屏：节点输入包与任务树，都标「非判据」

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
余量参考上屏：节点输入包与任务树，都标「非判据」

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/capacity-reference.test.ts 的 T9a–T9d 全绿：余量参考节出现且同节含「参考值，非门禁判据」；投影不可得时整节不出现且输入包其余部分逐字节不变；只有 contextWindow 时 remainingTokens 缺席（不猜 0）；任务树顶层字段与每卡 footprintState 在场。

## 实施方案（implementation）
node-input-package.ts 照「## 断点」节的写法加纯函数 roundCapacityText()（无数据返回 ''），IsolateNodeContext.ts 的调用点传参；TaskTree.ts 与 TaskTreeTool 的白名单三处同改（TaskTreeNodeView 接口 / nodeOf 的 if(x!==undefined) 赋值 / nodeSchema），每卡加 footprint? 与 footprintState 派生字段（'declared'|'undeclared'），顶层加 contextPressure?。

## 上游产出摘要（dependsSummary）
- 余量读数接进来：只读、可缺省、不冒充 0

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T05:39:26.058Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

这一步做完，**余量读数出现在人真正会看到的地方**：节点输入包里多了一节「一轮余量（参考）」，每张任务卡上多了「有没有声明体量」。两条底线都守住了——读不到就整节消失（不是显示 0）、同一节里必须写着它不是判据。而且这次不是"用例里能跑"，是**生产真的会亮**：三处接线任何一处拿掉，对应用例就红。

### 完成项

- 节点输入包新增「## 一轮余量（参考）」节（remainingTokens + 固定「参考值，非门禁判据」），读不到则整节不出现且其余逐字节相同
- 任务树：每卡 footprint? 与恒在场 footprintState；顶层可选 contextPressure（不可得=键缺席）
- TaskTreeTool schema 同步声明（漏声明会被绑定层拒收）
- **生产装配缺口已接通**：node-settlement / h2-compact / gate-wiring / index.ts 四处（惰性 getter，避开构造顺序与并发编辑）——上一版只在用例层亮，正是本需求要消灭的形态
- 新增 10 条用例（T9a–T9d + 装配 6 条）；红→绿与三处单行回退实测均有留档
- 全量 96 failed / 3889 passed（失败数比基线少 1，零新增）；tsc 145 持平
- 留痕待收口表态：① 只有 contextWindow 时输入包整节不显示 vs 任务树键在场（两份设计文档口径不同）；② contextPressure.source 的 'unavailable' 分支在任务树不可达；③ node-input-package.ts 已 395/400，余量仅 5 行

### 改动文件

- `src/application/internal/node-input-package.ts`
- `src/application/use-cases/IsolateNodeContext.ts`
- `src/application/use-cases/TaskTree.ts`
- `src/tools/TaskTreeTool/TaskTreeTool.ts`
- `src/application/internal/node-settlement.ts`
- `src/application/gate/handlers/h2-compact.ts`
- `src/gate-wiring.ts`
- `src/index.ts`
- `tests/capacity-reference.test.ts`
- `tests/session-probe-wiring.test.ts`

### 下一步

t6（批准前摆在人眼前）依赖 t5，已解锁；t8/t9 随后；t10 收口时请一并裁定三条留痕项。

---
