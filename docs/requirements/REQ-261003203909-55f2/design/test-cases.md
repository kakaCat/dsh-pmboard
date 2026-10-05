# 测试策略 · 子卡阶段模板补充

> **TL;DR**：纯函数用例冻结入参单测（沿用本仓纪律）；manual 链行为走 AdvanceChain 集成用例；
> 两条反向演练证明「登记强制」真的强制。验收命令见 §4。

## 1. 用例矩阵 · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| # | 用例 | 层 | 断言锚点 | serves |
|---|---|---|---|---|
| TC-1 | `validateTemplateRef`：合法键→链 / 非法键→结构化原因 / 非字符串→原因 | domain 纯函数 | 冻结入参快照 | FR-4 |
| TC-2 | `resolvePlanStages` 优先级：stages>template；stages+template→CONFLICT；template+skipIntegration→裁后链 | domain 纯函数 | 五组入参矩阵 | FR-4, FR-5 |
| TC-3 | 新四段登记完整性：KINDS/LABELS/ACCEPTANCE/EVIDENCE_KIND/COLOR/SCOPE_RULE 六表同 key 集合 | domain 遍历 | 集合相等断言（缺一即红并点名） | FR-1,2,3,6,7 |
| TC-4 | 新段验收模板可证伪：每段含命令锚点（反引号或「落盘路径」），禁「功能正常」式空话 | domain 文本扫描 | 沿用 subtask-template-acceptance 既有断言模式 | FR-1,2,3,6 |
| TC-5 | manual 分支：选中→不派 run→清单落盘→`stopped='awaiting-manual'`→autoRun 不变→report 后续跑 | AdvanceChain 集成 | 内存 deps + 假 clock；断言清单文件 mtime 锚 | FR-2 |
| TC-6 | manual 防伪造：只生成骨架不更新 → 凭证门拒（mtime 不新鲜） | 凭证门集成 | `REQBOARD_SUBTASK_GATE` 回执 | FR-2 |
| TC-7 | e2e/release/capture 子卡提示词：边界规则文本进 prompt、schema 族正确 | ExecuteTask 单测 | prompt 快照 + schema 断言 | FR-1,3,6 |
| TC-8 | plan 落库：template→stages 写值 + TaskRecord.template 冗余记录 | plan-landing 单测 | 落库 TaskRecord 快照 | FR-4 |
| TC-9 | submit 计划 schema：template 字段收发 / 非法键拒绝文案列合法键 | SubmitTool 契约 | 错误码 + 文案断言 | FR-4 |
| TC-10 | 回归：无 template 旧计划行为不变；solo 卡不受影响；既有模板表用例全绿 | 既有套件 | 零改动即证 | FR-4,5 |
| TC-11 | eval-suite fixtures 同步：涉及默认链断言的 fixture 更新并复跑校验脚本 | eval-suite | `validate_eval_suite.py` → PASS | FR-7 |

## 2. 反向演练（证明门禁真的咬人） · serves: FR-7

- R-1：摘 `STAGE_SCOPE_RULE.e2e` → `npx tsc --noEmit` 报错（改造前静默 `?? ''`，改造后编译错）。
- R-2：摘 `STAGE_TO_PHASE_COLOR.manual` → 编译报错。
- 两条演练的 tsc 输出截图/文本入 `evidence/`。

## 3. 测试数据 · serves: FR-4, FR-5

- 模板键 fixture：`change-only`→`['dev','review']`、`acceptance`→`['verify']`、`ops`→五段链。
- manual 集成用例的内存 deps 沿用 `tests/advance-dispatch-owner.test.ts` 的装配模式
  （内存 store + 假 ids/clock + docs 替身）。

## 4. 验收命令（交付时逐条贴输出） · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

```bash
# ① 领域与契约用例
npx vitest run tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts \
  tests/subtask-contract.test.ts tests/execute-task.test.ts tests/stage-colors.test.ts
# ② manual 链行为（新增用例文件）
npx vitest run tests/advance-manual-stage.test.ts
# ③ 类型门禁 + 反向演练证据
npx tsc --noEmit
# ④ eval fixtures 校验
python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py   # → RESULT: PASS
# ⑤ 端到端复跑（实机）：submit(plan 带 template) → decompose → queue.json 断言 → 开工展开链
```

**通过口径**：①② 全绿；③ 基线零新增错误 + R-1/R-2 演练输出在案；④ PASS；⑤ `queue.json`
中 `stages`/`template` 字段与展开链构成符合 UC-1 判据。
