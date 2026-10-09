# t-c14abb AdvanceTool 目录改名 TaskRunTool（S5）·复核

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
AdvanceTool 目录改名 TaskRunTool（S5）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007220012-bd29/design/` 逐条核对；`npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/task-run-contract.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T14:58:41.038Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S5 复核：设计核对 5 项无偏离；错误码清单随动已刷新并复绿。

### 完成项

- 对照设计 §文件结构（改名条目）逐条核对 5 项：P-1 git mv 目录 / P-2 registry key·factoryFile·dir 同步 / P-3 index import+register 同步 / P-4 工具名不变 / P-5 I-1·I-2 目录与注册名集合一致 —— 全部无偏离
- 偏离登记：无
- 连带面复核：error-code-inventory 夹具 6 条 site.file 指向已按门禁指引刷新（refresh-error-code-inventory.mts），错误码三件套 36 例全绿
- 复核复跑：tools-dispatch + output-contract + apply-wiring + task-run-contract 4 文件 53 例全绿

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-084edc-s5.md`
- `tests/fixtures/error-code-inventory.json`

---
