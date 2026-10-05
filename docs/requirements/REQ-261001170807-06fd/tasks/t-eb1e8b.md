# t-eb1e8b 复现：把两个缺陷写成红的用例·研发

> 需求：REQ-261001170807-06fd 节流不再惩罚正常收尾 + 子卡验收标准自带可跑命令

## 在做什么
复现：把两个缺陷写成红的用例·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

`npx vitest run tests/e2e-close-chain.test.ts` → 全绿；并附 `git diff --stat tests/` 摘要

## 汇报 1（2026-10-01T09:24:15.594Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

把两个缺陷写成会失败的用例：父子链收尾被节流（A1 红）+ 各阶段验收标准缺可执行锚点（红）。

### 完成项

- 红用例与证据落盘
- 红线断言（兄弟卡/跨卡）就位

### 改动文件

- `tests/e2e-close-chain.test.ts`
- `tests/subtask-template-acceptance.test.ts`
- `docs/requirements/REQ-261001170807-06fd/evidence/repro-red.txt`

### 下一步

父卡收尾

---
