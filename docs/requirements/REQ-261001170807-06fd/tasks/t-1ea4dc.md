# t-1ea4dc 修复：节流判据排除本卡自己的子卡·修复

> 需求：REQ-261001170807-06fd 节流不再惩罚正常收尾 + 子卡验收标准自带可跑命令

## 在做什么
修复：节流判据排除本卡自己的子卡·修复

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

`npx vitest run tests/e2e-close-chain.test.ts tests/domain/done-evidence.test.ts` → 全绿

## 汇报 1（2026-10-01T09:26:10.152Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

t2·fix：节流判据加归属排除后，已由用例锁住"本卡子卡不上弦、兄弟卡/跨卡仍上弦"。

### 完成项

- 判据改动落盘
- 单测 6/6 绿
- dist 重建

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`
- `tests/e2e-close-chain.test.ts`

### 下一步

父卡收尾

---
