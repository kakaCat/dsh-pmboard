---
req_id: "REQ-261007210801-3bff"
title: "拆分计划：pmboard 产品规划落地"
date: 2026-10-07
---

# 拆分计划：pmboard 产品规划落地

> **TL;DR**：规划正文（design/product-plan.md）已确认。剩余工作拆两张卡：
> t1 把规划落到长期位置并挂进说明书；t2 按 DOC-1..5 判据逐项核对出验收材料。

## 目标与做法

让规划不只存在于需求目录：合并进 `docs/strategy-research/` 长期指导页、
项目说明书挂链，使后续每次立项都能对照；然后用可执行判据逐项核对，交付验收。

## 任务表

| 计划 key | 任务 | 验收 | 工作量 |
|---|---|---|---|
| t1 | 规划落长期位置并挂链 | 见下 | 小 |
| t2 | 按判据逐项核对并交付验收 | 见下 | 小 |

### t1 规划落长期位置并挂链

- **serves / requirement_refs**：DOC-1, DOC-2, DOC-3, DOC-4, DOC-5
- **实施**：新建 `docs/strategy-research/product-plan-ux-focus.md`（front-matter 齐全，
  内容为已确认规划正文的长期版：方向裁定、P1–P4 清单、非目标、做透判据）；
  在 `docs/architecture/project-manual.md` 的索引表加一行指向它。
- **验收**：`test -f docs/strategy-research/product-plan-ux-focus.md` 通过；
  `grep -c "product-plan-ux-focus" docs/architecture/project-manual.md` ≥ 1；
  长期页含 P1–P4 四行事项（`grep -c "^| P[0-9]" docs/strategy-research/product-plan-ux-focus.md` = 4）。

### t2 按判据逐项核对并交付验收

- **serves / requirement_refs**：DOC-1, DOC-2, DOC-3, DOC-4, DOC-5
- **依赖**：t1（长期页落好后判据才有稳定核对对象）
- **实施**：逐条跑 DOC-1..5 的判据命令（grep/test），记录输出摘要；提交验收材料。
- **验收**：五条判据命令全部有输出摘要且满足取值要求；验收材料含逐项结果。

## 依赖

t2 depends_on t1（顺序执行，无并行面）。
