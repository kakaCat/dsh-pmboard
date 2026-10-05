# t-fcda30 补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例·研发

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T09:20:27.105Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

一直补不回来的卡上引用第一次有了正经写入口：补完 RTM 跟着变、改动留痕、越权与脏值当场拒

### 完成项

- 新增 src/application/use-cases/AmendTaskRefs.ts：全量替换、值同不写盘、跨需求拒绝、需求评论留痕、写后同步 RTM（唯一写入口）
- 新增工具 reqboard_task_refs（src/tools/TaskRefsTool/），接进 src/tools/index.ts 与 src/index.ts 注册表
- 看板改卡路由 task/update 接受 requirementRefs + reason，走同一用例；只改引用时回读任务，不把空壳回给看板
- 新增 tests/reqboard/task-refs-repair.test.ts → 6 passed
- 顺手补掉自己引入的契约缺口：Decompose 的 unrefed_cards / refs_warning 已在输出 schema 显式声明（t3 的遗漏，输出契约门禁抓到）
- 输出契约与工具 schema 门禁复跑：本工具 0 失败；只剩 3 项既有失败（TaskAdopt / Knowledge / Regenerate）

### 改动文件

- `src/application/use-cases/AmendTaskRefs.ts`
- `src/tools/TaskRefsTool/TaskRefsTool.ts`
- `src/tools/TaskRefsTool/summary.ts`
- `src/tools/TaskRefsTool/index.ts`
- `src/tools/index.ts`
- `src/index.ts`
- `src/http/routers/tasks.ts`
- `src/tools/DecomposeTool/DecomposeTool.ts`
- `tests/output-contract.test.ts`
- `tests/tools-schema.test.ts`
- `tests/reqboard/task-refs-repair.test.ts`

### 下一步

交联调子卡：核对写入口的同步、幂等与拒绝三态

---
