/**
 * 原型骨架**正文**（REQ-261005105032-3b02 t11 · 数据面）——与 `templates/brainstorming/prototype.html`
 * **逐字节一致**，由 `tests/prototype-skeleton.test.ts` 锁死。
 *
 * 为什么是"这里再放一份"而不是运行时读模板：application 层禁 `import node:`，也没有"读包内模板"
 * 的端口；而会话工作区不保证有 `templates/`，运行时去读会静默降级成"没有骨架"——那正是本卡要消灭的
 * 死结（门禁拦人，模板却给不出来）。故人读的那一份留在 `templates/`（门禁 how 文案指向它），
 * 落盘的那一份在这里；两份不同源必然漂移，同步器就是那条逐字节断言。
 *
 * 为什么骨架正文**不放进** `prototype-skeleton.ts`：逻辑模块有 ≤120 行的尺寸约束，
 * 把 50 行 HTML 正文塞进去，注释与判据就没地方写了——数据与编排分离是这张卡的既定取舍。
 *
 * @module dsh-pmboard/application/internal/prototype-skeleton-template
 */

/** 原型 HTML 骨架（占位符 `{{TITLE}}` / `{{REQ_ID}}` / `{{DATE}}` 由落盘侧渲染）。 */
export const PROTOTYPE_HTML_SKELETON = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} · 原型（{{REQ_ID}}）</title>
<!--
  原型骨架（templates/brainstorming/prototype.html；自 design/ 迁入，旧路径不留）。
  落点：进入需求阶段时幂等落盘到 docs/requirements/<REQ>/prototypes/<name>.html（已存在就不覆盖）。
  用途：需求阶段的**原型**产物；requirement.md 的功能点表与 design/frontend.md 引用本文件的锚点区块。
  纪律：这是**原型**不是交付物——样式从简、重点是结构与交互路径；换正式视觉稿时旧稿标 superseded、不删文件。
  ── prototypes/INDEX.md 骨架（四列逐字：路径 | 状态 | 服务条款 | 被取代于）──
  权威版本**恰好一条**（0 条 / 多条 = prototype_version_conflict）；作废版本标 superseded，并在
  「被取代于」列写权威路径。真实文件里是 Markdown 表格，形如：
    路径                       | 状态          | 服务条款 | 被取代于
    prototypes/detail.html     | authoritative | FR-1     |
    prototypes/detail-v1.html  | superseded    | FR-1     | prototypes/detail.html
  登记侧只校验不改写本表（清单内容由 agent 手写）。
-->
<style>
body{font-family:-apple-system,"PingFang SC",sans-serif;margin:0;background:#f5f6f8;color:#24292f}
header{background:#1f2328;color:#fff;padding:12px 20px;font-size:14px}header .req{opacity:.7;margin-left:8px}
.fr{background:#fff;margin:16px auto;max-width:860px;border:1px solid #d0d7de;border-radius:8px;padding:20px}
.fr h2{margin:0 0 4px;font-size:16px}.meta{color:#57606a;font-size:12px;margin-bottom:12px}
.mock{border:1px dashed #8c959f;border-radius:6px;min-height:160px;display:flex;align-items:center;justify-content:center;color:#57606a}
.flow{font-size:13px;color:#57606a;margin-top:12px}
</style>
</head>
<body>
<header><strong>{{TITLE}}</strong><span class="req">{{REQ_ID}} · 原型 v0.1 · {{DATE}}</span></header>

<!-- 权威版本标记位（页内对照；权威判定以 prototypes/INDEX.md 为准）：本文件 = INDEX「状态」列唯一那条 authoritative 的路径；被取代时把本行改成 superseded，并在 INDEX「被取代于」列写权威路径。 -->

<!-- 每个功能点（FR）一个 <section class="fr" id="FR-N"> 区块，编号与 requirement.md 的功能点同号；区块须覆盖 INDEX「服务条款」列声明的**全部** FR（缺一条 = prototype_anchor_missing）。下面 FR-1 是示例区块：按功能点数量照抄改号。 -->
<section class="fr" id="FR-1">
  <h2>FR-1 （功能点名）</h2>
  <div class="meta">优先级 P0 · 状态：草图</div>
  <div class="mock">（界面草图区：布局结构 / 关键控件 / 占位图）</div>
  <div class="flow">交互路径：1. 触发 → 2. 动作 → 3. 反馈（分支：若…则…）</div>
</section>

<!-- geometry 观测量块（proto-geometry）：**恰好一块**（0 块 / 多块 = prototype_anchor_missing）。
     形状见 design/data-model.md §3.1：只放观测量名 + 实测值 + 测量条件（unit ∈ px | count | ratio；
     at.state ∈ inflight | terminal；窗口宽须显式写，漏传会量错）；禁止阈值字段（D-10：threshold / max /
     min / limit / expected / tolerance / upper / lower / range / budget / target / pass / fail）；
     人给值时加 "source":"human"。下面这行是**样例值**：换成本需求的实测值，不足一条就复制成多条。 -->
<!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->

</body>
</html>
`

/**
 * `prototypes/INDEX.md` 骨架：四列表格逐字（路径 | 状态 | 服务条款 | 被取代于）。
 * 只给**一条** `authoritative` 行（I1「恰好一条」的写法示例），作废版本怎么写见模板注释。
 */
export function prototypeIndexSkeleton(name: string): string {
  return [
    '# 原型清单（{{REQ_ID}}）· {{DATE}}',
    '',
    '> 权威版本**恰好一条**（0 条 / 多条 = `prototype_version_conflict`）；作废版本标 `superseded`，',
    '> 并在「被取代于」列写权威版本的路径。维护纪律：本表由 agent 手写，登记侧只校验不改写。',
    '',
    '| 路径 | 状态 | 服务条款 | 被取代于 |',
    '|---|---|---|---|',
    '| prototypes/' + name + ' | authoritative | FR-1 | |',
  ].join('\n')
}
