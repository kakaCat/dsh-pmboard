# t-0c73fc 把「这条记录属于哪个项目」定成一个唯一口径

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把「这条记录属于哪个项目」定成一个唯一口径

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) `npx vitest run tests/project-scope.test.ts -t "projectRootOf"` → 全绿；2) `grep -n "export function projectRootOf" src/application/internal/support.ts` → 有命中；3) `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` → 不高于实测基线 192，且 support.ts 零错误。

## 实施方案（implementation）
src/application/internal/support.ts：两个纯函数（零 IO、不读 process.cwd）；有 workspaceRoot 则 attributed=true，否则用 fallback 且 attributed=false；比较路径时用 realpathSync 归一（软链/尾斜杠不得判为错配）。与既有 applyRequirementWorkspaceRoot 并存，后者降级为兜底。测试：tests/project-scope.test.ts 的纯函数用例（含尾斜杠/软链/空串三种边界）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T13:37:48.512Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

项目维度有了唯一的判定口径。这一步做完，什么变了——以后任何一处代码要回答「这条记录属于哪个项目」，都只能问这一个函数；而它的答案里**必须**带上「这个答案是记录自己声明的，还是我兜底猜的」——猜的那个必须被说出去，不能再悄悄当成本项目。这一步本身不改变任何行为，是后面三处接线（扫描/落库/检索）的共同地基。

### 完成项

- 交付：src/application/internal/support.ts 新增 projectRootOf / partitionByProject / sameProjectRoot / normalizeProjectRoot 四个纯函数，以及 PROJECT_ROOT_MISMATCH、USED_PROJECT_ROOT_FIELD 两个契约常量
- 配套测试：tests/project-scope.test.ts 的纯函数批（13 例），覆盖尾斜杠、重复斜杠、反斜杠、根路径 /、空串、undefined、解算器抛错七种边界
- 三条验收命令全过：定向 13 passed；grep 导出命中（support.ts:206）；tsc 191 条 ≤ 基线 192 且 support.ts 零错误
- 偏离一条已定性并留痕：realpath 改为可注入解算器（不把 node:fs 塞进 application 层），尾斜杠要求仍满足
- 三张子卡（研发/复核/测试）各自完成并留下完工记录

### 改动文件

- `src/application/internal/support.ts`
- `tests/project-scope.test.ts`

### 下一步

t2：看板产物扫描改为逐记录解析（只扫本次项目，别人的跳过并计数回报）；t3/t4/t6 依赖同一口径。

---
