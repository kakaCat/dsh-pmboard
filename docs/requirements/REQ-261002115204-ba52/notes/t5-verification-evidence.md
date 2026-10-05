# t5 证据复跑记录（零变更核验 + 全量回归 + 回滚演练）

> 需求：REQ-261002115204-ba52 ｜ 卡：t-9d0b25（子卡 t-17f489 / t-c89eb2 / t-ea0f5b）
> 复跑时间：2026-10-02 11:57–11:59（Asia/Shanghai）｜ 窗口：session-06ef20c5
> 对照基线：`notes/baseline-2026-10-02.md`（开工前 49 文件 / 98 用例失败；tsc 197）

## 一、命令与结果

| # | 命令 | 结果 | 与基线对照 |
|---|---|---|---|
| 1 | `npx vitest run tests/arg-guidance.test.ts` | **10 passed**（TC-1 / 1b / 2 / 4 / 5 + 两条反向） | 新增文件，基线为 0（改前必红） |
| 2 | `npx vitest run --reporter=dot` | **49 failed / 251 passed / 3 skipped（303 文件）**；**98 failed / 3001 passed / 20 skipped（3119 用例）**，27.9s | 失败集合**逐一对齐**（49 文件 / 98 用例）；通过数 2991 → **3001**（+10 = 本次新增用例） |
| 3 | `npx tsc --noEmit` | 报错行数 **194**（基线 197）；**本次改动的 14 个文件**在输出里 **0 命中** | 口径按「改动文件零新增」；`src/tools/**` 下仍有 2 条**存量**错误（`RunStatusTool/RunStatusTool.ts:122`、`StatusTool/StatusTool.ts:13`，二者不在改动清单内） |
| 4 | 回滚演练（常量还原为旧形态） | **6 failed / 4 passed**；还原后 **10 passed** | 证明回滚路径可用、用例真的在守 |
| 5 | `pnpm build` | **exit 0**；`[verify-client] OK bundle=335555 bytes` | — |
| 6 | `grep -c` on `dist/index.mjs` | 「拆成多次调用」×2、「汇报自检」×2；mtime 11:58:29 | 构建产物已含本次文本，重启宿主即生效 |

## 二、如实记录的数字口径偏差（3 处）

1. **`dist/index.mjs` 命中「拆成多次调用」×2（非 ×3）**：构建后 `dist/index.mjs` 内含 2 处——(a) 合并进
   `LONG_TEXT_ARG_NOTE` 的工具描述，(b) `TASK_REPORT_PROMPT` 里的分段指引。旧记录写 ×3 系上一版产物口径。
   实质要求（产物含本次文本）满足，具体数字按实测。
2. **`generated/fragments.ts` 命中「汇报自检」×2（非 ×3）**：两处片段源（light/overrides、heavy/overrides）
   各一处。C-16 产物体积本次实测 **72574 bytes**（上一版记录 72702，系文本版本差异）。
3. **tsc 194 ≠ 197**：`grep -c 'error TS'` 口径下本次 194、基线记录 197；两者差 3，**本次改动的 14 个文件零新增**
   是硬结论（用改动清单过滤 tsc 输出 → 0 命中）。注意 `src/tools/**` 里仍有 2 条**存量**错误
   （`RunStatusTool/RunStatusTool.ts:122`、`StatusTool/StatusTool.ts:13`）——它们不在本次改动清单内，
   不是本次引入；口径以「改动文件零新增」为准。

## 三、结论

- 零行为变更成立：入参 schema / 返回体 / 错误码 / 落盘格式零变更（TC-5 断言 + 全量失败集合对齐）。
- 兼容路径存在且可走：回滚 = 还原文本（无需数据迁移、无需状态还原）。
- 本卡不改功能代码，只做核验与证据采集。
