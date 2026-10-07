# t-e3ebb1 裁决侧写降级原因并在人工自填无锚点时拒绝·联调

> 需求：REQ-261007160829-1991 修复：needsHuman 验收项经弹框永远无法通过（多问只渲染第一问）

## 在做什么
裁决侧写降级原因并在人工自填无锚点时拒绝·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/verdict-human-anchor-reject.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T08:51:26.396Z，窗口 session-38ae86c9-f5e0-4468-b77d-d9426842eebe）

联调段：核两条通道消费方与错误码落点，并用隔离副本验证兼容性。

### 完成项

- 核消费方：弹框 AcceptSheet 捕获域错误后按 code 回执，文案精准可执行
- 核 HTTP 路径：verdicts.ts 既有映射把域 invalid_input 重打为 opinion_required（已记入文档的传输面差异）
- 隔离副本验证：引用 applyVerdicts/AcceptanceSheetSpec 的 31 个测试文件 306 passed 退出码 0
- 真实仓库当前 9 条红已归因并发兄弟卡（提交侧拒绝门半成品），非本卡

### 下一步

复核段：读实现逐条对 S-2 与 I-4。

---
