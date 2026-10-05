/**
 * pmboard 样式分片 · board（REQ-47939a t12 从 styles.ts 机械拆分，原文件 1148-1531 行）。
 * 看板层：进度点/Tab 内容区 + 当前阶段高亮卡/统计卡 + 验收泳道置灰 + 会话内联流程图/详情面板 + 产物 chips 与确认按钮。
 * 注意：本文件是原单文件 CSS 模板的**连续区段**，由 styles.ts 按原物理顺序拼接，拼接结果与拆分前逐字节一致。
 */
// REQ-260930230225-71be FR-3：档位阈值单一源——CSS 与单测读同一份常量（data-model.md D-3）。
import { FLOW_TIERS } from '../flow-chart-model.ts'

export const BOARD_CSS = `/* Tab 内容区 */
.dsh-pm-tab-content {
  padding: 24px; display: none;
}
.dsh-pm-tab-content.active {
  display: block;
}
/* REQ-6f39b5：当前阶段高亮卡（对齐 prototype .dsh-pm-stage-current）*/
.dsh-pm-stage-current {
  background: linear-gradient(135deg, rgba(74,125,255,.08) 0%, rgba(74,125,255,.02) 100%);
  border: 1px solid rgba(74,125,255,.2); border-radius: 10px; padding: 20px;
}
.dsh-pm-stage-current-title { font-size: 14px; color: var(--dsw-accent, #4a7dff); font-weight: 600; margin-bottom: 12px; }

/* REQ-6f39b5：任务统计卡片（对齐 prototype .dsh-pm-stats）*/
.dsh-pm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 8px; }
.dsh-pm-stat {
  background: var(--dsw-bg-primary, #fff); border: 1px solid var(--pm-line);
  border-radius: 8px; padding: 16px;
}
.dsh-pm-stat-label { font-size: 12px; color: var(--dsw-text-secondary, #6b7280); margin-bottom: 8px; text-transform: uppercase; font-weight: 500; }
.dsh-pm-stat-value { font-size: 28px; font-weight: 700; color: var(--dsw-text-primary, #111827); }
.dsh-pm-stat-success .dsh-pm-stat-value { color: #28a745; }



/* REQ-6f39b5：验收泳道中的 done（历史完成）需求置灰显示 */
.dsh-pm-card.is-archived { opacity: 0.5; }
.dsh-pm-card.is-archived:hover { opacity: 0.75; }
/* ========================================================================
   REQ-6f39b5：列表视图表格化（对齐 list-prototype.html）
   ======================================================================== */
.dsh-pm-table { width: 100%; border-collapse: collapse; background: var(--dsw-bg-primary, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.dsh-pm-table thead { background: var(--dsw-bg-secondary, #f9fafb); }
.dsh-pm-table th {
  padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600;
  color: var(--dsw-text-secondary, #6b7280); text-transform: uppercase;
  border-bottom: 2px solid var(--pm-line); white-space: nowrap;
}
.dsh-pm-table td {
  padding: 12px 16px; font-size: 13px; color: var(--dsw-text-primary, #374151);
  border-bottom: 1px solid var(--pm-line); vertical-align: middle;
}
.dsh-pm-table tbody tr.dsh-pm-list-row { cursor: pointer; transition: background .2s; }
.dsh-pm-table tbody tr.dsh-pm-list-row:hover { background: var(--dsw-bg-secondary, #f9fafb); }
.dsh-pm-table tbody tr.dsh-pm-list-row.is-archived { opacity: 0.5; }
.dsh-pm-table tbody tr.dsh-pm-list-row.is-archived:hover { opacity: 0.7; }
.dsh-pm-td-title { max-width: 380px; }
.dsh-pm-td-title .dsh-pm-list-title { font-weight: 600; color: var(--dsw-text-primary, #111827); cursor: pointer; }
.dsh-pm-td-title .dsh-pm-list-title:hover { color: var(--dsw-accent, #4a7dff); }
.dsh-pm-td-progress { min-width: 140px; }
.dsh-pm-td-progress .dsh-pm-list-progress { display: flex; align-items: center; gap: 8px; }
tr.dsh-pm-list-grouphead td {
  padding: 10px 16px; font-size: 12px; font-weight: 600;
  color: var(--dsw-text-secondary, #6b7280);
  background: var(--dsw-bg-secondary, #f9fafb);
  border-bottom: 1px solid var(--pm-line);
}
.dsh-pm-table .dsh-pm-list-actions { display: flex; gap: 6px; flex-wrap: nowrap; }
.dsh-pm-table .dsh-pm-list-actions .dsh-pm-card-actions { margin-top: 0; padding-top: 0; border-top: none; }
.dsh-pm-table .dsh-pm-list-actions .dsh-pm-btn { flex: none; }

/* ========================================================================
   REQ-260930194112-1ab8：列表视图自适应（窄面板不压列、不叠按钮）
   ------------------------------------------------------------------------
   现状问题：8 列表格无任何宽度约束，浏览器按 min-content 压列——中文逐字竖排、
   ID 断在连字符、操作列被压到「取消/会话」叠字（840px 视口实测复现）。
   修法四件套：
     ① 表格外层滚动兜底（< 720px 时整表横向滚动，不压扁）
     ② 关键列 nowrap，标题列例外（允许折行、吃掉剩余宽度）
     ③ 操作列按钮组不可压缩（根治叠字）
     ④ 讲宽度档位：≤1180px 让出分类/负责人/更新时间；≤880px 再让出进度
   隐藏由 CSS 承担，markup 恒输出 8 列（设计 data-model.md D-2 的取舍）。
   ======================================================================== */

/* ① 保底横向滚动：表格低于 min-width 时整表滚，而不是把列压成单字宽 */
.dsh-pm-table-wrap { overflow-x: auto; }
.dsh-pm-table { min-width: 720px; }

/* ② 关键列单行；标题列例外，并给下限（原本窄宽度下会被压到每行 5~7 字） */
.dsh-pm-table th,
.dsh-pm-table td { white-space: nowrap; }
.dsh-pm-table .dsh-pm-td-title { white-space: normal; min-width: 220px; }

/* ③ 操作列：按钮组整块不可压缩，取消/会话不会再叠在一起 */
.dsh-pm-table .dsh-pm-list-actions { flex-wrap: nowrap; }
.dsh-pm-table .dsh-pm-list-actions .dsh-pm-card-actions { flex: none; min-width: max-content; }
.dsh-pm-table .dsh-pm-list-actions .dsh-pm-btn { white-space: nowrap; }

/* ④ 宽度档位一：让出次要三列；同时解除标题列 380px 上限，让标题吸收剩余宽度 */
@media (max-width: 1180px) {
  .dsh-pm-table .dsh-pm-td-title { max-width: none; }
  .dsh-pm-table .dsh-pm-col-cat,
  .dsh-pm-table .dsh-pm-col-owner,
  .dsh-pm-table .dsh-pm-col-when { display: none; }
}

/* ④ 宽度档位二：再让出进度列（ID / 标题 / 状态 / 操作 四列始终可见） */
@media (max-width: 880px) {
  .dsh-pm-table .dsh-pm-col-progress { display: none; }
}


.dsh-pm-section {
  margin-bottom: 24px;
}
.dsh-pm-section-title {
  font-size: 14px; font-weight: 600;
  color: var(--dsw-text-primary, #333);
  margin-bottom: 12px;
}
.dsh-pm-section-content {
  background: var(--dsw-bg-secondary, #f9fafb);
  border: 1px solid var(--dsw-border, #e5e7eb);
  border-radius: 8px; padding: 16px;
}

/* REQ-260930230225-71be FR-2：容器可收缩——不再由内容把标题行撑开（min-width:0 让 flex 能压缩） */
/* 注意：这里**故意不设 position** —— 详情面板要相对「会话框根」定位才能与会话框左边对齐
   （最近的已定位祖先 = 官方 ConversationRoot 的 .root）。设成 relative 会把面板拉回芯片右下角。 */
.dsh-pm-cprog { display: inline-flex; align-items: center; flex-direction: column; gap: 6px; min-width: 0; max-width: 100%; }
/* 内联流程图（始终可见，位于模式选择器后） */
.dsh-pm-cprog-inline {
  display: inline-flex; align-items: center; gap: 6px;
  min-width: 0; max-width: min(64vw, calc(100vw - 320px)); /* 兜底上限：不支持容器查询时也不会撑破标题行
     （64vw 单用不够——窄视口下它与固定宽度的官方工具并排仍会溢出；320px ≈ preset + utilities + corner 的固定占用） */
  border: 1px solid var(--dsw-border, rgba(128,128,128,.25)); border-radius: 12px;
  background: var(--dsw-bg-secondary, rgba(128,128,128,.05));
  padding: 2px 6px; cursor: pointer; transition: all .2s ease;
}
.dsh-pm-cprog-inline:hover {
  background: var(--dsw-hover, rgba(128,128,128,.12));
  border-color: rgba(74,125,255,.4);
  box-shadow: 0 2px 8px rgba(74,125,255,.1);
}
.dsh-pm-cprog-inline-count {
  /* 验收反馈「字体太大」后随节点数字一起收一档（10 → 9px），与芯片内其余文字同一尺度 */
  font-size: 9px; color: var(--dsw-text-secondary, #666);
  font-variant-numeric: tabular-nums; font-weight: 500;
  padding-left: 4px; border-left: 1px solid var(--dsw-border, rgba(128,128,128,.2));
}
.dsh-pm-cprog-inline.is-closed { opacity: .75; }

/* 详情面板（点击流程图展开） */
.dsh-pm-cprog-detail-panel {
  /* REQ-260930230225-71be FR-4（验收反馈第三轮定稿）：面板与会话框最左边对齐 ——
     绝对定位锚在「会话框根」（见上面 .dsh-pm-cprog 不设 position 的说明），left: 0 = 会话框左缘；
     top: 84px = 标题行 76px + 8px 间距。宽度按容器收敛，不越出会话框。 */
  position: absolute; top: 84px; left: 0; right: auto; z-index: 60;
  width: min(720px, calc(100% - 32px)); max-height: min(68vh, calc(100vh - 120px)); overflow-y: auto;
  background: var(--dsw-bg, #fff); border: 1px solid var(--dsw-border, rgba(128,128,128,.25));
  border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px; text-align: left;
}

.dsh-pm-cprog-trigger {
  display: inline-flex; align-items: center; gap: 8px; max-width: 340px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.25)); border-radius: 999px;
  background: transparent; color: var(--dsw-text-secondary, #666); font: inherit; font-size: 12px;
  padding: 3px 10px; cursor: pointer; white-space: nowrap;
}
.dsh-pm-cprog-trigger:hover { background: var(--dsw-hover, rgba(128,128,128,.1)); color: var(--dsw-text-primary, #333); }
.dsh-pm-cprog-ico { font-size: 11px; opacity: .85; }
.dsh-pm-cprog-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.dsh-pm-cprog-mini {
  width: 46px; height: 5px; border-radius: 3px; overflow: hidden;
  background: rgba(128,128,128,.22); flex: none;
}
.dsh-pm-cprog-mini > i { display: block; height: 100%; background: linear-gradient(90deg,#4a7dff,#8e44ad); }
.dsh-pm-cprog-count { font-size: 11px; opacity: .85; font-variant-numeric: tabular-nums; }
/* 已归档会话的窗口按钮：置灰、不可点（.is-archived 不带 data-action） */
.dsh-pm-window.is-archived,
.dsh-pm-session.is-archived {
  opacity: .5; cursor: default;
  background: var(--dsw-hover, rgba(128,128,128,.10));
  color: var(--dsw-text-secondary, #999);
}
.dsh-pm-window.is-archived:hover,
.dsh-pm-session.is-archived:hover {
  background: var(--dsw-hover, rgba(128,128,128,.10));
}
.dsh-pm-cprog-trigger.is-closed { opacity: .78; }
.dsh-pm-cprog-trigger.is-closed .dsh-pm-cprog-name { font-weight: 400; }
.dsh-pm-cprog-panel-note {
  font-size: 11px; line-height: 1.5; color: var(--dsw-text-secondary, #888);
  background: rgba(128,128,128,.10); border-radius: 6px; padding: 6px 8px;
}

.dsh-pm-cprog-panel {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 60;
  width: 380px; max-height: 62vh; overflow-y: auto;
  background: var(--dsw-bg, #fff); border: 1px solid var(--dsw-border, rgba(128,128,128,.25));
  border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px; text-align: left;
}
.dsh-pm-cprog-panel-head { display: flex; align-items: center; gap: 8px; }
.dsh-pm-cprog-panel-title { font-size: 13px; font-weight: 600; color: var(--dsw-text-primary, #222); }
.dsh-pm-cprog-panel-sub { font-size: 11px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-cprog-sec { display: flex; flex-direction: column; gap: 6px; }
.dsh-pm-cprog-sec > b { font-size: 11px; color: var(--dsw-text-secondary, #888); font-weight: 600; }

/* 流程图（横向时间线）：未到 / 当前 / 完成 / 跳过 四态配色统一，尺寸一致 */
.dsh-pm-flow { display: flex; align-items: stretch; gap: 0; overflow-x: auto; padding: 2px 0; }
.dsh-pm-flow-node {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  /* REQ-261004151652-d535 FR-1：节点宽由内容决定（max(圆点, 名字, 数字)）。
     「flex: none」 是关键——允许收缩时节点会被压到 min-width，而数字比它宽，
     窄档就会串成 「827.8k10.9M922.0k12.7M」（实测）。min-width 只作圆点档的下限。 */
  flex: none; min-width: 32px; cursor: pointer; transition: transform .2s ease;
}
.dsh-pm-flow-node:hover { transform: translateY(-2px); }
.dsh-pm-flow-node[data-selected="true"] .dsh-pm-flow-dot {
  box-shadow: 0 0 0 3px rgba(74,125,255,.3);
  transform: scale(1.08);
}
.dsh-pm-flow-node[data-selected="true"] .dsh-pm-flow-label {
  font-weight: 700;
  color: #2f5fd0;
}
.dsh-pm-flow-dot {
  width: 14px; height: 14px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 600; box-sizing: border-box;
  background: var(--pm-bg-soft); color: var(--dsw-text-secondary, #888);
  border: 1px solid var(--pm-line);
  transition: background .2s ease, box-shadow .2s ease, transform .2s ease;
}
/* 未到：空心灰 */
.dsh-pm-flow-node[data-state="pending"] .dsh-pm-flow-dot {
  background: transparent; border: 1px solid var(--pm-line-strong); color: var(--dsw-text-secondary, #999);
}
/* 完成：实心绿 + 对勾 */
.dsh-pm-flow-node[data-state="done"] .dsh-pm-flow-dot {
  background: var(--pm-c-done); border-color: var(--pm-c-done); color: #fff;
}
/* 当前：实心蓝 + 光环 */
.dsh-pm-flow-node[data-state="current"] .dsh-pm-flow-dot {
  background: var(--pm-c-implementing); border-color: var(--pm-c-implementing); color: #fff;
  box-shadow: 0 0 0 3px rgba(74,125,255,.25);
}
/* 跳过（本分类不适用）：虚线灰 + 降透明，与"未到"再区分一层 */
.dsh-pm-flow-node[data-state="skipped"] .dsh-pm-flow-dot {
  background: transparent; border: 1px dashed var(--pm-c-archived); color: var(--pm-c-archived); opacity: .7;
}
.dsh-pm-flow-label {
  font-size: 8px; color: var(--dsw-text-secondary, #999); white-space: nowrap;
  transition: color .2s ease, opacity .2s ease;
}
.dsh-pm-flow-node[data-state="pending"] .dsh-pm-flow-label { opacity: .75; }
.dsh-pm-flow-node[data-state="done"] .dsh-pm-flow-label { color: #1e7e34; }
.dsh-pm-flow-node[data-state="current"] .dsh-pm-flow-label { color: #2f5fd0; font-weight: 600; }
.dsh-pm-flow-node[data-state="skipped"] .dsh-pm-flow-label {
  color: var(--pm-c-archived); opacity: .55; text-decoration: line-through;
}
.dsh-pm-flow-link {
  width: 8px; height: 2px; border-radius: 1px; margin-top: 6px; flex: none;
  background: rgba(128,128,128,.22);
}
.dsh-pm-flow-link[data-state="done"] { background: rgba(40,167,69,.6); }

/* REQ-260930230225-71be FR-3：按标题行（官方 .titleRow，inline-size 容器）宽度分档降级。
   阈值来自 FLOW_TIERS 单一源；匿名 @container 匹配最近的容器祖先，组件若被放到没有容器祖先的
   位置则全部规则不命中 → 退化为全量渲染（与迁移前一致，不报错）。

   REQ-261004151652-d535：只剩**两段**——
     · link（780）：去连线与非当前节点名；
     · label（600）：名字与节点 token 一起让位，交出「计数 + 需求累计 Token」。
   为什么合并成两段：「FLOW_TIERS.token === FLOW_TIERS.label」（刻意的等式），
   于是「有名字就有该节点的数」是结构性的；旧的三段里 token 单独一档 1000，
   造成「有名字没数」——那正是本需求要修的病。 */
@container (max-width: ${FLOW_TIERS.link}px) {
  /* 去连线 + 非当前节点名（当前节点名恒可见 = 不丢「我在哪」；**它的数也留着**） */
  .dsh-pm-flow-link { display: none; }
  .dsh-pm-flow-node:not([data-state="current"]) .dsh-pm-flow-meta { display: none; }
  .dsh-pm-flow-node { min-width: 20px; }
}
@container (max-width: ${FLOW_TIERS.label}px) {
  /* 名字与节点 token 一起让位（等式：token 阈值 === label 阈值） */
  .dsh-pm-flow-token { display: none; }
  .dsh-pm-flow-node .dsh-pm-flow-meta { display: none; }
  .dsh-pm-flow-node { min-width: 18px; }
  /* 容器查询可用时把宽度上限交还给行布局（实测全档不溢出、7 个圆点全在视野内，内部滚动归零）。
     视口上限只留给「不支持容器查询」的降级路径当安全网。 */
  .dsh-pm-cprog-inline { max-width: none; }
  /* REQ-261004151652-d535 FR-3：明细全隐 ⇒ 需求累计 Token**让位显示**（默认隐藏见 styles/token.ts）。
     选择器**刻意带 .dsh-pm-cprog-inline 前缀**：样式分片的拼接顺序是 BASE → BOARD → TOKEN，
     而 TOKEN_CSS 里的默认 display:none 与这里同特异性时「后被追加者胜」——**实测踩过**：
     不带前缀时这条显示规则被默认值压住，窄档反而没有总数（探针报 TOTAL_MISSING）。
     同为极窄档的最小化：只留数字、收掉 🪙 图标（省约 18px）。 */
  .dsh-pm-cprog-inline .dsh-pm-cprog-token-total { display: inline-flex; }
  .dsh-pm-cprog-token-ico { display: none; }
}
/* REQ-260930230225-71be FR-4（第三轮定稿）：不再需要「窄档切 fixed」的双模 ——
   官方 .titleRow 的 container-type 带来 layout containment，面板的包含块**始终是会话框**
   （哪怕 position: fixed 也一样），所以一条 absolute + left: 0 就够，宽窄档行为一致。 */

.dsh-pm-cprog-task { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; line-height: 1.45; }
.dsh-pm-cprog-task-ico { flex: none; }
.dsh-pm-cprog-task-body { min-width: 0; }
.dsh-pm-cprog-task-title { color: var(--dsw-text-primary, #333); }
.dsh-pm-cprog-task[data-status="done"] .dsh-pm-cprog-task-title { color: var(--dsw-text-secondary, #999); text-decoration: line-through; }
.dsh-pm-cprog-task-meta { font-size: 10px; color: var(--dsw-text-secondary, #aaa); }
.dsh-pm-cprog-tl { display: flex; flex-direction: column; gap: 5px; font-size: 11px; }
.dsh-pm-cprog-tl-row { display: flex; gap: 8px; align-items: baseline; }
.dsh-pm-cprog-tl-time { color: var(--dsw-text-secondary, #aaa); font-variant-numeric: tabular-nums; flex: none; }

/* ------------------------------------------------------------------ 产物 chips + 确认按钮（REQ-31e11f t7） */

.dsh-pm-artifact-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.dsh-pm-artifact-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  border: none;
  cursor: default;
  line-height: 1.4;
}

.dsh-pm-artifact-chip.confirmed {
  background: rgba(40, 167, 69, .12);
  color: #28a745;
}

.dsh-pm-artifact-chip.pending {
  background: rgba(240, 160, 32, .15);
  color: #b07800;
  cursor: pointer;
}

.dsh-pm-artifact-chip.pending:hover {
  background: rgba(240, 160, 32, .25);
}

.dsh-pm-artifact-chip.missing {
  background: rgba(220, 53, 69, .12);
  color: #dc3545;
}

.dsh-pm-artifact-derived {
  font-size: 10px;
  color: var(--dsw-text-secondary, #999);
  margin-top: 4px;
}

.dsh-pm-confirm-artifact {
  margin-top: 6px;
  font-weight: 600;
}
.dsh-pm-cprog-tl-text { color: var(--dsw-text-primary, #444); }
.dsh-pm-cprog-empty { font-size: 12px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-cprog-foot { display: flex; gap: 8px; }

/* ==================================================================== */
/* 阶段详情面板（stage-panel.ts，REQ-31e11f t6）                          */
/* 8 类节点视觉差异化：每类节点一个 --pm-stage 状态色 + 专属图标 + 专属底色  */
/* ==================================================================== */

/* v4: no box */
.dsh-pm-stage-panel { display: flex; flex-direction: column; gap: 4px; }
.dsh-pm-stage-panel[data-stage="draft"] { --pm-stage: var(--pm-c-draft); }
.dsh-pm-stage-panel[data-stage="brainstorming"] { --pm-stage: var(--pm-c-brainstorming); }
.dsh-pm-stage-panel[data-stage="design"] { --pm-stage: var(--pm-c-design); }
.dsh-pm-stage-panel[data-stage="decomposing"] { --pm-stage: var(--pm-c-decomposing); }
.dsh-pm-stage-panel[data-stage="implementing"] { --pm-stage: var(--pm-c-implementing); }
.dsh-pm-stage-panel[data-stage="accepting"] { --pm-stage: var(--pm-c-accepting); }
.dsh-pm-stage-panel[data-stage="done"] { --pm-stage: var(--pm-c-done); }
.dsh-pm-stage-panel[data-stage="archived"] { --pm-stage: var(--pm-c-archived); }
.dsh-pm-stage-panel.is-skipped {
  --pm-stage: var(--pm-c-archived);
  border-style: dashed; background: var(--pm-bg-soft); box-shadow: none;
}
.dsh-pm-stage-panel-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-pm-stage-label {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 14px; font-weight: 600;
  padding: 3px 11px; border-radius: var(--pm-radius-pill);
  color: var(--pm-stage);
  background: rgba(128,128,128,.10);
  background: color-mix(in srgb, var(--pm-stage) 15%, transparent);
}
/* 8 类节点专属图标（不依赖文字也能分辨节点类型） */
.dsh-pm-stage-panel[data-stage="draft"] .dsh-pm-stage-label::before { content: '📌'; }
.dsh-pm-stage-panel[data-stage="brainstorming"] .dsh-pm-stage-label::before { content: '💡'; }
.dsh-pm-stage-panel[data-stage="design"] .dsh-pm-stage-label::before { content: '📐'; }
.dsh-pm-stage-panel[data-stage="decomposing"] .dsh-pm-stage-label::before { content: '🧩'; }
.dsh-pm-stage-panel[data-stage="implementing"] .dsh-pm-stage-label::before { content: '⚙️'; }
.dsh-pm-stage-panel[data-stage="accepting"] .dsh-pm-stage-label::before { content: '🧪'; }
.dsh-pm-stage-panel[data-stage="done"] .dsh-pm-stage-label::before { content: '🎉'; }
.dsh-pm-stage-panel[data-stage="archived"] .dsh-pm-stage-label::before { content: '📦'; }
.dsh-pm-stage-skipped-badge {
  font-size: 11px; padding: 1px 9px; border-radius: var(--pm-radius-pill);
  color: var(--pm-c-archived); background: rgba(108,117,125,.14);
  border: 1px dashed rgba(108,117,125,.45);
}
/* v4: plain text flow, no box */
.dsh-pm-sn-body { display: flex; flex-direction: column; gap: 2px; }
.dsh-pm-stage-body-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--dsw-text-primary, #222); }
.dsh-pm-stage-desc { font-size: 13px; line-height: 1.7; color: var(--dsw-text-secondary, #555); white-space: pre-wrap; }
.dsh-pm-stage-meta { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-stage-category {
  align-self: flex-start;
  font-size: 11px; padding: 1px 8px; border-radius: var(--pm-radius-pill);
  background: rgba(74,125,255,.12); color: #2f5fd0;
}
.dsh-pm-stage-field { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-pm-stage-tasks { display: flex; flex-direction: column; gap: 6px; }
.dsh-pm-stage-comments { display: flex; flex-direction: column; gap: 6px; }
.dsh-pm-confirm-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: var(--pm-radius-sm);
  background: rgba(240,160,32,.12); border: 1px solid rgba(240,160,32,.4);
  color: var(--pm-c-warn); font-size: 12px; font-weight: 500;
}

/* 产物区（必备产物缺失 = 红；已登记 = 中性卡） */
.dsh-pm-artifacts-section { display: flex; flex-direction: column; gap: 6px; }
.dsh-pm-artifacts-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dsh-pm-artifacts-summary { font-size: 12px; font-weight: 600; color: var(--dsw-text-secondary, #888); }
.dsh-pm-artifacts-summary.is-warning { color: var(--pm-c-danger); }
.dsh-pm-artifacts-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dsh-pm-artifacts-empty {
  padding: 10px 12px; text-align: center; font-size: 12px;
  color: var(--dsw-text-secondary, #999); background: var(--pm-bg-soft);
  border: 1px dashed var(--pm-line); border-radius: var(--pm-radius-sm);
}
.dsh-pm-artifact-item {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 10px; border-radius: var(--pm-radius-sm);
  background: var(--pm-bg-soft); border: 1px solid transparent;
  font-size: 12px;
}
.dsh-pm-artifact-item.is-missing {
  background: rgba(220,53,69,.07); border-color: rgba(220,53,69,.32);
}
.dsh-pm-artifact-kind { font-size: 11px; color: var(--dsw-text-secondary, #888); min-width: 64px; flex: none; }
.dsh-pm-artifact-path {
  flex: 1; min-width: 0; text-align: left;
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
  color: var(--dsw-accent, #4a7dff); background: rgba(128,128,128,.10);
  border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer;
  word-break: break-all;
}
.dsh-pm-artifact-path:hover { background: rgba(74,125,255,.14); text-decoration: underline; }
.dsh-pm-artifact-badge { font-size: 10px; padding: 1px 7px; border-radius: var(--pm-radius-pill); flex: none; }
.dsh-pm-artifact-badge.confirmed { background: rgba(40,167,69,.14); color: #1e7e34; }
.dsh-pm-artifact-badge.pending { background: rgba(240,160,32,.18); color: var(--pm-c-warn); }
.dsh-pm-artifact-meta {
  font-size: 11px; color: var(--dsw-text-secondary, #999);
  margin-left: auto; font-variant-numeric: tabular-nums;
}
.dsh-pm-artifact-missing {
  font-size: 11px; font-weight: 600; padding: 1px 7px;
  border-radius: var(--pm-radius-pill);
  background: rgba(220,53,69,.14); color: var(--pm-c-danger);
}
.dsh-pm-doc-link {
  display: inline-flex; align-items: center; gap: 4px; align-self: flex-start;
  height: var(--pm-btn-h-sm); padding: 0 10px;
  border: 1px solid rgba(74,125,255,.35); border-radius: var(--pm-radius-sm);
  background: rgba(74,125,255,.08); color: var(--dsw-accent, #4a7dff);
  font: inherit; font-size: 12px; line-height: 1; cursor: pointer;
}
.dsh-pm-doc-link:hover { background: rgba(74,125,255,.16); }

/* ---- 运行中指示（REQ-261004210128-283d FR-3/FR-4/FR-7）：泳道卡与列表行共用一个渲染单点 ---- */
/* 语义与左侧会话列表的运行中圆点一致：淡轨 + 呼吸弧，1.5s 一圈；颜色走 currentColor，随主题。
   位置（2026-10-04 用户裁定）：**泳道卡与列表行都紧跟项目 ID**——项目级信号挂在项目标识上。 */
.dsh-pm-running {
  display: inline-flex; align-items: center; justify-content: center;
  width: 13px; height: 13px; flex: none; margin: 0 3px;
  color: var(--dsw-accent, #4a7dff);
  vertical-align: -2px;
}
.dsh-pm-running-svg { display: block; animation: dsh-pm-running-spin 1.5s linear infinite; transform-origin: center; }
.dsh-pm-running-track,
.dsh-pm-running-arc { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.dsh-pm-running-track { opacity: .25; }
.dsh-pm-running-arc { stroke-dasharray: 12 40; animation: dsh-pm-running-dash 1.5s ease-in-out infinite; }
@keyframes dsh-pm-running-spin { to { transform: rotate(360deg); } }
@keyframes dsh-pm-running-dash {
  0% { stroke-dasharray: 12 40; stroke-dashoffset: 0; }
  50% { stroke-dasharray: 24 40; stroke-dashoffset: -6; }
  100% { stroke-dasharray: 12 40; stroke-dashoffset: 0; }
}
/* 尊重「减少动态效果」：不旋转，保留静态半环（语义不丢） */
@media (prefers-reduced-motion: reduce) {
  .dsh-pm-running-svg, .dsh-pm-running-arc { animation: none; }
  .dsh-pm-running-arc { stroke-dasharray: 18 40; stroke-dashoffset: -3; }
}

/* ---- 需求卡片高亮动画（跳转定位时使用；REQ-f0579a t5 从 base.ts 移入：base 超 400 行门禁） ---- */
@keyframes highlight-flash {
  0% { box-shadow: 0 0 0 0 rgba(74,125,255,.6); }
  50% { box-shadow: 0 0 20px 4px rgba(74,125,255,.4); }
  100% { box-shadow: 0 0 0 0 rgba(74,125,255,0); }
}
.dsh-pm-card.highlight-flash {
  animation: highlight-flash 2s ease-out;
}
`
