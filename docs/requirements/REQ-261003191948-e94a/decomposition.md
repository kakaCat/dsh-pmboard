# 拆分计划（REQ-261003191948-e94a）

> 目标 + 做法一句话：把「迁移门拒绝启动」从**整条路由消失的静默失败**改成**三相启动**——
> 未就绪时路由仍在、全端点回 503 + 错误码 + 可复制的迁移命令，客户端不再吞掉失败原因。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。

## 编号口径

本需求规模小（轻档），设计文档未引入 I-x / S-x / C-x / TC-x 一套新编号——
**刻意不再造一层编号**：造了就要在四份文档里同步维护，而本需求只有 6 条 FR。
故落点一律写成「设计文档 §章节 + 具体文件路径」，机器判据（`serves: FR-x`）仍在设计文档里逐节标注。

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-1 … FR-6 | `requirement.md` 功能点 | 需求条款（本次唯一编号体系） |
| t1 … t7 | 本文档任务表 | 任务（计划 key） |

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（设计章节 + 文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 给迁移门补只读预检与可复制迁移命令 | FR-1, FR-3 | architecture.md §关键结构决策 D-ARCH-1 + `src/repositories/migrationGate.ts`、`tests/reqboard/migration-gate.test.ts` | implement | backend | — | S | `npx vitest run tests/reqboard/migration-gate.test.ts` 全绿；新用例断言 `hint` 含真实 `ledgerFile`/`dataRoot` 且不含占位符 `<单册>` | dev, review |
| t2 | （落库后回填） | 抽出唯一信封模块并新增迁移门 503 映射 | FR-2 | interfaces.md §错误码 + `src/http/envelope.ts`（新）、`src/http/routes.ts`、`tests/reqboard/degraded-startup.test.ts`（新建，先落"映射"段） | implement | backend | t1 | M | `fail()` 对 `REQBOARD_REQUIRES_MIGRATION` 回 503 且 body 含 `hint`；既有路由用例零回退 | dev, review |
| t3 | （落库后回填） | 新增未就绪 HTTP handler | FR-2, FR-5 | backend.md §`enterNotReadyMode` 实现要点 + `src/http/not-ready.ts`（新）、`tests/reqboard/degraded-startup.test.ts` | implement | backend | t2 | M | 四类请求（`/state`、`/health`、POST、未匹配子路径）全 503 且非 404；SSE 路径立即结束；夹具目录零新建 | dev, review |
| t4 | （落库后回填） | 接线降级启动分叉并双通道留痕 | FR-1, FR-5, FR-6 | backend.md §`apply()` 的分叉改动 + `src/wiring/not-ready.ts`（新）、`src/index.ts` | implement | backend | t1, t3 | M | 夹具「有单册无 meta」跑装配：apply 不抛、只注入 `['webServer']`、日志含 code 与 hint | dev, review |
| t5 | （落库后回填） | 客户端数据层透出服务端错误体 | FR-4 | frontend.md §问题定位 + `src/client/api.ts`、`tests/api-client.test.ts` | implement | frontend | t2 | S | 503 + `{error,code,hint}` → `ApiError.message` 等于服务端 `error`、`hint` 透传；空体退回 `HTTP 503` | dev, review |
| t6 | （落库后回填） | 看板报错区渲染可复制的迁移命令 | FR-4 | frontend.md §呈现设计 + `src/client/render/dom-utils.ts`、`src/client/board-mount.ts` | ui | frontend | t5 | S | `buildError(msg, hint)` 渲染串含二者；无 hint 时不出现命令块；`pnpm build:client` 退出码 0 | dev, review |
| t7 | （落库后回填） | 迁移与兼容回归 + 纪律核验 | FR-1 … FR-6 | test-cases.md §回归路径 + 无新码（只跑命令与核验） | test | fullstack | t4, t6 | S | 三条回归命令全绿；`pnpm typecheck` 不高于基线 223；全量失败数 ≤ 基线 106 | dev, review, test |

- 一个任务只干一件事，标题动词开头。
- **落点** = 设计章节 + 具体文件路径——不许写"相关模块"。
- 工作量口径：S = 半天内 / M = 1~2 天 / L = 3 天以上。**本计划无 L 卡**。
- 验收标准可证伪：跑什么命令、看到什么输出算过。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 进入未就绪态而非不加载 | interfaces.md §函数签名（`preflightLedger`） | backend.md §`apply()` 的分叉改动 | TC-T1, TC-T3, TC-T10b（test-cases.md） | t1, t4, t7 | ✅ |
| FR-2 全端点 503 + 结构化原因 | interfaces.md §HTTP 端点状态码矩阵、§错误码 | backend.md §信封抽取的迁移纪律 | TC-T3, TC-T4, TC-T5 | t2, t3, t7 | ✅ |
| FR-3 hint 是代入真实路径的命令 | interfaces.md §`hint` 的命令构造契约 | backend.md §服务与接口实现（`preflightLedger` 行） | TC-T2, TC-T6 | t1, t7 | ✅ |
| FR-4 客户端不再丢原因 | interfaces.md §客户端契约 | frontend.md §呈现设计、§数据流 | TC-T8, TC-T9 | t5, t6, t7 | ✅ |
| FR-5 未就绪态零副作用 | interfaces.md §HTTP 端点状态码矩阵（三条硬约束） | backend.md §边界与不做 | TC-T7, TC-T10b | t3, t4, t7 | ✅ |
| FR-6 装配失败留痕响亮 | interfaces.md §函数签名（`enterNotReadyMode`） | backend.md §`enterNotReadyMode` 实现要点 | TC-T10 | t4, t7 | ✅ |
| **合计** | 6 条款各有接口锚点 | 6 条款各有模块锚点 | 11 条用例（TC-T1…TC-T11b） | 7 任务 | 6/6 条款有主 |

（「接口」列对纯运行时行为条款写"设计章节"锚点而非新编号，理由见 §编号口径。
每格都不为空；无"落库后回填"以外的占位符。）

## 覆盖完整性规则

1. **每行三格不许空**：本表 6 行全部有接口锚点、模块锚点、用例锚点、接收任务。
2. **反向也要查**：设计文档里的 6 条 FR 全部在本表被认领；`test-cases.md` 的 TC-T1…TC-T11b
   逐条挂在某条 FR 上（见 `test-cases.md` §断言与用例对照），无超范围设计。
3. **每个 FR-x 必须有人接**：FR-1…FR-6 各有 2~3 张卡接收，无孤儿条款。

## 本计划的边界（不做什么）

- **不做**通用装配异常降级：`apply()` 里迁移门之外的 `throw` 一律不动（`requirement.md` §边界 第 2 条）。
  故本计划没有"统一错误处理框架"这类卡，也不预留扩展点。
- **不做**未就绪全屏页 / 重试按钮 / 自动恢复轮询（`frontend.md` §边界）。
- **不改** DSH 核心的客户端启动图过滤逻辑（跨仓）。
- **不加**任何新 HTTP 前缀、端点、SSE 帧字段，**不 bump** `REQBOARD_SCHEMA_VERSION`。
