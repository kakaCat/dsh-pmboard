# t-0bdb73 把「这条记录属于哪个项目」定成一个唯一口径·复核

> 需求：REQ-261001203710-0fbf 计划落库未按需求工作区校正根：queue.json 与任务卡被写进另一个工作区

## 在做什么
把「这条记录属于哪个项目」定成一个唯一口径·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T13:35:28.147Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

复核结论：口径与设计一致、边界覆盖到位；一处偏离已定性——为不违反「application 层不碰 fs」这条层纪律，软链归一改由调用方注入解算器，而不是把 fs 塞进纯函数。这不是妥协：尾斜杠要求照样满足，且多了一条层边界不被破坏的收益。

### 完成项

- 偏离项 1（已定性：层边界约束优先）：卡片 implementation 要求「用 realpathSync 归一」，实现改为**可注入解算器**（sameProjectRoot 第 3 参）。依据：tests/layer-boundary.test.ts 明确禁止 application/ import node:（该测试当前已红，含 4 处存量越界）——照卡片写会新增一条越界。代价与补偿：不注入时退化为形状比较；「尾斜杠不得判为错配」这条硬要求仍成立，软链等价由调用方注入 fs 解算器获得（测试里用假解算器验证了该分支）
- 偏离项 2（窄化，去掉了无用形参）：projectRootOf 原本带 realpath 形参，但该函数只做「取值」不涉及比较，形参未使用触发 TS6133；已去掉，realpath 只保留在 sameProjectRoot / partitionByProject 这两个真正做比较的函数上
- 无偏离项：三条口径与 design/data-model.md 逐条对应（有值就是它 / 缺失用 fallback 且标注 / 不允许写入时改用别的根）；partitionByProject 的 others 绝不进 mine、unattributed 单独成桶，与 architecture.md 的「两处错配」设计一致
- 边界用例覆盖核对：尾斜杠、重复斜杠、反斜杠、根路径 /、空串、undefined、解算器抛错——七种边界均有断言
- 复核通过的证据：npx vitest run tests/project-scope.test.ts -t "projectRootOf" → 13 passed；support.ts 在 tsc 全量输出里零错误

### 改动文件

- `src/application/internal/support.ts`
- `tests/project-scope.test.ts`

---
