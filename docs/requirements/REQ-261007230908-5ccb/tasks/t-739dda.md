# t-739dda G5 补全四工具 prompt 错误码清单·联调

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
G5 补全四工具 prompt 错误码清单·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T15:56:46.849Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t6 联调核验：纯文案改动无接口面，工具派发与注入面契约套件全绿

### 完成项

- 本卡只改文案（prompt 常量字符串），无接口/协议变化，无新增联调面
- 接线凭证：tools-dispatch / output-contract / apply-wiring / prompt-baseline / submit-prompt-budget 五套件全绿（schema 与注入面未受影响）

### 下一步

复核段

---
