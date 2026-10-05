---
req_id: REQ-261004110201-f253
serves: FR-1, FR-2, FR-3, FR-4
---

# 后端设计（REQ-261004110201-f253）

> `sides: backend` 的依据：本需求四处改动全在宿主侧（配置 / 生成器 / 应用层调度与遥测 / 工具回执）；
> 看板排序由**服务端排序**保证，客户端零改动（故不交 frontend.md）。

## 分层与落位 `serves: FR-1, FR-2, FR-3, FR-4`

| 层 | 落什么 | 约束（本仓既有门禁） |
|---|---|---|
| domain | `StageRouting.ts`（路由校验/解析）、`StageTelemetry.ts`（聚合） | 纯函数、零 I/O、不 import shared（layer-boundary 用例守） |
| application/internal | `token-usage.ts` 收尾写产出数；`workflow-script.ts` 注入路由 | 不 import node:、不直接碰宿主 |
| application/use-cases | `ExecuteTask.ts` 传产出数 + 零产出告警；`AdvanceChain.ts` 排序 + WIP 闸 | 写台账一律经 store 端口 |
| tools | `StatusTool` schema 声明 `stage_telemetry` | 先声明后回执（三方同源） |
| 装配层 | `plugin-config.ts` 读三个配置 + 装配期校验 | 非法配置在这里响亮抛错 |

## 并发与副作用 `serves: FR-1, FR-2, FR-4`

| 关注点 | 设计 |
|---|---|
| 遥测写入 | 只在 `closeExecutions`（执行收尾唯一入口）写——不新增第二个写入点，避免并发下两处写同一记录 |
| 只读聚合 | `stageTelemetryOf` 是纯函数，输入调用方已取到的 subtasks 快照；**不加锁、不写盘** |
| 零产出告警 | 在既有 `store.mutate` 事务内追加评论；判据（streak/alerts）由**已落盘数据推导**，无内存状态、可重放 |
| WIP 闸 | 读侧判据（新鲜 `advance.lockAt`）；不改锁语义、不新增锁；投递仍走既有 `advanceRequirement` 单飞与锁 |
| 排序 | 纯函数排序键 `(-priority, createdAt)`；不改任何写路径 |

## 失败语义 `serves: FR-1, FR-2, FR-3, FR-4`

| 失败 | 语义 |
|---|---|
| 路由表非法 | 装配期 throw（插件不启用）——**不半可用**：宁可整插件不启动，也不让"配了但不生效"成为静默事故 |
| 路由未命中 | 不注入（正常路径，不是错误） |
| 遥测缺数据 | 回执省略键（不是错误，也不发空壳） |
| 零产出告警写评论失败 | 不阻断链（告警是旁路），但**不吞**：走既有 warn 通道留痕 |
| WIP 超限 | 不是错误：`dispatched:false` + `stopped='wip_limit'` + 人话原因（谁在跑、上限多少、怎么解除） |

## 依赖与调用方覆盖 `serves: FR-1, FR-2, FR-4`

| 改动点 | 调用方盘点 | 漏改风险 |
|---|---|---|
| `generateSubtaskScript` | 仅 `ExecuteTask`（子卡执行） | 新增可选参数，旧调用方零改动 |
| `closeExecutions` | `ExecuteTask`、`AdvanceChain.finalizeParent` | 新参可选；`finalizeParent`（父卡收尾）不传产出数 → 保持现状 |
| `scanAndResume` | 装配层启动恢复扫描 | 排序/闸门只在内部；返回形状仅新增一种 `stopped` 取值 |
| `QueryState` | `StatusTool` | 新增只读键 + schema 同步 |
| `plugin-config` | `src/index.ts` 装配 | 新增可选字段，旧配置合法 |

## 工程操作（交付前必跑） `serves: FR-1, FR-2, FR-3, FR-4`

```bash
npx vitest run tests/stage-model-routing.test.ts tests/stage-telemetry.test.ts \
               tests/zero-output-alert.test.ts tests/requirement-priority.test.ts
pnpm test          # 失败数 ≤ 基线
npx tsc --noEmit   # 归属本需求文件零错
```
