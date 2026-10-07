# t-5cfbd1 领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板·联调

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-06T12:59:09.746Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

联调段通过：域层 11 个导出与设计逐条一致，四处行为样例与期望响应相符，无偏离。

### 完成项

- 导出签名 11/11 与 design/interfaces.md 声明一致：三条词表 RegExp、三个谓词函数、reworkSpecFor、dispositionMissingItems、isFullyDecided、sheetGateStatus、applyVerdicts
- 行为契约逐一符合期望：无锚点通过 ⇒ unverified；有锚点通过 ⇒ passed；系统项处置无效 ⇒ code=system_item_disposition_required；零锚点项返工 ⇒ acceptanceSource=synthesized
- 三类词表齐全且非空、reworkSpecFor 返回带 acceptanceSource、放行判据仍为单一函数出口（检查脚本 exit 0）
- 本卡无 HTTP 面（纯域层），联调即以 design/interfaces.md 的域层签名为对端

### 下一步

进入 t3 复核段：对照 design 逐条核对四条判据的实现与边界

---
