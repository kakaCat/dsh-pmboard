# t-5aa22c 看板 / 扫描 / 知识层 / 子代理根一律按项目·研发

> 需求：REQ-261005141830-7a3b 修复 Dive 项目归属以路径判定：改用项目 id 唯一标识

## 在做什么
看板 / 扫描 / 知识层 / 子代理根一律按项目·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T07:15:50.463Z，窗口 session-97aa4376-441a-4f0a-800a-7b13aad48a09）

研发段：把看板、扫描、知识层与子代理的根统一改由项目身份带出，并顺手修掉立项工具输出契约的漏声明。

### 完成项

- 组合根把「会话 → 项目身份 + 根」接上（sessionProject），旧字段 sessionWorkspace 保留兼容
- 看板读根解析优先用项目身份，DocRoot 增带 projectId 与判据来源 projectSource
- 看板列表按项目筛；台账查询加「并回未归属」选项（缺省关闭，老行为逐字不变）
- 产物扫描端点带上调用方项目身份，分区判据换 id
- 知识层自举 ensure 增第二参项目身份，去重键改按项目
- 子代理提示词根与凭证根改取需求项目的根，并在凭证门前重校正共享根
- 修 reqboard_create 输出 schema 漏声明项目字段（additionalProperties:false 会拒收真实回执）

### 改动文件

- `src/index.ts`
- `src/http/routers/shared.ts`
- `src/http/routers/stages.ts`
- `src/http/routes.ts`
- `src/application/internal/support.ts`
- `src/application/internal/knowledge-bootstrap.ts`
- `src/application/use-cases/ExecuteTask.ts`
- `src/application/ports.ts`
- `src/repositories/ShardedRequirementStore.ts`
- `src/repositories/SqliteRequirementStore.ts`
- `src/tools/CreateTool/CreateTool.ts`

### 下一步

研发段收尾后交联调段：三个存储实现与两处接线口径一致、跨窗口自举只跑一次。

---
