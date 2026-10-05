# t-f235aa 回合收尾只认一个解析器·复核

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
回合收尾只认一个解析器·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T01:27:55.726Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

复核段：确认修掉的是真问题——error 与 interrupted 此前被静默忽略。

### 完成项

- 修前只认 max-tokens 与 aborted：上游流超时（error:*）与崩溃孤儿回合（interrupted）被静默吞掉，Dive 以为回合还在跑
- 解析器不新增分支、不重写语义，只做"调用同源"

### 改动文件

- `src/application/dive/round-driver.ts`
- `src/application/internal/interruption.ts`
- `tests/dive-round-driver.test.ts`

---
