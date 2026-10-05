# t-6ec55f 把「这条记录属于哪个项目」定成一个唯一口径·测试

> 需求：REQ-261001203710-0fbf 计划落库未按需求工作区校正根：queue.json 与任务卡被写进另一个工作区

## 在做什么
把「这条记录属于哪个项目」定成一个唯一口径·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-01T13:36:36.932Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

测试通过：13 条纯函数用例全绿，类型错误数不增反降（192→191）且改动文件零错误。这一步做完，什么变了——这条口径从「设计里写的一段话」变成「13 条可复跑的断言」，包括最容易写错的三种边界（空串不该被当成"声明了空项目"、根路径不该被削成空、解算器抛错不该把比较炸掉）。

### 完成项

- 定向：npx vitest run tests/project-scope.test.ts -t "projectRootOf" → Test Files 1 passed；Tests 13 passed
- 全文件：npx vitest run tests/project-scope.test.ts → 13 passed（含边界七例：尾斜杠 / 重复斜杠 / 反斜杠 / 根路径 / / 空串 / undefined / 解算器抛错）
- 类型：npx tsc --noEmit -p tsconfig.json → 191 条（开工前记录基线 192，未增反降 1）；src/application/internal/support.ts **零错误**
- 错误集比对：与旧基线文件的唯一差异是他人提交引入的联合类型文本变化（'unverified'），非本次引入；计数 191 ≤ 192
- 验收标准逐条核对：① 定向命令全绿 ✅；② grep 到 export function projectRootOf（support.ts:206）✅；③ 类型不高于 192 且 support.ts 零错误 ✅

### 改动文件

- `src/application/internal/support.ts`
- `tests/project-scope.test.ts`

---
