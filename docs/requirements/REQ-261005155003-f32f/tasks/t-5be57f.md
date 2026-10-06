# t-5be57f 出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）·研发

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T14:41:19.836Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

研发段：出图脚本改指 v3，四段漂移按五类已声明偏差抹平，原型壳与基座 CSS 重内联

### 完成项

- PROTO 改指 detail-ui-v3.html；v2 引用归零（grep 2 / 0）
- 漂移核对重写：head/band/panel/tabs 四段全比，判据为抹平五类已声明偏差后逐字节相同，逐类命中数打进日志
- 五类偏差：图标 emoji→SVG、ARIA 与稳定 id、操作条分组标签删除、后果节点改 sr-only、窗口组归属位移；另加 FR-13 评论框删除
- FR-11 与 FR-13 落成逐节点断言（打印少的节点与 sr-only 文本）
- v3 两态壳按当前 buildReportShell 输出重新内联；基座 CSS 换成 src/ 的 13 片真实拼接
- K8 处置：删掉拿 ?v=current 当改前基线的断言；两张表的改前列改标为人给的历史快照
- 新增浅色岛 sha256 硬断言（同 v 下 dark 与浅色两档 PNG 逐字节相同）
- proto-geometry 刷新为 81 条，与 after 图同一次运行产出

### 改动文件

- `scripts/req-detail-ui-prototype-shot.mts`
- `docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html`
- `docs/requirements/REQ-261005155003-f32f/evidence/style-variety-before-after.txt`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-after-1280-inflight.png`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-after-900-inflight.png`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-after-1280-terminal.png`

### 下一步

复核段：独立复跑并核对四段漂移与 sha256

---
