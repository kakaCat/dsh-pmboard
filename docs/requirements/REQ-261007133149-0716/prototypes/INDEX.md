# 原型清单（REQ-261007133149-0716）· 2026-10-07

> 权威版本**恰好一条**（0 条 / 多条 = `prototype_version_conflict`）；作废版本标 `superseded`，
> 并在「被取代于」列写权威版本的路径。维护纪律：本表由 agent 手写，登记侧只校验不改写。

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/anatomy.html | authoritative | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 | |
| prototypes/detail.html | superseded | FR-1 | prototypes/anatomy.html |

**服务条款 = FR-1 ~ FR-6（全覆盖）**，上表按解析器口径逐条列全：门禁的「服务条款」列是**逐条 id 匹配**
（`FR-1 ~ FR-6` 这种区间写法只会解析出 FR-1 与 FR-6 两条，中间四条会变成锚点缺口），故不写区间、逐条列出。

| 版本 | 是什么 | 为什么换 |
|---|---|---|
| prototypes/anatomy.html | 组件解剖图：10 个组件的 DOM 根 / 拥有的 report.ts 章节与行号 / 改它时不必读什么；首屏三段范围图；FR-1~FR-6 各一块；几何量为 headless Chrome 实测 | 本需求是**零外观变更**的组件化改造，要回答的是「谁拥有哪块界面、改它该动哪里、不必读什么」——视觉稿答不了这个问题 |
| prototypes/detail.html | 模板骨架（`templates/brainstorming/prototype.html` 落盘的初始态，未填内容） | 它是未填写的骨架，不是设计结论；照它实现等于照模板实现 |

## 几何量出处

`anatomy.html` 里的 `<!-- proto-geometry -->` 共 16 条观测，全部由 headless Chrome 打开
`scripts/fixtures/req-detail-specimen.mts` 的 7 件标本页实测（`specimenShell(1280,'inflight',…)` +
`specimenShellForPanel(1280,'inflight',<6 面板>,…)`），条件统一为 `width:1280, state:inflight`。
每条观测带 `shot` + `shotSha256`，指向 `evidence/prototype-anatomy-1280.png`：

```
docs/requirements/REQ-261007133149-0716/evidence/prototype-anatomy-1280.png
sha256 = 04f18dc4af00f998ab8a31ddf7a55706666e60f720263b5de6179569aaad3f0b
```
