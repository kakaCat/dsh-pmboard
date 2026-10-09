# t-1acef2 diag-log 改为无 I/O 门面并把文件实现落到适配层·研发

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
diag-log 改为无 I/O 门面并把文件实现落到适配层·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/dive-wake-wiring.test.ts tests/reqboard/degraded-startup.test.ts tests/layer-boundary.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T18:42:34.760Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

研发段完成：diag-log 门面化 + FileDiagSink 落盘，越界 7→5，日志用例 21 用例全绿。

### 完成项

- diag-log 变无 I/O 门面：initCaptureDiag(sink) / captureDiag(message) / CAPTURE_DIAG_REL 保留，node: 导入 0
- 新增 adapters/FileDiagSink：512KB 轮转为 .1 + append + 全静默（形状与搬迁前逐字一致）
- 组合根与 2 份测试改吃 sink 实例；5 个 application 消费文件的 captureDiag 调用点一字未改
- 验收：2 份用例 21 用例全绿；越界条数 7 → 5

### 改动文件

- `src/application/internal/diag-log.ts`
- `src/adapters/FileDiagSink.ts`
- `src/index.ts`
- `tests/dive-wake-wiring.test.ts`
- `tests/reqboard/degraded-startup.test.ts`

### 下一步

联调段

---
