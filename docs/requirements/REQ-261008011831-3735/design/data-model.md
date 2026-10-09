---
requirement_id: REQ-261008011831-3735
title: "数据模型面：反面断言清单的键与生命周期"
status: design
category: chore
requirement_refs: [CH-1, CH-3]
---

# 数据模型设计（REQ-261008011831-3735）

> 薄文档说明同 `architecture.md`：本需求**不新增任何数据结构**。本份只描述被本需求读写的两份既存数据结构，供验收核对。

## 反面断言清单（`tests/fixtures/canceled-literal-baseline.json`） <!-- serves: CH-1 -->

| 字段 | 形态 | 语义 | 键性 |
|---|---|---|---|
| `collected[]` | `{file, symbol, line, current, marker}` | 收编点：**改前**手写行原文 + 应存在的单点调用 | `(file, symbol)`，重复即红 |
| `baseline[]` | `{file, line, reason, line_kind}` | 实施后仍存在、但登记在案的命中行 | **`(file, 行原文去首尾空白)`——不按行号**（抗行号漂移） |
| `reason` | `req-status` / `write-side-guard` / `status-label` / `definition-site` | 四类枚举，越界即红 | 枚举 |
| `_note` | 文本 | 扫描口径与断言方向的权威说明 | — |

**本需求的写入**：从 `baseline[]` 删除两条 `status-label` 条目（行原文已不在源码中；且判定已出清）。`collected[]` 与其余 `baseline[]` 一字不动。

**键设计的直接后果**（本需求的红正是它暴露的）：键含**行原文**，所以源码改写文本形态（哪怕语义不变）会让旧键失效、新键出现——用例两个方向同时报红。这也是为什么「改登记」不是出路：**出清**（改走单点）才能让这两行永久离开命中集合。

## 测试基线（`docs/reviews/test-baseline.{md,failures.txt,reverse.txt,other.txt}`） <!-- serves: CH-3 -->

| 产物 | 谁写 | 不变量 |
|---|---|---|
| `failures.txt` | `scripts/test-baseline.mts --refresh` | 逐行 `文件 :: 用例全名`、字典序、无重复、LF 收尾 |
| `test-baseline.md` | 同上（含「刷新历史」表） | 每次 refresh 追加一行、理由非空 |
| `reverse.txt` / `other.txt` | **人的动作**（分诊） | `reverse ∪ other == failures`，互斥、字典序、计数 ≤ 冻结上界 |
| `reverse.notes.md` | 同上 | `reverse` 的逐条投影：红因类别 ∈ 受控枚举 + 可达性自洽 + 证据非占位 |

**本需求的关系**：`--refresh` **只写前两份**，会破坏上表后两行的同源不变量（实测：`baseline-triage`×2 + `compat-req-261006201814`×1 转红，已按仓规 `git checkout --` 还原）。按 `REQ-261008004324-81df/retro.md:55`「基线三份清单重新分诊 = 人的动作」，本需求**不代劳**该步，只在验收材料中如实标注并交付前置读数（新增失败 0）。
