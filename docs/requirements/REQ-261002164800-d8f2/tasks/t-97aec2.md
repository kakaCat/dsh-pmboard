# t-97aec2 迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归·测试

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T09:30:44.933Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

测试段：三条基线命令实测通过、8 个新用例文件 56 条全绿，证据已落 notes

### 完成项

- npx vitest run tests/reqboard/legacy-refs-compat.test.ts → 5 passed
- npx vitest run（全量）→ 99 failed / 3240 passed / 20 skipped，≤ 基线 106
- npx tsc --noEmit → 189 个错误，≤ 基线 223；本需求改动文件零错误
- pnpm build → 退出码 0（host dist/ + client lib/client.js；[verify-client] OK）
- 本需求 8 个新用例文件共 56 条全绿（逐文件条数见 notes/t8-baseline-evidence.md）

### 下一步

父卡结单；随后整个需求的实施链完成，可交验收

---
