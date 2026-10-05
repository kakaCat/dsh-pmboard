---
req_id: REQ-261003204143-3219
serves: FR-2, FR-3
---

# 测试用例（REQ-261003204143-3219）

> 主用例文件：`tests/capture-output-contract.test.ts`（本需求新增，3 条）。

## 用例清单 `serves: FR-2`

| # | 用例 | 断言 | 抓住的漂移形态 |
|---|---|---|---|
| TC-1 | 成功路径回执过 schema | `validateJsonSchemaValue(tool.output.schema, receipt)` 零违例 | answers 多键未声明（本次事故） |
| TC-2 | 取消路径回执过 schema | 同上（notCreated 默认 answers 也含 workspace） | 失败分支的同类漂移 |
| TC-3 | 键集三方同源 | mapCaptureAnswers 产出键 === CAPTURE_ANSWER_KEYS === schema 声明键 | 常量/schema/产出任一处漂移 |

## 反向演练（修复有效性证成） `serves: FR-2, FR-3`

| 演练 | 操作 | 期望 | 实测 |
|---|---|---|---|
| ① | 摘 schema 的 workspace 声明 | TC-1/2 红且点名 answers.workspace | ✅ 2 红，点名逐字一致 |
| ② | 摘 CAPTURE_ANSWER_KEYS 一键 | tsc TS2353 两处 + 3 用例红 | ✅ tsc 点名 workspace，用例键集断言红 |

两次演练均已恢复，恢复后全绿；证据见 tasks/ 各卡实施记录。

## 回归口径 `serves: FR-2`

四文件全绿（capture-output-contract / capture-tool / tools-schema / capture-hook = 95 tests）；
全量 `pnpm test` 失败数 = 基线 98 零新增；`tests/capture.test.ts` 现存 1 红归属并行窗口
REQ-261003204149-1e80 在制改动（口径修订已获人批准）。
