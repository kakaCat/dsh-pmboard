# t-edc681 闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:03:40.957Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

研发段完成：合并去向与说明书锚点的事实判定落地，判据命令 7/7 全绿，RV-1 反向演练（不存在的 merged_into 必被拒并点名）已实测通过。

### 完成项

- 新建 src/application/internal/archive-targets.ts：闸 1/闸 2 事实判定（存在 / 非空 / 锚点可达 + 三要素拒绝消息）
- 改 SubmitArchive：读盘前按需求自身根校正，再判闸 1/闸 2，回执增 resolved_targets
- 改 SubmitTool：output.schema 声明 resolved_targets（输出契约不虚报）
- 新增 tests/archive-targets-gate.test.ts：7 用例（含 RV-1 反向演练）全绿

### 改动文件

- `src/application/internal/archive-targets.ts`
- `src/application/use-cases/SubmitArchive.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `tests/archive-targets-gate.test.ts`

### 下一步

联调/复核/测试段依次跑判据

---
