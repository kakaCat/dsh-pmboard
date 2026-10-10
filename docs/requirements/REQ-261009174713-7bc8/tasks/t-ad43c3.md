# t-ad43c3 client 包与构建入口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
client 包与构建入口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
node scripts/verify-client-build.mjs 退出码 0；pnpm build 产出 lib/client.js；npx vitest run packages/pmboard-client/tests 全绿

## 实施方案（implementation）
git mv src/client → packages/pmboard-client/src（types.ts 已在 t4 下沉）；tsdown.client.config.mjs 的 entry 改指该包 src/index.ts；保持无 bare npm 导入。

## 上游产出摘要（dependsSummary）
- core 包落位与 import 重写

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-10T01:20:51.205Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

父卡 t-ad43c3（client 包与构建入口）收官：140 文件迁入 pmboard-client、自包含铁律成立、构建链两条验收 exit 0；全量读数等于基准（新增失败 0，另有一处自愈）。

### 完成项

- 搬迁：git mv src/client 的内容 → packages/pmboard-client/src（140 文件，拍平不多层）；tsdown.client.config.mjs 的 entry 改指包内
- 越层收口：client 的 AcceptanceTracking 改由 core 转出（L2 白名单只到 common/core）
- 配套三处：tsdown entry · core 转出 · 知识层双根（SOURCE_ROOTS 含包内根，缺根跳过）——第三处不做会让颜色/变量/类名静默归零
- 扫描两类分开：说明符只匹配 from/import（344 处）+ 字符串字面替换保留前缀（70 文件，含引用型夹具 .json）
- 验收一：node scripts/verify-client-build.mjs exit 0（OK bundle=764536）
- 验收二：pnpm build exit 0，产出 lib/client.js 764536 字节 + dist/index.mjs
- 验收三（口径）：npx vitest run packages/pmboard-client/tests 待 t20 测试随包迁移，此刻目录为空
- 读数：tsc 0、分层门禁 exit 0、全量 7268 例失败 19 = 基准（新增失败 0；基线红 message-hygiene 自愈一条）
- 判断面先行（t15 的方法）本卡再次奏效：先补 client-root.ts 与两个 helper 基址改动（readSrc / size-budget 扫描），再搬 ⇒ 搬完一次全绿

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-client/src`
- `.worktrees/req-261009174713-7bc8/tsdown.client.config.mjs`
- `.worktrees/req-261009174713-7bc8/tests/helpers/client-root.ts`
- `.worktrees/req-261009174713-7bc8/tests/size-budget.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/compat-regression.test.ts`

### 下一步

父卡可关。剩余 ready：t19（资产四包化）等；每张卡的收法都已在本文件的「判断面先行」范式下成型。

---
