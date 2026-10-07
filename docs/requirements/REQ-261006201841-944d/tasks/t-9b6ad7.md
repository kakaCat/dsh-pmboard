# t-9b6ad7 归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单·测试

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T12:53:35.799Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

测试段完成：本卡判据命令全绿（10/10），相邻归档测试无干扰；树内其余红项已逐条归因为其他窗口在飞（tool-deps.ts 的 resolveWorkspaceRoot 未定义）。

### 完成项

- npx vitest run tests/archive-materials-shape.test.ts → 10 passed
- 相邻归档测试无干扰：archive-exemptions 21 passed
- archive-amend 的 8 条红查证为其他窗口在飞：tests/helpers/tool-deps.ts 报 resolveWorkspaceRoot is not defined
- 本次改动四个源文件 tsc 零错误

### 改动文件

- `tests/archive-materials-shape.test.ts`

### 下一步

父卡 t1 收尾；后续卡 t2 承接事实判定

---
