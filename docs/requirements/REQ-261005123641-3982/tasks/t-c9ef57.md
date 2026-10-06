# t-c9ef57 立项两条路径（capture / create）守卫前置到建档之前·研发

> 需求：REQ-261005123641-3982 修写盘根守卫误判：共享单例根被别的窗口/看板改写 → 立项与批准落库假失败

## 在做什么
立项两条路径（capture / create）守卫前置到建档之前·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T04:57:25.316Z，窗口 session-fe2396d0-cd4e-4724-89fd-16e436222a2f）

这一步做完，变化是：立项在写下任何东西之前先确认「要写到哪个根」，确认不过就什么都不建——不会再出现「回执说立项失败、台账里却已经有这条需求」的半截状态。

### 完成项

- capture：守卫前置到 ④建档之前（用弹框解析出的 workspaceRoot 判定），拒绝即台账零写入；建档后保留同口径护栏
- create：守卫从建档之后移到建档之前并传 callerRoot；RTM 写盘仍由 syncRTMYaml 内部按需求 id 守卫
- 实施期裁决落到代码：非绝对声明根 → 不判（返回探针当前值，与改动前逐字一致）
- 裁决作为变更记①写进 design/interfaces.md 的判定顺序表（含裁决人、日期、理由、影响面）
- 自测：守卫用例 414/430/443/448 未修改即绿；签名与调用点计数未变
- 自测：tests/project-scope.test.ts + tests/application → 3 红，其中 2 红用 HEAD worktree 实测为基线既存（t8 EnsureKnowledgeLayer.ts:169、RandomIdFactory 的 REQ id 格式）；第 3 红是 452 旧契约用例，归 t3 重写 → 本卡净新增意外红 0 条
- 自测：tsc 错误 1 = 基线 1；capture 守卫 3 处（import + 前置 + 护栏）、create 守卫行 54 < createRequirementDirect 行 55

### 改动文件

- `src/application/use-cases/CaptureRequirement.ts`
- `src/application/use-cases/CreateRequirement.ts`
- `docs/requirements/REQ-261005123641-3982/design/interfaces.md`

### 下一步

复核子卡核对「守卫必须早于副作用」与校正/写盘之间无新 await；随后 t3 补并发回归并重写旧契约用例

---
