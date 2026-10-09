# t-1bc4c0 同步面定稿：README + package.json + 全量验证（FR-7）·研发

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
同步面定稿：README + package.json + 全量验证（FR-7）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/tools-schema.test.ts tests/arg-guidance.test.ts tests/error-code-matrix.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T15:04:37.572Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

t7 研发：README/package.json 计数与描述定稿为 21。

### 完成项

- README 工具表定稿：21 行 / 6 组，计数三处 21；status 描述补 run 节、ask_confirm 描述补三路径、task_tree 补 task_id 单卡展开、task_amend 行在位
- package.json description = 21 个
- 证据落盘 evidence/t-34ec16-fr7.md

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-34ec16-fr7.md`
- `README.md`

---
