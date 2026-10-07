# 评审报告（REQ-261006130057-7a43 需求详情页 UI 优化）

> 本需求每张父卡的「复核」子卡都做了**对抗性**审查（独立子代理、只读、逐条对照设计/原型），
> 报告如下。修复项均在对应卡内完成并复测；挂账项在文末集中登记。

## 评审方式

- 每卡链路：研发 →（联调）→ **复核** → 测试；复核由独立子代理执行，职责是**挑错**（P0/P1/P2 分级）。
- 对照基准：`design/` 六份（architecture/interfaces/data-model/frontend/test-cases/use-cases）、
  权威原型 `prototypes/detail.html` v1.5（`prototypes/INDEX.md` authoritative）、D-1~D-9 裁定。

## 逐卡结论

| 卡 | 复核结论 | 抓出并修复 | 挂账 |
|---|---|---|---|
| t1 服务端契约（verify 端点 + 对话游标） | 通过（1×P1 + 4×P2） | **P1** 取根候选序：需求声明根排第一（跨工作区静默缺 RTM）→ 改 `req.workspaceRoot ?? deps.workspaceRoot` + 回归测试；P2-3 坏台账 `.trim()` 500 防护；P2-2 文档勘正（对话 `page` 必填） | P2-1 同毫秒页边界丢失（时间戳游标的设计取舍）；P2-4 前后端拆包时游标语义切换警觉 |
| t2 壳（验收 Tab 注册 + Tab 栏） | 通过（1×P1 + 4×P2） | **P1** 验收 Tab 缺红色待裁决徽标 → `dsh-pm-badge-alert` + `data-badge-verify` + 断言 | 探针口径两条（已随 t9 收口：Tab 栏横滚实测未内溢；INACTIVE_PANEL_KEYS 六键） |
| t4 头部三层 | 通过（2×P1 + 2×P2） | **P1** 闸门锚链与宿主 hash 深链同信道风险 → 改 `data-action="scroll-gap-focus"` + `scrollIntoView`；**P1**（记 t2 账）FR-4 测试切片过宽 → 截到下一块首；P2-1 终态豁免；P2-2 裸 px 豁免注记 | 旧探针 `.dsh-pm-rh-bar` 引用（已随 t9 处理） |
| t5 状态带权重 | 通过（1×P1） | **P1** `--pm-danger-tint` 上三档文字对比度跌破 4.5 → tint `#fae0e3` → `#fdf2f3`（4.92/4.82/4.63） | 对比度脚本盲区（已随 t9 补四对判据） |
| t6 评论 + 汇报网格 | 通过（0 返工项） | —（研发子代理中途失败，主代理验收收口后复核确认无归属不明改动） | 「纵向收敛 60%」为观感口径，归截图人评审 |
| t7 对话聊天化 | 通过（5×P2） | 联调抓出「加载更早」按钮白底白字 → 补 `primary` 类；P2-1 七处死选择器；P2-2 三处死注释 | P2-3 吸顶条投影一处 rgba（有先例，不改） |
| t8 四个面板 + DAG 适配 | 通过（1×P1 + 2×P2） | **P1** 图例「完成」色点悬空令牌 `--pm-ok` → `--pm-ok-text` | dag 图例三条内联 rgba（同块存量惯例）；docs `relPathHint` 重复实现（建议级） |
| t3 验收面板 RTM 列表 | 通过（2×P2） | —（verify.ts 主体经逐行审查无返工级问题） | 裁决交互形态沿用既有 `submit-verdicts` 收集链（按 DOM 锚点验收）；两个布局类无样式规则 |
| t9 视觉对照与探针 | 通过（1×P1 + 4×P2） | **P1** 两条新控件命中区 <24 被登记豁免 → 加 `min-height: var(--pm-target)`（并连带 `gate-link`），豁免**销账**；P2-1 deviations 管线停用；P2-2 陈旧文案；P2-3 before 副本 sha256 守卫；P2-4 路径格缺席也判红 | — |
| t10 兼容回归收尾 | 走查自证（无独立复核子卡） | — | 见下「外部条件」 |

## 复核阶段额外发现（跨卡，均已就地修复）

1. **注释提前闭合块注释吞规则**（t9 探针发现）：`src/client/styles/report.ts` 两处横幅注释里
   「--s*」「--f-*」后紧跟斜杠（`*` + `/`）提前闭合块注释，吞掉紧随的 FR-5 令牌块与
   `.dsh-pm-doc-filepath` 主规则——**FR-5 模块标题 650 半粗与路径格等宽从未生效**（t6 测试只断言 DOM 故漏过）。
   已改写注释并**销账**两条 pinned deviation；H3 双通道与路径等宽升为硬断言。
2. **文档迁移条按钮只有「→」**（10.9px 宽、可读性差）：改为「去验收 Tab →」，命中区同步达标。

## 挂账（不阻塞验收，如实登记）

