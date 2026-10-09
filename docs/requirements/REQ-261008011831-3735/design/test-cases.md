---
requirement_id: REQ-261008011831-3735
title: "测试用例面：三条验收锚点与反向断言机制"
status: design
category: chore
requirement_refs: [CH-1, CH-2, CH-3]
---

# 测试用例设计（REQ-261008011831-3735）

## 验收锚点（本需求的三条） <!-- serves: CH-1, CH-2, CH-3 -->

### TC-1: 活卡单点用例全绿

covers: t-67a687 t-8116c8 t-11ca63
validates: CH-1

<!-- serves: CH-1 -->

- **命令**：`npx vitest run tests/live-tasks-single-source.test.ts`
- **期望**：`Tests 17 passed (17)`、退出码 0（改前读数：2 failed——⑤新增即红、⑥清单漏判据）
- **反向断言机制**（该文件的内部结构，正是它抓到本需求的红）：
  | 组 | 钉住什么 |
  |---|---|
  | ① 清单自洽 | 形状、`reason` 枚举、collected 行原文必须真命中比较式 |
  | ② 收编点 | 函数体内零手写比较 + 含指定单点调用 |
  | ③ 依赖判定 / RTM 入口 | 三处 ready 实现与两个 RTM 入口都走单点 |
  | ④ 范围自检 | 扫描根 = `src/`、清单文件都被读到 |
  | ⑤ **新增即红** | 实测命中集合 ⊆ baseline，失败时点名 文件+行号+行原文 |
  | ⑥ **删条目即红** | baseline ⊆ hits ∪ collected（删条目 / 漏判据即红） |
  | ⑦ 同源 | `liveCountOf(t) === liveTasksOf(t).length` |

### TC-2: 判定出清后行为不变

covers: t-67a687 t-11ca63
validates: CH-2

<!-- serves: CH-2 -->

- **命令**：`npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts`
- **期望**：94 passed（终态仍渲染「已取消 / 已归档，无可执行动作」与「已取消：无验收结论」）
- **辅助**：`git diff` 只含两处判定替换 + 两条 import + 清单两条删除

### TC-3: 基线集合差

covers: t-e5617b t-d97ccf t-03537d t-18eb2a
validates: CH-3

<!-- serves: CH-3 -->

- **命令**：`npx tsx scripts/test-baseline.mts --check`
- **期望（本需求实际达成的等价判据）**：**新增失败 0**；本需求三文件在失败集合中出现 0 次；`tsc` 退出码 0
- **未达成项与归属**：`--check` PASS 需要 refresh 把基线从 68 收敛到现行失败集（16 条），而 refresh 会破坏三份清单同源不变量；该步按 `REQ-261008004324-81df/retro.md:55` 是**人的动作**，本需求交付前置读数并如实标注（见 `verification.md`）

## 类型门禁 <!-- serves: CH-1, CH-3 -->

### TC-4: 类型零错误

covers: t-e5617b t-18eb2a
validates: CH-1

<!-- serves: CH-1 -->

- **命令**：`npx tsc --noEmit` → 退出码 0、`error TS 0 条`

## 测试证据

命令与读数摘要见 `tests/evidence.md`；材料结论见 `verification.md`。
