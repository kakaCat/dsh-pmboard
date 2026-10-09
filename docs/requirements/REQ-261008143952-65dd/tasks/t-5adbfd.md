# t-5adbfd 重跑生成器产出 generated/fragments.ts·研发

> 需求：REQ-261008143952-65dd 更新 vendor superpowers 分片到本地最新版

## 在做什么
重跑生成器产出 generated/fragments.ts·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-08T10:40:54.105Z，窗口 session-d7422892-bcde-406a-a95e-3c0868cdd93c）

重跑生成器产物：129 条记录守恒，implementing/heavy 内联文本升至 20405 字节，门禁 OK 且幂等；并更正了设计里 126 的错误基数。

### 完成项

- 重跑 node scripts/inline-prompt-fragments.mjs：wrote generated/fragments.ts (129 fragments, 84289 bytes)
- 验收②：node scripts/check-prompt-fragments.mjs → OK 且 exit 0
- 验收③：连跑两次产物 sha256 相同（b92d064d…），幂等成立
- 产物核对：implementing/heavy 的 text 由 2305 变 20405 字节，与盘上 heavy.md 逐字节一致
- 重要更正：真实分片基数为 129 条（非设计与计划里写的 126），HEAD 基线亦为 129，条数守恒成立
- 已同步更正 requirement/design 与 decomposition 共 17 处错误数字，并补齐构成表（含 heavy-extra 1、overrides 7、iron-rules 1）

### 改动文件

- `src/domain/prompt/generated/fragments.ts`
- `docs/requirements/REQ-261008143952-65dd/decomposition.md`
- `docs/requirements/REQ-261008143952-65dd/design/architecture.md`
- `docs/requirements/REQ-261008143952-65dd/design/data-model.md`
- `docs/requirements/REQ-261008143952-65dd/design/interfaces.md`
- `docs/requirements/REQ-261008143952-65dd/design/backend.md`
- `docs/requirements/REQ-261008143952-65dd/design/use-cases.md`

### 下一步

t6 更新测试关键词与 ATTRIBUTION 断言、t7 重刷基线；随后 t8 全量回归。

---
