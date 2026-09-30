# t-59fed4 把「按哪个工作区读文档」收敛成一个统一入口·研发

> 需求：REQ-260930193929-897b G2 完整性闸门未按需求级 workspaceRoot 二次校正：文件在盘上却报 requirement.md 不存在

## 在做什么
把「按哪个工作区读文档」收敛成一个统一入口·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

怎么验（可执行）：① `node_modules/.bin/vitest run tests/state-workspace-root.test.ts` → 期望 `7 passed`（证明写侧行为未被破坏）；② `grep -n "export function applyRequirementWorkspaceRoot" src/application/internal/support.ts` → 期望有输出（唯一入口已导出）；③ `grep -n "applyRequirementWorkspaceRoot(deps, requirement)" src/application/internal/support.ts` → 期望有输出（写侧走委托）；④ `node_modules/.bin/tsc --noEmit -p tsconfig.json` → 期望 src/application/internal/support.ts 零错误。

## 汇报 1（2026-09-30T12:25:14.494Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

研发完成：需求级根校正收敛成唯一入口 applyRequirementWorkspaceRoot，写侧三处调用点改为委托它，行为不变。

### 完成项

- 新增 applyRequirementWorkspaceRoot(deps, requirement) 并导出：需求级根校正的唯一实现，同时校正 docs 与 queueRepo
- syncWorkspaceRootForRequirement 改为委托新函数；失效的 exec 形参改名 _exec（noUnusedParameters 开启）
- resolveWorkspaceRoot 按卡片要求未动
- 自测：tests/state-workspace-root.test.ts 7/7 通过；support.ts 零 tsc 错误（全量 213 条为存量）

### 改动文件

- `src/application/internal/support.ts`

---
