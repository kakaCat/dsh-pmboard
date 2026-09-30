---
serves: FR-1, FR-2
---

# 测试用例 · REQ-260930193929-897b <!-- serves: FR-1, FR-2 -->

> 一句话：核心是「两个工作区不同根」的正反双向断言——正向防误拦，反向防把闸门改松。
> 新增文件：`tests/design-gate-workspace-root.test.ts`。

## TL;DR <!-- serves: FR-1 -->

沿用既有 `tests/design-completeness-gate.test.ts` 的模式：用**真实 `FileDocRepository`** 指向临时目录。
关键前提见文末「测试替身陷阱」——用无根的内存替身会让本需求的断言**空过**。

## 用例表 <!-- serves: FR-1 -->

| 用例 | 覆盖条款 | 前置 | 步骤 | 期望结果 |
|---|---|---|---|---|
| TC-1 正向：跨根放行 | FR-1 | 会话根 A ＝ 临时目录 1；需求根 B ＝ 临时目录 2；`requirement.md` + `design/*.md` 只落在 B；设计产物登记并落章 | 走弹框确认后的自动推进路径 | 返回体无 `gate_failure`；需求状态推进到 `decomposing` |
| TC-2 反向：真缺失仍拦 | FR-2 | 同 TC-1，但 B 下**删掉** `requirement.md` | 同上 | 返回 `gate_failure`，`code = design_doc_incomplete`，缺口含「requirement.md 不存在」 |
| TC-3 方向二：内容硬门不再静默放行 | FR-1 | A ≠ B；B 下某份 `design/*.md` 含任务表特征（表头含 `depends_on`） | 走确认通道（落章前扫描 `design/`） | 返回 `design_contains_decomposition`。**修复前此例会因按 A 扫描读到空数组而无声通过** |
| TC-4 看板通道按需求根解析 | FR-1 | A ≠ B；经看板路由（无会话上下文）移动/确认 | 调看板移动或看板确认接口 | 判定只由 B 决定，不受「最后一次会话残留的根」影响 |
| TC-5 工具通道按需求根解析 | FR-1 | A ≠ B | 走 `reqboard_confirm_artifact` | 与 TC-1 同判定 |
| TC-6 早返回通道按需求根解析 | FR-1 | A ≠ B；产物已确认 | 再次调确认门（早返回分支） | 如实报缺口，不误报「不存在」 |
| TC-7 存量兼容 | FR-2 | 需求 `workspaceRoot` 未设置 | 同 TC-1 | 行为与修复前逐字一致（校正为 no-op） |
| TC-8 存量豁免不变 | FR-2 | 需求 `artifacts` 为空/未定义 | 调确认门 | 直接放行，不进入读盘分支 |
| TC-9 防新增旁路 | FR-2 | — | 聚合断言：扫描两个读盘闸门的全部调用点 | 每个调用点在读盘前都先做了需求级根校正；新增旁路即失败 |

## 判别断言：为什么 TC-2 与 TC-3 不能删 <!-- serves: FR-2 -->

```
                    TC-1（正向）
              文档在 B ⇒ 必须放行
                        │
        把 docs.exists 短路成 true 的假修复 ──► TC-1 也会绿 ✗
                        │
              TC-2（反向）挡住它：真缺失必须仍被拦
                        │
        把闸门整体绕过的假修复 ──► TC-2 也会绿 ✗
                        │
              TC-9（调用点聚合）挡住它：必须真的走校正
```

- 只有正向断言，「永久放行」式假修复能混过。
- 只有反向断言，「什么都不做」的现状也能混过（现状就是拦）。
- 两者同时存在，才排除掉两个方向的假修复。

## 测试替身陷阱（必须遵守） <!-- serves: FR-2 -->

既有 `tests/application/harness.ts` 的 `FakeDocs`：

- **没有根的概念**——`files` 是全局 `Map<相对路径, …>`，`exists` 直接查这张表。
- **没有 `setWorkspaceRoot`**——根校正走的是鸭子探测，缺失即跳过。

⇒ 用 `FakeDocs` 写本需求的用例，`applyRequirementWorkspaceRoot` 会**静默变成 no-op**，TC-1 与 TC-2 会同时通过，**测试全绿但什么都没验证**。

**要求**：本需求的用例必须用**能换根**的读取器（真实 `FileDocRepository` 指向临时目录，或新写一个带 `root` + `setWorkspaceRoot` 的替身），并在用例中断言「读盘前根确实等于需求根」——把空过变成一个明确失败。

## 回归基线口径 <!-- serves: FR-2 -->

- 定向：`pnpm vitest run tests/design-gate-workspace-root.test.ts` 全绿。
- 邻近不回归：`pnpm vitest run tests/design-completeness-gate.test.ts tests/design-gate-messages.test.ts tests/decomposition-detect.test.ts` 全绿。
- 全量：`pnpm vitest run` 与**基线**对比，存量失败数不增加。
  ⚠️ 本仓当前存在存量失败用例，**不得只看"全绿"**——必须先记录基线数再比对。
- 类型：`pnpm typecheck` 无新增错误。
