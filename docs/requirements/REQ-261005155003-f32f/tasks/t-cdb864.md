# t-cdb864 状态不靠颜色单一表达（真实文本／aria-hidden SVG）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
状态不靠颜色单一表达（真实文本／aria-hidden SVG）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
① 渲染断言：阶段条三态与结论三态各自元素内存在文本节点或 svg 子节点；标记若实现为 CSS ::before content 则判红；② `grep -c -e '🔴' -e '🟡' -e '⚪' src/client/views/report-band.ts` = 0，且三档 severity 各带对应文本标记（!! / ! / ·）与 aria-hidden 的 SVG 圆；③ 灰度人工评审：探针注入 filter:grayscale(1) 后出图（1280 档在途 + 终态），人工核对阶段/缺口/结论三处仍可区分，截图落 docs/requirements/REQ-261005155003-f32f/evidence/；④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-8（1280 档 · 在途，--window-size=1280,800）实测阶段条 completed=✓ / current=▸；原型用 ::before，本卡必须落成真实节点，差异逐条说明。⑤ `pnpm build:client` 含 [verify-client] OK。

## 实施方案（implementation）
① 改 src/client/views/stage-detail.ts 的 buildProgressDots（:30-35）：完成态加真实文本前缀 ✓、当前态加 ▸、未开始不带；② 改 src/client/views/report-band.ts：GAP_DOT（:25 的 emoji 圆点）改用 GAP_DOT_SVG（aria-hidden 的 currentColor 圆），并在 .dsh-pm-gap-what 内加真实文本标记 !! / ! / ·（不是 ::before；全文仍进 title）；③ 验收结论三态（pass/rework/pending）加字形符号 ✓ / ↺ / …（文本级元素，配可见文字或 aria-label）；④ 已达标的状态芯片（本身已有文字）不动；⑤ src/client/styles/report.ts 给 GAP_DOT_SVG 配尺寸与颜色（--pm-icon-sm、currentColor）。

## 上游产出摘要（dependsSummary）
- 落地浅色岛令牌块并移除宿主深色覆盖

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T14:28:02.524Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

父卡收尾：FR-8 非颜色标记落地（真实文本 + aria-hidden SVG），灰度图可辨

### 完成项

- 阶段条三态加真实文本标记：完成 ✓、当前 ▸、未开始不带（容器带 data-stage-state 机器可读）
- 缺口条：emoji 圆点换 aria-hidden 的内联 SVG 圆 + 真实文本标记 !! / ! / ·
- 严重度颜色只给标记上色不给正文上色；三色按对比度核过
- 灰度评审出图已落 evidence/ui-gray-1280-inflight.png 与 ui-gray-1280-terminal.png，人眼确认三态仍可区分
- 三张子卡（t-7f4e6d / t-a0c771 / t-707b9d）全部 done
- 按权威原型 FR-8 的裁定：验收结论三态不加符号（它已有可见文字结论），该差异已登记

### 改动文件

- `src/client/views/stage-detail.ts`
- `src/client/views/report-band.ts`
- `src/client/styles/report.ts`
- `scripts/req-detail-ui-grayscale-shot.mts`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-gray-1280-inflight.png`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-gray-1280-terminal.png`

### 下一步

解锁 t-5c0373（探针断言组）

---
