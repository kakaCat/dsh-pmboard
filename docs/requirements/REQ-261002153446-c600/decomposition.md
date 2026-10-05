# REQ-261002153446-c600 拆分计划 · 已归档窗口 chip：点击后恢复并打开

## TL;DR

看板上的「窗口 / 会话」chip 指向已归档会话时，现在点了只弹一句「已归档，无法跳转」。
本次把点击变成**一个动作两步走**：先取消归档恢复该会话，再收面板并打开它；
恢复失败或客户端没有这个能力时，把原因说清楚（不跳、也不假装跳了）。
改动集中在客户端三个模块（行为 1 个 + 文案 2 个）与两个测试文件，无新依赖、无台账字段变化。

## 改动盘点（对照设计文档逐份）

| 设计文档 | 落点文件 | 改动 | 接收任务 |
|---|---|---|---|
| design/architecture.md | src/client/session-jump.ts | 归档分支由「终止」改「先恢复再跳」；新增结果态 restore-failed | t1 |
| design/interfaces.md | src/client/session-jump.ts | WorkspacesServiceFace 增可选 unarchiveSession；handleSessionJump 去掉提前 alert | t1 |
| design/data-model.md | src/client/session-jump.ts | 结果枚举与投影类型（无持久化变更） | t1 |
| design/interfaces.md | src/client/render/dom-utils.ts | 已归档 chip 的 title 改为「点击取消归档并打开」 | t2 |
| design/interfaces.md | src/client/board-mount.ts | jumpResultMessage 增 restore-failed；archived 改写；unavailable 补「暂不可用」 | t2 |
| design/test-cases.md | tests/session-jump.test.ts、tests/board-info-fixes.test.ts | TC-1..TC-6 用例 | t1、t2、t3 |

## 覆盖对照表

| 需求条款 | 条款内容 | 接收任务 |
|---|---|---|
| FR-1 | 已归档会话点击即取消归档并打开 | t1 |
| FR-2 | 恢复失败或能力缺失时响亮失败 | t1、t2 |
| FR-3 | chip 文案反映「恢复并打开」 | t2 |
| FR-4 | 跳转语义零回归（先收面板再 openSession） | t1、t3 |
| FR-5 | 行为由单测锁死 | t3 |

## 任务表

| 顺序 | key | 业务标题 | 类型 | 依赖 | 验收要点 |
|---|---|---|---|---|---|
| 1 | t1 | 点已归档窗口，能回到那个会话：先恢复、再打开 | implement / frontend | — | 单测时间线为 unarchive → selectPanel → openSession；恢复失败不打开 |
| 2 | t2 | 点之前就看得见会发生什么：chip 与失败提示的文案 | implement / frontend | t1 | chip title 含「点击取消归档并打开」；结果文案齐备 |
| 3 | t3 | 兼容与回归：旧客户端语义、幂等、类型与客户端构建 | test / frontend | t1、t2 | 两文件单测全绿；typecheck 不高于基线；build:client 输出 [verify-client] OK |

## 迁移与兼容（单列说明，随 t3 验证）

- **旧客户端**（不提供 `unarchiveSession`）：沿用旧语义返回 `archived`，提示补上「客户端不支持取消归档」；升级客户端后行为自动升级，无需迁移。
- **台账 / RTM / 归档材料**：零改动；无数据回填、无 schema 迁移。
- **回滚**：还原三个源文件并 `pnpm build:client` 重新打包即回到旧行为。

## 下一步

implementing —— 本计划经人批准后自动落库任务卡并进入实施。
