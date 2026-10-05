# 测试证据（REQ-261002115204-ba52 · 2026-10-02）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0；类型检查 tsc（`npx tsc --noEmit`）
- **无 commit 可指**：本工作区在本需求开始前就带有大量未提交的在途改动（含旧需求窗口落地的本次实现），
  故一律采用「改动前后基线对比」口径——基线见 `notes/baseline-2026-10-02.md`。
- 宿主加载的是 `dist/index.mjs`；本次已 `pnpm build`（11:58:29）且产物含新文本 ⇒ 重启宿主即生效。

## 跑了什么

```
npx vitest run tests/arg-guidance.test.ts
npx vitest run --reporter=dot                 # 全量回归
npx tsc --noEmit                              # 类型
node scripts/inline-prompt-fragments.mjs      # C-16 重生成
node scripts/check-prompt-fragments.mjs       # C-17 校验
pnpm build                                    # 产物
```

## 结果摘要

| 命令 | 基线（开工前） | 本次 | 判定 |
|---|---|---|---|
| 定向（本需求新增文件） | 文件不存在（`No test files found`, exit 1） | `Test Files 1 passed (1)`；`Tests 10 passed (10)` | ✅ 全绿（含改前必红前提） |
| 全量 `vitest run --reporter=dot` | 49 failed / 250 passed / 3 skipped（302 文件）；98 failed / 2991 passed / 20 skipped（3109 用例） | 49 failed / 251 passed / 3 skipped（303 文件）；98 failed / 3001 passed / 20 skipped（3119 用例） | ✅ 失败集合**逐一对齐**、零新增；通过数 +10（新增文件） |
| `tsc --noEmit` | 197 行报错 | 194 行报错；**改动清单过滤 → 0 命中** | ✅ 改动文件零新增（存量 2 条在 `RunStatusTool` / `StatusTool`，不在清单内） |
| C-16 | — | exit 0（128 fragments / 72574 bytes） | ✅ |
| C-17 | — | exit 0（片段↔产物一致；heavy.md ↔ vendor 逐字节一致） | ✅；反向：改一处产物 → 非零退出（expected 72574 / actual 72576） |
| `pnpm build` | — | exit 0（`[verify-client] OK`，bundle=335555 bytes） | ✅ |

## 覆盖与对照（FR ↔ 用例 ↔ 卡）

> 卡↔测试标注（`covers: t-xxx`，测试覆盖度门禁据此对账）：
> `covers: t-47b23e, t-6dbcb4, t-44849a`（t1 契约卡：常量 + 清单 + 断言助手）
> `covers: t-1b9c19, t-40bbc6, t-80d28a`（t2 报告工具描述）
> `covers: t-63e7b2, t-cc4e2b, t-80be1b`（t3 同类 7 工具 + 遍历覆盖用例）
> `covers: t-c7a5e7, t-f71cd6, t-f3878a`（t4 实施片段 + C-16/C-17）
> `covers: t-9d0b25, t-17f489, t-c89eb2, t-ea0f5b`（t5 零变更核验 + 全量回归 + 回滚演练）

| 验收标准 | 用例 | 对应测试 | 结果 |
|---|---|---|---|
| FR-1 报告工具入参写清怎么写 | TC-1b | `TASK_REPORT_PROMPT` 与 summary/completed/next_step 三处说明命中三锚点 | ✅ |
| FR-1 零行为变更 | TC-5 | 参数字段集合 / 必填集合 / 返回体 7 键与基线一致 | ✅ |
| FR-2 约定收敛一处 + 覆盖面 | TC-1 / TC-2 / TC-4 | 常量三锚点与 ≤120 字；清单 15 条逐项命中；未接约定必判缺 | ✅ |
| FR-3 实施片段纪律 | C-16 / C-17 + `tests/prompt-tiers.test.ts` | 两处片段落点在场；产物一致；轻档 40 passed（≤2500 字符） | ✅ |
| 兼容卡：回滚路径 | 演练 | 常量还原为旧形态 → 6 failed / 4 passed；还原 → 10 passed | ✅ |
| 兼容卡：构建生效 | `pnpm build` + grep | `dist/index.mjs` 命中「拆成多次调用」×2、「汇报自检」×2 | ✅ |

## 失败与未跑项（如实列出）

1. **数字口径偏差 3 处**（详见 `notes/t5-verification-evidence.md` 第二节）：`dist` 命中 ×2 非 ×3、
   `generated/fragments.ts` 命中 ×2 且 72574 bytes 非 72702、`tsc` 194 非 197。均为**旧记录文本**与本次实测的差异，
   不改变「零变更」「产物含新文本」「用例守覆盖」三条实质结论。
2. **全量回归的 49 文件 / 98 用例失败为存量**（含 `tests/application/repository.test.ts` 的 id 格式断言、
   `confirm-settle-plan-persist` / `auto-chain-approval` 等落库面失败），与本次文本改动无因果；本需求只承诺**不新增**。
3. **未跑**：宿主重启后的端到端实机复验（需人工重启 DSH 后进行）。已提供可复核替代证据：构建产物 grep 命中。
4. **1 处设计落点偏离**（`implementing/light.md` 未加，受 2500 字符预算），见 `reviews/self-review.md` 问题 #1。

## 复核方式

```bash
npx vitest run tests/arg-guidance.test.ts
npx vitest run --reporter=dot | tail -3
npx tsc --noEmit | grep -c 'error TS'
node scripts/check-prompt-fragments.mjs
grep -c '拆成多次调用' dist/index.mjs
```
