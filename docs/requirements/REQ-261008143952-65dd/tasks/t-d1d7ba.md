# t-d1d7ba 更新三处测试引用·研发

> 需求：REQ-261008143952-65dd 更新 vendor superpowers 分片到本地最新版

## 在做什么
更新三处测试引用·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/prompt-tiers.test.ts tests/stage-prompts.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-08T10:43:34.574Z，窗口 session-d7422892-bcde-406a-a95e-3c0868cdd93c）

三处测试引用已换为 v6.4.2 实有内容，选词经 light 侧零命中验证，77 条断言全绿。

### 完成项

- ① prompt-tiers HEAVY_ONLY.implementing 换为 The Task Loop 与 Common Rationalizations
- ② prompt-tiers ATTRIBUTION 断言由 v6.3.0/b36e0829 换为 v6.4.2/8ca22dba
- ③ stage-prompts HEAVY_ELEMENTS.implementing 换同一对新关键词
- 选词实测：三个候选在 heavy 命中 1，在 light/light-overrides/heavy-overrides/iron-rules 全部 0 命中
- 验收：prompt-tiers 39 + stage-prompts 38 = 77 passed 全绿
- 残留检查：旧串仅剩于待重刷的基线快照，属 t7

### 改动文件

- `tests/prompt-tiers.test.ts`
- `tests/stage-prompts.test.ts`

### 下一步

t7 重刷基线快照后 residual 旧串清零。

---
