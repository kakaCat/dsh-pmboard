# t-a55a6f 让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0·研发

> 需求：REQ-261004154937-2ca3 token 统计纳入子代理消耗（跨会话聚合口径）

## 在做什么
让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T08:07:02.891Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，快照真的能看见子代理了：它把「本窗口 + 它的子代理、孙代理」的用量合起来报，而且取不到的那部分会如实说是取不到，不会当 0。

### 完成项

- 血缘枚举：按 parentSession 传递闭包（含多层），判据 delegationDepth≥1 或 origin=subagent，fork 出来的分支窗口不算后代；成员上限 64
- 取数链路：枚举走 sessionPersistence.list（零日志读），单会话用量走 sessionProjectionCache.cachedSnapshot（缓存命中零日志读，且它是同步的）
- 设计前提的落地细化：枚举是异步的、而快照链是同步的（30 处调用点），故集合异步刷新、用量同步读——不把 await 引进调用链（设计不变量 5 保持）
- 缺失不补 0：未命中的后代进 degradedMembers、不进合计；并按预算（8 个）异步冷读预热写回缓存，下一轮即可命中
- 两服务缺失 → scope=self + descendants-unavailable，数字与自身路径逐字相同（不假装聚合过）
- 接线：声明式注入两个服务（绝不直接读 ctx 属性）；注入回调做成可空——装配冒烟桩会回传 undefined，实测踩到并修复
- 测试：新增 7 条血缘/聚合用例全绿；既有 session-probe-token 6 条全绿（契约扩展后按新契约更新了一条断言——数字与改造前逐字相同）
- 全量回归回到基线：46 文件 / 96 用例失败，逐文件 diff 为零；类型检查 146 持平

### 改动文件

- `src/adapters/SessionProbeAdapter.ts`
- `src/application/ports.ts`
- `src/shared/protocol.ts`
- `src/index.ts`
- `tests/session-probe-lineage.test.ts`
- `tests/session-probe-token.test.ts`
- `tests/application/harness.ts`
- `docs/requirements/REQ-261004154937-2ca3/evidence/full-suite-after-t2.txt`

---
