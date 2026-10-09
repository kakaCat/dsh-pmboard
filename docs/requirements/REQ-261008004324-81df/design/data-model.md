---
requirement_id: REQ-261008004324-81df
title: "数据模型：不适用（无表 / 无 schema / 无字段变更）"
status: accepting
category: bug
requirement_refs: [BUG-8, BUG-10, BUG-11]
---

# 数据模型（REQ-261008004324-81df）

## 不适用：本需求不改表、不改 schema、不迁移数据 <!-- serves: BUG-11 -->

判据：本需求 13 张卡的落点全部是 `tests/**`、`design/**`、`reviews/**`、`tests/**`（需求目录）、
`skills/ui-ux-pro-max/.npmignore`，以及「删除 `skills/**/__pycache__/` 环境产物」；
**没有任何一处触碰建表 / 字段 / 迁移**。因此本节只登记两件「有状态产物」的形态与回滚。

## 唯一有状态的产物（形态与回滚） <!-- serves: BUG-8, BUG-10 -->

| 产物 | 形态 | 谁写 | 回滚方式 |
|---|---|---|---|
| `docs/requirements/<REQ>/qualitative-ledger.md` | Markdown 台账（37 行 5 列）+ 另案清单 7 行 | t12 卡手写 | `git checkout --` 或整文件删除 |
| `docs/knowledge/*.md` / `*.tsv` | 由 `scripts/kb-build.mts --write` 生成的文本 | 重生成命令 | `npx tsx scripts/kb-build.mts --write` 幂等重生成；或 `git checkout --` |
| `docs/reviews/test-baseline.{md,failures.txt}` | 回归基线（失败用例集合） | `scripts/test-baseline.mts --refresh` | 本需求**已回滚**：refresh 只写两份、破坏三份清单的分诊不变量，按仓规 `git checkout --` 还原 |

## 兼容与版本约束 <!-- serves: BUG-11 -->

- 台账是**新增文件**，无兼容问题；不上线、不进产物包。
- `docs/knowledge/*` 生成物带「零漂移」自检（`pnpm kb:check` 的 K7/K9），
  改后必须重生成到与 `src/` 一致；本需求收口时该段为绿。
- 基线三份清单（`failures.txt` / `reverse.txt` / `other.txt`）**必须同源**：
  单改一份即违反 `tests/baseline-triage.test.ts` 的集合不变量（本需求实测并回滚）。
