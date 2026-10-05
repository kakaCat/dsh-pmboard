# t-fbfb6d 回合收尾只认一个解析器·联调

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
回合收尾只认一个解析器·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T01:27:55.415Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

联调段：三种异常形态逐一验，结论必须一致。

### 完成项

- aborted:upstream-idle / error:ETIMEDOUT:stream idle 3m / interrupted → 都是"停下等人"，reason 为规范化原文
- 非异常形态（completed/blocked）不改任何状态
- 缺 reason 的未知形态零写入

### 改动文件

- `src/application/dive/round-driver.ts`
- `src/application/internal/interruption.ts`
- `tests/dive-round-driver.test.ts`

---
