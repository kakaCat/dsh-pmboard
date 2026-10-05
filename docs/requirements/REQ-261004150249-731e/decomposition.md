---
req_id: REQ-261004150249-731e
requirement_refs: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 拆分计划（REQ-261004150249-731e）

> 目标：上下文将满时，一条命令把需求交接给原项目里的新窗口，新窗口当场可写、可推进。
> 做法：三块落地——① 开窗落对项目（端口扩参 + 源项目解析）② 交接写原子化（席位 + `sourceSessionId` + 留痕）
> ③ 判据与投递（纯函数三档 + 一行装配已有的 `AgentDeliverer`）。
> 容量：缺省 16 DU；`detailUnits = files×1 + anchors×0.5 + chars/2000`（单一源 `src/domain/limits.ts`）。**7 张卡均在容量内**。

## 改动盘点（对照设计文档逐份核对） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 类型 | 路径 | 设计出处 |
|---|---|---|
| 新增 | `src/application/internal/handoff-write.ts` | architecture §模块改动地图 #7 |
| 新增 | `src/application/internal/handoff-policy.ts` | architecture #8 |
| 新增 | `src/application/use-cases/HandoffOwner.ts` | architecture #9 |
| 新增 | `src/tools/HandoffTool/HandoffTool.ts`、`src/tools/HandoffTool/prompt.ts` | interfaces §工具 |
| 新增 | `tests/handoff-owner.test.ts`、`tests/handoff-policy.test.ts`、`scripts/handoff-probe.mts` | test-cases |
| 修改 | `src/application/ports.ts`（`WindowOpenerPort.create` 扩参） | interfaces §端口 |
| 修改 | `src/plugin-config.ts`（`handoffSettings`） | data-model §配置 |
| 修改 | `src/adapters/SessionWindowOpener.ts`（opts 透传 + `resolveSourceProject`） | backend #1-2 |
| 修改 | `src/application/use-cases/OpenWindow.ts`、`CaptureRequirement.ts`（带源项目） | backend #4-5 |
| 修改 | `src/application/internal/binding-write.ts`（委托 `handoffOwner`） | backend #6 |
| 修改 | `src/index.ts`（`crossWindowDeliver` + `workspaceRegistry` + 工具注册） | backend #13-15 |
| 修改 | `src/tools/index.ts`（导出新工具） | backend #11 |
| 删除 | 无 | — |

## 任务表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| key | 标题 | 层 | FR | 依赖 | DU |
|---|---|---|---|---|---|
| t1 | 扩端口签名与 handoff 配置契约 | 契约 | FR-1, FR-3 | — | 4.6 |
| t2 | 交接写原子化（席位 + sourceSessionId + 留痕） | 数据 | FR-2 | — | 3.5 |
| t3 | 分叉判据纯函数（三档 + 读数缺席不猜） | 判据 | FR-3 | — | 5.7 |
| t4 | 开窗落回源项目（适配器 + 两个用例调用点） | 适配 | FR-1 | t1 | 5.8 |
| t5 | 交接用例与 `reqboard_handoff` 工具 | 用例/工具 | FR-4, FR-5 | t1, t2, t3, t4 | 7.5 |
| t6 | 组合根装配 + 看板改绑修正 + 迁移兼容与回滚 | 接线 | FR-1, FR-2, FR-4, FR-5 | t2, t5 | 4.7 |
| t7 | 验收：探针 + 反向演练 + 全量回归与实机复核 | 验收 | FR-6 | t1…t6 | 5.1 |

## 依赖图

```
t1 契约 ─┐
t2 交接写 ─┼─▶ t5 用例+工具 ─▶ t6 装配/改绑/兼容 ─▶ t7 验收（总）
t3 判据 ─┤                      ▲
t4 开窗落点 ─┘（需 t1）          └── 需 t2、t5
```

## 容量核算（逐卡）

| key | files | anchors | chars | detailUnits | 上限 | 判定 |
|---|---|---|---|---|---|---|
| t1 | 2 | 4 | 1200 | 2 + 2.0 + 0.60 = **4.6** | 16 | 内 |
| t2 | 1 | 4 | 1000 | 1 + 2.0 + 0.50 = **3.5** | 16 | 内 |
| t3 | 2 | 6 | 1300 | 2 + 3.0 + 0.65 = **5.7** | 16 | 内 |
| t4 | 3 | 4 | 1500 | 3 + 2.0 + 0.75 = **5.8** | 16 | 内 |
| t5 | 4 | 5 | 2000 | 4 + 2.5 + 1.00 = **7.5** | 16 | 内 |
| t6 | 2 | 4 | 1400 | 2 + 2.0 + 0.70 = **4.7** | 16 | 内 |
| t7 | 2 | 5 | 1200 | 2 + 2.5 + 0.60 = **5.1** | 16 | 内 |

无超容量卡 ⇒ 不需要 `⚠️超容量(建议N批)` 标记。

## 迁移与兼容（t6 承接） `serves: FR-2`

| 面 | 口径 |
|---|---|
| 存量数据（无 `seats`） | 不预写、不迁移；第一次交接时物化（与读端折算语义等价） |
| 旧调用方（不传 `opts` 的开窗） | `create()` 行为与改造前逐字节相同（请求体 `{}`） |
| 未配置 `handoff` | 三档缺省 `0.75/0.85/0.90`；**无后台自动行为** |
| 回滚 | 看板改绑回原窗口（幂等）；摘掉 `useCaseDeps.crossWindowDeliver` 一行即回到投递不可用 |

## 验收口径（总） `serves: FR-6`

```bash
./node_modules/.bin/vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts
npx tsx scripts/handoff-probe.mts
npx vitest run tests/open-window-tool.test.ts tests/bind-seat.test.ts \
              tests/capture-window-bound-policy.test.ts tests/binding-trace.test.ts \
              tests/layer-boundary.test.ts tests/size-budget.test.ts
npx tsc --noEmit
pnpm build
```
