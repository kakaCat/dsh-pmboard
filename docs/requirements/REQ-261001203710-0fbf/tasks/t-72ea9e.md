# t-72ea9e 把「这条记录属于哪个项目」定成一个唯一口径·研发

> 需求：REQ-261001203710-0fbf 计划落库未按需求工作区校正根：queue.json 与任务卡被写进另一个工作区

## 在做什么
把「这条记录属于哪个项目」定成一个唯一口径·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-01T13:34:19.060Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

「这条记录属于哪个项目」现在只有一处答案。这一步做完，什么变了——以前每个调用点各自猜「当前目录是谁的」，现在都问同一个函数；而且问不到时它**必须如实说「未归属」**，不允许再默默当成当前项目（那正是产物跑到别人项目里的入口）。

### 完成项

- src/application/internal/support.ts 新增：projectRootOf(record, fallback) → {root, attributed}（唯一口径：有 workspaceRoot 就用它且 attributed=true；否则用 fallback 且 attributed=false，强制调用方向外标注）
- 新增 partitionByProject(records, projectRoot, fallback, realpath?) → {mine, others, unattributed} 三桶：别人的项目绝不混进 mine；未归属单独成桶（不得静默当成本项目）
- 新增 sameProjectRoot(a, b, realpath?) 与 normalizeProjectRoot(p)：反斜杠归一、折叠重复斜杠、去尾斜杠（保留根 / ），尾斜杠不判为错配
- 定义契约常量：PROJECT_ROOT_MISMATCH = 'REQBOARD_PROJECT_ROOT_MISMATCH'、USED_PROJECT_ROOT_FIELD = 'usedProjectRoot'（供 t3 的写路径与可观测字段使用）
- 偏离说明（记入复核）：卡片 implementation 写的是「比较路径时用 realpathSync 归一」，实现改为**可注入解算器**——因为 tests/layer-boundary.test.ts 规定 application/ 不得 import node:（该测试当前已因 4 处存量越界而红，我不再添新的一条）。不注入时退化为形状比较，尾斜杠要求仍满足
- 自测：npx vitest run tests/project-scope.test.ts -t "projectRootOf" → 13 passed；grep 导出可见（support.ts:206）；npx tsc --noEmit → 191 条 ≤ 开工记录基线 192，且 support.ts 零错误（首版曾因 projectRootOf 的 realpath 形参未使用报 TS6133，已去掉该形参）

### 改动文件

- `src/application/internal/support.ts`
- `tests/project-scope.test.ts`

---
