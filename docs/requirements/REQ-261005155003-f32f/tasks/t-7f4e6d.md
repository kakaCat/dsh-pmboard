# t-7f4e6d 状态不靠颜色单一表达（真实文本／aria-hidden SVG）·研发

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
状态不靠颜色单一表达（真实文本／aria-hidden SVG）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T14:24:27.938Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

研发段：阶段条三态与缺口严重度都补上真实文本标记，emoji 圆点换内联 SVG

### 完成项

- stage-detail.ts 的 buildProgressDots：完成态前缀 ✓、当前态前缀 ▸、未开始不带（真实文本节点，非 ::before）
- 容器加 data-stage-state 机器可读标记（completed/current/todo）
- report-band.ts：emoji 圆点换 GAP_DOT_SVG（aria-hidden、currentColor）+ 真实文本标记 !! / ! / ·
- 严重度颜色只给标记上色不给正文上色（red/yellow/gray 三档按对比度核过）
- styles/report.ts：圆点尺寸走 --pm-icon-sm，标记用等宽 11px；新增 --pm-icon / --pm-icon-sm 两档令牌
- 验收结论三态按原型裁定**不加**符号（原型 FR-8 明写它已有可见文字，为统一而制造改动是错的方向）

### 改动文件

- `src/client/views/stage-detail.ts`
- `src/client/views/report-band.ts`
- `src/client/styles/report.ts`

### 下一步

复核段：grep emoji 归零与三态标记独立复算

---
