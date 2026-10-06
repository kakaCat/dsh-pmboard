# t-191beb 驱动放弃本拍的有界留痕（[WAKE-SKIP]）·研发

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
驱动放弃本拍的有界留痕（[WAKE-SKIP]）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T09:56:13.813Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

驱动三处放弃点接上有界留痕：同 (需求,原因) 60 秒冷却，只进诊断面不写台账；新逻辑落小模块，round-driver 只加 3 处调用。

### 完成项

- 新建 src/application/dive/wake-skip-trace.ts：createWakeSkipTracer（注入 now / emit / cooldownMs）
- 留痕行文 = [WAKE-SKIP] reason=… req=… status=…（reason 为受控闭集三值）
- round-driver.ts 三处放弃点接线：不可驱动（两处判定）、弹框在途、人工门开着
- 冷却 key = 需求 + 原因 ⇒ 异因、异需求互不影响；判据用严格小于
- 落痕通道抛错不外溢（永不抛，诊断面不挡驱动）
- 新建 tests/wake-skip-trace.test.ts：8 例，固定时钟

### 改动文件

- `src/application/dive/wake-skip-trace.ts`
- `src/application/dive/round-driver.ts`
- `tests/wake-skip-trace.test.ts`

### 下一步

联调段：核接线面与判据零变化

---
## 汇报 2（2026-10-06T09:56:30.269Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

补记研发段验收要求的 git diff --stat 摘要，并标明 round-driver.ts 的统计含并发窗口 WIP。

### 完成项

- git diff --stat 摘要：src/application/dive/round-driver.ts 61 增 7 删（含别窗口 WIP，该文件在本卡开工前已是 M）
- 本卡净增约 15 行：2 处 import、1 处实例化、3 处调用（含把 2 处单行 if 展开为带留痕的分支）
- 新增文件：src/application/dive/wake-skip-trace.ts（70 行）、tests/wake-skip-trace.test.ts（123 行）
- 读数边界：round-driver.ts 现 819 行，属尺寸门禁基线在册的存量超限文件；本卡把逻辑放小模块，只在该文件留调用点

### 下一步

（补充读数，研发段已关单）

---
