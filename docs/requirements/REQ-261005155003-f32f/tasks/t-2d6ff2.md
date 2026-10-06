# t-2d6ff2 出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）·复核

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T14:41:31.565Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

复核段：出图脚本独立复跑通过，原型与探针读数逐项相同，两处未核实项已登记

### 完成项

- 独立复跑 npx tsx scripts/req-detail-ui-prototype-shot.mts：退出码 0（连跑三次产物逐字节一致）
- grep 独立复核：detail-ui-v3.html 命中 2 处、detail-ui-v2.html 命中 0 处
- 四段漂移核对独立核对：head/band/panel/tabs 全在，抹平五类后逐字节相同，逐类命中数打进日志
- FR-11 逐节点断言输出复核：分组标签 0、sr-only 后果文本等于服务端 consequence、被删的常驻后果节点逐一点名
- 浅色岛 sha256 复核：ui-after-1280-inflight.png 与 -dark.png 同为 7641a105…9c6
- proto-geometry 复核：81 条、unit 仅 px/count/ratio、无阈值字段
- 交叉核对（关键）：渲染探针独立跑的 tabsTop 497/527/437/441 与原型量到的 497/527/437 逐项相同——证明重内联没有走样
- 无偏离；两处如实登记：① 锚点门/几何门未通过台账实跑（只按代码读判据 + grep 自查）；② 真机深色主题与读屏的人工确认未做

### 下一步

测试段

---
