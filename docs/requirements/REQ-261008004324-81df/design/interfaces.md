---
requirement_id: REQ-261008004324-81df
title: "接口：不适用（无对外接口面）"
status: accepting
category: bug
requirement_refs: [BUG-1, BUG-2, BUG-4, BUG-7, BUG-10]
---

# 接口（REQ-261008004324-81df）

## 不适用：本需求不新增 / 不改任何对外接口 <!-- serves: BUG-10 -->

判据：本需求不新增工具、不改 HTTP 路由、不改回执契约、不改错误码；13 张卡的落点只有测试文件、
需求目录文档与环境产物。故不设「接口清单」表（该表是 feature 拆分阶段的对照输入，
bug 档无接口面——`src/application/internal/category-doc-sets.ts` 的 DELTA 对 bug 要求 0 份设计文档）。

## 本需求涉及的既有接口（只读参照，不改） <!-- serves: BUG-1, BUG-2, BUG-4, BUG-7 -->

| 既有接口 / 契约 | 本需求对它的动作 | 依据 |
|---|---|---|
| `reqboard_move` 的人工门（`decomposing → implementing`） | 断言改走看板人路径（`actor: 'human'`），**不改门本身** | `src/domain/requirement/RequirementStatus.ts:118-120`（REQ-31e11f 五门） |
| `reqboard_decompose` 的幂等守卫与回执键集 | 夹具按现行拒绝条件与 11 键回执跟进 | `DecomposeSpec.ts:48-66`（REQ-261003204149-1e80 FR-4）、`MoveTask.ts:127-140` |
| `reqboard_archive_submit` 的合并去向可打开性 | 夹具落盘真实文件后放行 | REQ-261006201841-944d FR-1 |
| 设计文档内容门（文档级 serves / H2 serves） | 夹具按门口径补齐 serves 标注 | `content-gate-wiring.ts:370-455` |
| `@deepseek-ai/dsh-session`（宿主包） | 缺包时**显式跳过**（依据可读），不伪造通过 | 本仓无该包；先例 `tests/decision-gates.test.ts:28/:417` |

## 失败语义（只读口径的） <!-- serves: BUG-7 -->

- 缺宿主包 ⇒ `describe.skipIf` / `it.skipIf`：**skipped 计数可见**，不做「跑绿了其实没跑」的错觉。
- 守护对象消失（零参补丁）⇒ 退休为一条**显式声明式断言**，文件头写依据与时点（不静默删除）。
- 任何「真缺陷」⇒ 不改断言、不改生产代码，出另案点名（见 `qualitative-ledger.md` 第二节）。
