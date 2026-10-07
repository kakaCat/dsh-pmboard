# 原型清单（REQ-261006211623-9dc1）· 2026-10-06

> 权威版本**恰好一条**（0 条 / 多条 = `prototype_version_conflict`）；作废版本标 `superseded`，
> 并在「被取代于」列写权威版本的路径。维护纪律：本表由 agent 手写，登记侧只校验不改写。

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/dag-chain-missing.html | authoritative | FR-6 | |

## 为什么表里只有一行（骨架去哪了）

进入需求阶段时本目录幂等落过一份**骨架** `prototypes/detail.html`（模板占位，INDEX 骨架行写的是
`FR-1`）——它是"待填的模板"，不是设计结论（`prototype-placeholder` 的判据正是区分这两者）。
本需求的 UI 落点只有一条（FR-6：看板 DAG 卡的 `[链未生成]` 红标判据），正式原型即上表这一份，
故骨架连同它的占位行一并移除，避免"文件在盘、表里没有"或"占位冒充权威"两种歧义。

判据引用口径：需求文档 FR-6 与后续 UI 卡的 `prototypeRefs` 一律引用
`prototypes/dag-chain-missing.html#FR-6`（该锚点区块在 HTML 第 184 行）。

