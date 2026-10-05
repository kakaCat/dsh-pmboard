# 复核记录 · REQ-260930230225-71be（会话头部流程图响应式 + 挂载点迁移）

> **TL;DR**：6 张任务卡的复核段结论汇总——实现与批准的设计**无实质偏离**；有 **3 处「设计未写 / 与设计字面不同」的调整**已逐条声明；
> 另如实列出 **4 项遗留与风险**（其中 2 项是本次验证过程自身发现的缺陷，已修并留痕）。

## 1. 复核范围与结论

| 卡 | 复核对象 | 结论 |
|----|----------|------|
| t1 契约卡 | `flow-chart-model.ts` 的 `buildFlowChartModel` 映射 vs `design/data-model.md` D-2 | 无偏离（7 种 status 的四态序列、skip、token、countText 与规则表逐条一致） |
| t2 注册卡 | `index.ts` 注册项 vs `design/interfaces.md` I-1 | 无偏离（槽位名/order/id/inject 与契约表逐项一致；官方 order 带 -30/-20/-10 核对无误） |
| t3 视图接线卡 | `conversation-progress.ts` 的 DOM 与类名 vs `design/interfaces.md` I-2 | 无偏离（7 个类名、`data-state`、`data-selected`、节点点击行为均保持；仅数据来源改调模型） |
| t4 样式卡 | `styles/board.ts` 规则清单 vs `design/interfaces.md` I-3 / I-4 | 有 2 处调整（见 §2），阈值 880/620/460 与 `FLOW_TIERS` 一一对应 |
| t5 回归门卡 | `header-progress-probe.mts` 断言口径 vs `design/test-cases.md` A1–A6 | 有 1 处调整（见 §2）；探针同时自证会红（见 `../tests/test-evidence.md` 负向验证） |
| t6 兼容与回滚卡 | `--fallback` 分支、残余记录、回滚表 vs `design/data-model.md` D-4 / A-5 | 无偏离；残余逐条写进 `../evidence/README.md`，未美化 |

## 2. 三处调整（设计字面 vs 实现，均已在前一节点汇报）

| # | 设计里写的 | 实际做的 | 触发它的证据 |
|---|-----------|---------|--------------|
| 1 | 降级上限 `max-width: 64vw` | `min(64vw, calc(100vw - 320px))` | 64vw 单用不够：窄窗口下芯片与官方固定宽工具并排仍会溢出；320px ≈ preset + utilities + corner |
| 2 | （未规定） | 新增 `@container (max-width: 880px) { .dsh-pm-cprog-inline { max-width: none } }` | 交还行布局后实测六档 `chartScrollX` 由 28~102px 归零、7 个圆点全在视野内；视口上限退居降级安全网 |
| 3 | A1 量法用 `.titleRow` 的 `scrollWidth - clientWidth` | 「行内最右直接子座位 vs 行右边缘」+ 文档级 `scrollWidth - innerWidth` | Chrome 对 `overflow: visible` 的盒子不把溢出内容算进 `scrollWidth`，原量法恒为 0（**假绿**） |

## 3. 遗留与风险（如实列出）

| # | 事项 | 影响 | 处置 |
|---|------|------|------|
| 1 | 探针标本页最初漏了 `BASE_CSS` 的 `--pm-*` 色彩 token | done 圆点变成「白字透明底」——肉眼不可见，而断言只看 `display` 所以照样通过（**验证缺陷**，非交付缺陷） | 已补 `BASE_CSS`，并把这段围堵写进探针注释与 `../evidence/README.md` §4 |
| 2 | 首版截图（窗口宽 = 行宽）显示窄档只有 6 个圆点 | 原因是那时尚未加 §2-2 的规则，芯片被视口上限夹到 160px 触发内部滚动 | 加规则后重跑重截，六档 `chartScrollX=0`、截图 7 点齐全 |
| 3 | 不支持容器查询的引擎 | 档位规则整体不生效 → 全量渲染；行不溢出，但窄窗口芯片内部滚动 94~362px；面板回 `right:0` 锚点，极窄窗口可能左溢出 | 已在 `../evidence/README.md` §5 列为已知残余；`--fallback` 探针把该路径变成可复跑 |
| 4 | 全套回归 48 failed files / 103 failed tests | 均为工作区**其它在飞改动**造成（本次之前工作区已有 117 个脏文件） | 失败文件名单里**没有任何一个**引用本次触碰的 6 个文件（grep 佐证见 `../tests/test-evidence.md` §五） |

## 4. 结论

- FR-1 ~ FR-6 的实现与设计无实质偏离；六条条款均有接收任务（覆盖表见 `../decomposition.md` §P-3）。
- 交付物在「静态断言 + 真实渲染 + 构建产物」三层均有可复核证据（见 `../tests/test-evidence.md`）。
- 三处调整都是**为了让批准的判定标准（尤其 FR-2「标题行不溢出」）真的成立**，不是放宽口径；两处验证缺陷已修并留痕。