- `dag` 图例三条内联 rgba 色值（同块存量惯例，未令牌化）。
- `docs.ts` 的 `relPathHint` 与 `pathCellOf` 存在重复 rel 计算（建议级）。
- 原型未补「激活页签底部 2px 指示条」一笔（`design/frontend.md` 有、原型 v1.5 无；结构锚点不受影响）。
- 对话时间戳游标在**同毫秒**条目上的边界丢失（设计已裁定的取舍，`interfaces.md` 已注）。

## 外部条件（非本需求）

- 全仓 `tsc --noEmit` 唯一错 `tests/query-docs-roots.test.ts:36 TS2415`：另一窗口在途改造
  （`tests/application/harness.ts` 新增 `private root` 与其子类冲突）。本需求文件面零错。
- 全量测试 68 失败 = 基线 68；新增 9 条集合差异全部归因其它窗口在途改造（详见 `tests/verification-run.md` §5）。
- 未执行 `baseline --refresh`（避免替他人销账）。


---

# 补记：验收期返工轮的复核（D-10 ~ D-13）

> 本轮由**人的验收反馈**触发（不是自评）：原话与裁定见 `requirement.md` D-10~D-13。
> 处置方式：逐 Tab 出「原型 vs 实现」同口径对照图（`evidence/tab-parity-*.png`）→ 按差异逐条修 →
> 每项修复都跑该 Tab 的套件 + 探针 + 对照图复验。

## 返工项与验收判据

| 项 | 复核判据（可失败） |
|---|---|
| 文档 Tab 短名/短状态/灰「打开」 | `tests/docs-panel` 断言短名 + `title` 全文 + chip 五态；parity 图逐列对齐 |
| 验收 Tab 按 FR 成行 + 名称 | `tests/verify-panel` T-2b/T-2c（FR 升序 / 多子项取最严重 / aux 组不丢 / 无 frMap 降级 / 无 frNames 只编号）；`tests/query-verify` T-20b（抽名边界与三条降级）；探针「8 行 · `data-fr-name` 非空」 |
| 提示词 Tab 折叠 | `tests/prompts-panel` 28 例（默认无 `open` / 折叠体内逐字在场 / chips 字段） |
| Token Tab 列序 | `tests/token-panel` 27 例（7 列 / 节点行 / 未采集不写 0 / 三段折叠） |
| 汇报 Tab 标题用词 | `tests/trunk-panel`（标题断言）+ 95 例绿 |
| DAG/对话视口自适应 | 探针 A3（两处豁免仍在白名单、无新增内层滚动源）+ A2 无新增横向溢出 |
| 版心 border-box | 探针四组合几何量复测（tabsTop/headHeight/bandHeight 全部仍在阈值内） |

## 本轮判为「可接受」的偏离（人已知）

1. 标本 `frNames` 用 requirement.md **全称**，原型 `#tab-verify` 那三条是它自己的缩写（FR-1/6/7）——
   标本是真实端点替身，端点读文档只发全称；要改成缩写只需动标本 3 行，实现与测试不动。
2. 提示词/Token 的数字格式沿用全仓裸数字口径（不做千位分隔 / K 缩写）。
3. 文档 Tab 的状态 chip 无浅底（本仓「底色只两档」纪律），用语义文字色 + 发丝描边表达。
4. 文档 Tab 的归档清单 / 「其它发现」样例未短名化（原型该 Tab 无归档块、样例列不是路径列）。
5. 验收 Tab 的「N 项」计数与 aux 组汇总口径是对原型的**审计增强**（原型无，防漏项）。

## 本轮新发现并修复的真缺陷

1. **版心右缘被裁 20px**（content-box + max-width + padding）——影响**所有 Tab** 的末列；`box-sizing: border-box` 修复。
2. **标本 token 数字不自洽**（输入占比 132%）——按「合计 = 输入 + 输出」修正标本。
3. 提示词口径说明折叠体缺壳（展开后贴边框）——补 `.dsh-pm-fold-body`。

## 外部条件（非本需求，仍未变）

- 全仓 `tsc` 唯一错 `tests/query-docs-roots.test.ts TS2415`（另一窗口在途）。
- 全量测试失败数 = 基线数；新增条目逐条归因其它窗口在途改造（`client-view`←`board.ts`/`verification.ts`、
  `typecheck`←上行 TS2415、`error-code-inventory`、`live-tasks-single-source`、`artifact-openable`、
  `doc-gate-e2e`、`kb-invalidation` 等），本需求文件面零新增。**未 `--refresh` 基线**（不替他人销账）。
- `scripts/req-detail-design-conformance.mts`（f32f 的独立脚本，不在 vitest 门禁内）因历史 CSS 漂移为红
  （250k vs 297k 字符，远超本需求改动量）；它校验的是 **f32f 原型 v3 的内联 CSS**，属别需求产物，未动。
