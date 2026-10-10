# t-11fce4 client 包与构建入口·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
client 包与构建入口·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-10T01:20:07.001Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

client 面入包完成：140 文件迁入 packages/pmboard-client/src（拍平、无多一层）；构建入口改指包内；越层 rtm 类型由 core 转出；说明符 344 处 + 字符串 70 文件同步；全量读数等于基准。

### 完成项

- git mv src/client 的**内容** → packages/pmboard-client/src（140 文件；注意拍平，不能多一层）
- tsdown.client.config.mjs 的 entry 改指 packages/pmboard-client/src/index.ts；无 bare npm 导入保持不变
- 越层 import 收口：client 的 views/panels/verify.ts 从 reqboard-rtm 取 AcceptanceTracking ⇒ 改由 core 转出（packages/pmboard-core/src/protocol-domain.ts 加一行 export type），client 改从 core 取（L2 白名单只到 common/core）
- 知识层扫描根改双根（EnsureKnowledgeLayer 的 SOURCE_ROOTS = ['src','packages/pmboard-client/src']，缺根跳过）——否则颜色/变量/类名全 0 且不报错
- 扫描两类分开做：说明符只匹配 from/import（不吃字符串）344 处；字符串字面替换保留前缀 70 文件（含 tests/fixtures/*.json 引用型夹具）
- 读数：tsc 0、分层门禁 exit 0、pnpm build exit 0、verify-client OK（bundle=764536）、全量 7268 例失败 19 = 基准（新增失败 0，message-hygiene 自愈一条）
- 口径：卡面「vitest run packages/pmboard-client/tests」待 t20 测试随包迁移，此刻该目录为空

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-client/src`
- `.worktrees/req-261009174713-7bc8/tsdown.client.config.mjs`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/protocol-domain.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/application/use-cases/EnsureKnowledgeLayer.ts`
- `.worktrees/req-261009174713-7bc8/tests/helpers/client-root.ts`

### 下一步

交复核子卡 t-5482aa。

---
