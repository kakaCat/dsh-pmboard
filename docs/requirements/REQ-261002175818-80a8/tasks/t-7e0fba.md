# t-7e0fba 体量算术落地：三个可数的量、一条声明下限·研发

> 需求：REQ-261002175818-80a8 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

## 在做什么
体量算术落地：三个可数的量、一条声明下限·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T04:31:17.556Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

研发阶段完成：体量算术这台机器造好了，而且它是**纯的**——没有文件读写、没有时间与随机数、不依赖任何上层，所以它可被反复穷举测试。测试文件本身就是它的说明书：27 条断言把「未声明不等于 0」「等于容量不算超」「少报要被拒」这三条口径钉死。

### 完成项

- 新增 src/domain/task/Footprint.ts（217 行，零 IO、零 import 外层，只依赖 domain/limits）
- src/domain/limits.ts 增 5 条具名常量（容量 16 DU + 三权重 + 单值上限），+24/-1
- 新增 tests/round-capacity.test.ts（179 行，27 条断言）
- 修前必红：模块不存在时用例报 Failed to load url ../src/domain/task/Footprint.js
- 修后全绿：27 passed（1 file）
- 类型检查本次文件 0 错（全仓 144 < 基线 223）
- git diff --stat：src/domain/limits.ts 24 插 1 删；两个新增文件为未跟踪

### 改动文件

- `src/domain/task/Footprint.ts`
- `src/domain/limits.ts`
- `tests/round-capacity.test.ts`

### 下一步

联调子卡：本卡是纯领域模块、无外部接口可对接，联调阶段的实质是确认产出可被上层以纯函数方式消费（import 形状与层边界），并把「无接口可联调」这一事实如实记录。

---
