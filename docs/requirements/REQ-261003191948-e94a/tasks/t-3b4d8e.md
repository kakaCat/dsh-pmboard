# t-3b4d8e 给迁移门补只读预检与可复制迁移命令·测试

> 需求：REQ-261003191948-e94a 迁移门拒绝启动时静默失败：界面只显示 404，没有任何迁移指引

## 在做什么
对 t1 及其连带改动跑测试段：定向用例 + 类型检查 + 全量基线比对。

## 解决什么问题
（本卡由链自动展开；**未能开工**，原因见下。）

## 得到什么结果
定向用例全绿 + 类型不高于基线 + 全量失败数不高于基线。

---

## ⚠️ 本卡未开工（状态：todo，被依赖门挡住）

**阻塞链**：`t-3b4d8e` → `t-5479a5`（复核段）→ `t-bec57a`（研发段）。
三张子卡是一条串行链，首卡拿不到凭证即整链停摆（同 `t-5479a5.md` 的说明，
根因见 `../evidence/verification-evidence.md` §5.2）。

**测试工作实际已完成**（不因卡未开工而空缺）：命令、输出与基线比对全部落在
`../tests/test-evidence.md`；核心结论：

| 项 | 结果 |
|---|---|
| 定向用例（4 个文件） | 28 passed |
| `pnpm build` / `pnpm build:client` | 退出码 0；`[verify-client] OK` |
| `npx tsc --noEmit` | 150 error（基线 223）；改动文件 0 |
| `npx vitest run`（全量） | 98 failed / 3337 passed（基线 106 / 2807） |

**解除条件**：同 `t-5479a5.md`。
## 汇报 1（2026-10-03T12:22:20.234Z，窗口 session-44207972-0dfc-41f4-89c0-01681149cd30）

测试段：定向 28 条全绿、全量 98 failed 不高于基线、构建与类型均达标；修前必红与定向核验反证齐备。

### 完成项

- 定向用例 4 文件 28 条全绿（migration-gate 7 / task-read-root-sync 2 / degraded-startup 11 / api-client 8）
- 修前必红已证：回退 TaskTree 的 agentIdFromExec → task-read-root-sync 1 failed，还原即绿
- pnpm build 退出码 0；verify-client OK bundle=337435 bytes
- pnpm build:client 重建；npx tsc --noEmit 150（基线 223），改动文件错误 0
- 全量 npx vitest run：98 failed / 3352 passed（基线 106 / 2807），零回归
- 定向核验：改动面相关 40 个用例文件 357 passed / 9 failed，反证回退 routes.ts 后变 19 failed
- 未做端到端未就绪启动冒烟与页面观感核对，已如实记录

### 改动文件

- `docs/requirements/REQ-261003191948-e94a/tests/test-evidence.md`

### 下一步

父卡 t-bb9da6 收尾，随后按同口径收 t2–t7

---
