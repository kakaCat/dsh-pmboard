# t-c72fe4 余量参考上屏：节点输入包与任务树，都标「非判据」·研发

> 需求：REQ-261002175818-80a8 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

## 在做什么
余量参考上屏：节点输入包与任务树，都标「非判据」·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T05:39:11.276Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

这一步做完，**余量读数第一次出现在人真的会看到的地方**：节点输入包里多了一节「一轮余量（参考）」、任务树上每张卡多了「有没有声明体量」。而且它守住了两条底线——**读不到就整节不出现**（输入包与之前逐字节相同）、**同一节里必须写着它不是判据**。最关键的是接通了生产：上一版只在用例层亮，那正是这个需求要消灭的形态。

### 完成项

- 输入包新增「## 一轮余量（参考）」节：remainingTokens + 固定字样「参考值，非门禁判据」；无数据返回空串（调用方条件追加）
- 任务树：每卡 footprint? 与恒在场 footprintState（未声明=缺键）；顶层可选 contextPressure（不可得=键缺席，不发 null）
- TaskTreeTool：nodeSchema 与 output schema 同步声明（漏声明会被绑定层拒收）
- **接通生产装配缺口**：原来只有用例层能亮、生产永远不亮；经 node-settlement / h2-compact / gate-wiring / index.ts 四处接通（惰性 getter，避开构造顺序与并发编辑）
- 新增 tests/session-probe-wiring.test.ts 6 条（整链真 H1–H5 驱动）；capacity-reference 追加 T9a–T9d（既有 9 条未动）
- 红→绿留档：T9a/T9c/T9d 实现前红（3 failed）；T9b 另做突变反证（猜 0 / 不可得也发键 → 红）
- 我（本窗口）复核：装配用例 6/6、余量参考 13/13、tsc 145 持平；并确认 T9b 用的是字符串全等而非 toContain
- 如实记录：getter 方案在「装配期同步执行」这条不存在的路径下会缺席（生产走 setImmediate，赋值先于执行）；node-input-package.ts 现 395/400，余量仅 5 行

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

联调与复核：证明生产可达（已做）、核对两条设计口径的形态差异。

---
