# 架构总览（项目知识层 · 架构页）

> **TL;DR**：本插件是 DSH 的**双半插件**（host + client），host 侧严格四层——
> `domain`（纯领域）← `application`（用例/端口）← `adapters`（实现端口）与 `tools`/`http`（入口），
> client 侧独立自包含。**依赖只许向内**，越界由 `tests/layer-boundary.test.ts` 机械拦下。
> 本页是"改造前先读这一页"的入口：分几层、依赖往哪边、加东西落哪里。

## 分层与依赖方向 #layers

```
        ┌──────────── 入口层（薄壳，只做参数与错误映射） ────────────┐
        │  tools/  20+ 个 agent 工具    http/  看板 API 路由          │
        └───────────────────────────┬────────────────────────────────┘
                                    │ 只调用例
        ┌───────────────────────────▼────────────────────────────────┐
        │  application/  用例（立项/拆分/验收/闸门链）+ ports 端口定义 │
        └───────────────────────────┬────────────────────────────────┘
                                    │ 只用 domain 的类型与规则
        ┌───────────────────────────▼────────────────────────────────┐
        │  domain/  状态机 · 门规 · 提示词片段 · 纯函数（零 I/O）      │
        └────────────────────────────────────────────────────────────┘
                    ▲ 实现端口（I/O 只在这里）
        ┌───────────┴───────────────┐   ┌────────────────────────────┐
        │  adapters/  分片台账 ·      │   │  client/  GUI 半（自包含，  │
        │  文件文档库 · 会话探针       │   │  无外部 UI 依赖）           │
        └───────────────────────────┘   └────────────────────────────┘
```

**依赖方向（硬纪律）**：`tools/http/client → application → domain`；`adapters` 实现 `application/ports.ts` 的端口。
禁止反向，禁止 domain 碰 `node:` / 框架 / 上层模块。

## 数据层：需求台账怎么存 #data-layer

台账自 REQ-261002161439-277d 起从**单册 JSON** 改为**分片目录**（读放大治理 + 端口化的地基）。
权威设计：`docs/requirements/REQ-261002161439-277d/design/architecture.md`（数据模型变更以它为准）。

```
~/.dsh/reqboard/                         # 数据根（DSH 主目录内；插件卸载不删除）
  meta.json                              # { schemaVersion, revision, migrations[] }：小标量 O(1) 写
  requirements/<REQ>/record.json         # 热记录：标量 + 小对象 + **计数**（不含评论/产物本体）
  requirements/<REQ>/comments.jsonl      # append-only：评论
  requirements/<REQ>/history.jsonl       # append-only：状态流转与推进事件
  requirements/<REQ>/artifacts.json      # 产物登记（盖章就地改 ⇒ 整份改写，单需求有界）
  requirements/<REQ>/plan.json           # 拆分计划
  requirements/<REQ>/verification.json   # 验收材料（evidence / sheet / sheetHistory）
  requirements/<REQ>/archive.json        # 归档材料
  archive/<REQ>/…                        # 冷存：与热侧同构的目录
~/.dsh/dsh-reqboard.json                 # **导出格式**（legacy v9 单册）：运行时不读写
```

- **读取只经端口** `RequirementStore`（`src/application/ports.ts`）：`get / listSummaries / listComments /
  listHistory / head`；写经 `create / mutate / mutateIf / appendComment / sweep / replaceAll`。
- **首屏载荷只发摘要**（`GET /state`）：计数代替本体，详情走 `GET /requirements/:id`；产物扫描走
  `POST /artifacts/scan`（不再挂在读接口上）。客户端据此首屏 0 次详情请求。
- **索引不落盘**：没有索引文件，就没有"索引与分片不一致"这个议题。
- **迁移与回滚**：`migrate-ledger-v10`（v9 单册 → v10 分片）与 `rollback-ledger-v10`（反向）；
  单册在场而分片目录缺席时启动即抛 `REQBOARD_REQUIRES_MIGRATION`，绝不起空台账。

## 各层职责与"不放什么" #responsibilities

| 层 | 放什么 | 不放什么 |
|---|---|---|
| `domain/` | 状态机与转移表、门规判定、错误码、提示词片段与预算、纯格式化 | 任何 I/O、时间/随机数（一律注入）、框架类型 |
| `application/` | 用例编排、端口**定义**、内部纯逻辑（如输入包拼装、预算裁剪） | 直接 `node:fs`、**绕过端口**直接读台账分片、框架调用 |
| `adapters/` | 端口实现：**分片台账**读写（数据根 `~/.dsh/reqboard/`）、文件文档库、会话探针、任务投递 | 业务规则判定（规则在 domain，adapter 只搬运） |
| `tools/` `http/` | 参数校验、调用用例、把错误码映射成工具/HTTP 响应 | 状态字面量比较（判定只许在 domain） |
| `client/` | 视图渲染、SSE 订阅、样式分片 | 裸 npm 依赖（会被 module-loader 拒；见 C-04） |

## 关键机制落在哪 #mechanisms

| 机制 | 落点 | 一句话 |
|---|---|---|
| 需求/任务状态机 | `src/domain/requirement/RequirementStatus.ts`、`src/domain/task/TaskStatus.ts` | 合法边只有转移表里那些，其余一律拒绝 |
| 五道人工门 | `src/application/gate/*` + `tools/AskConfirmTool` | 立项/需求确认/设计确认/计划批准/验收，agent 不可越过 |
| 节点输入包 | `src/application/internal/node-input-package.ts` | 节点边界后的唯一新起点：路由提示词 + 需求文档投影 + 台账投影 |
| 注入预算与 floor | `src/domain/prompt/budget.ts` | 超预算只裁非保底片段；连保底都超 → 结构化报超限 |
| 断点续跑 | `src/domain/checkpoint.ts` + `reqboard_task_amend(op=interruption)` | 只记"跑到哪"，便于新窗口续跑 |
| 知识层 | `src/domain/knowledge/*`、`src/adapters/KnowledgeRepository.ts`、`scripts/kb-build.mts` | 索引 + 条目 + 生成物 + 只读检索（本页所在目录） |
| 客户端样式归属 | `src/client/styles*.ts` + 归属章契约 | 样式表必须自带 `data-plugin` 章，否则会被别的插件连带删除 |
| 文档读路径根 | `src/http/routers/shared.ts` 的 `resolveDocRoot` | **权威源 = 会话工作区**：会话根优先，未装配解析器（回滚开关 `docsRootSource:'legacy-cwd'`）时回落宿主 cwd；预检/读全文/阶段详情共用这一处，响应里如实标注 `docsRootSource` |
| 席位授权（一条需求多窗口） | `src/application/internal/window.ts`（`seatsOf` / `canWrite` / `firstWritableBound`）+ `src/application/internal/binding-read.ts` | 折算与判定只有一个处；`seats` 缺省按 `sourceSessionId` 折算单 owner（存量零改写）；绑定读并取「我立的 + 席位派给我的」，**看得见 ≠ 写得动**（observer 可见不可写） |

## 扩展点：加东西落哪里 #extensions

| 想加什么 | 改这些地方 | 别忘了 |
|---|---|---|
| 一个新的 agent 工具 | `src/tools/<Name>Tool/{<Name>Tool,prompt}.ts` + `src/tools/index.ts` 注册 | 工具 `description` 要短且稳定（每轮常驻成本 + 前缀缓存） |
| 一条新的看板 API | `src/http/routers/<name>.ts` + 组合根注册 | 错误码→状态码只在 http 层映射一次 |
| 一个新端口实现 | `src/application/ports.ts` 定义端口 → `src/adapters/<Name>.ts` 实现 | adapter 不许写业务判定 |
| 一个新的客户端视图 | `src/client/views/<name>.ts` + 入口挂载 + 样式分片 | 必须过 `pnpm build:client`（C-04/C-05） |
| 一条新的硬纪律 | `docs/knowledge/conventions.md` 新增 `### C-NN` 小节 | **必须挂一条真实可跑的校验**（见 C-09） |

## 改造前的三条铁律 #rules

- **先看依赖方向**：想加的代码属于哪一层？跨层调用一律先在 domain 定规则、由 application 编排。
- **判定只写一处**：状态字面量比较只许出现在 `domain/`；工具与路由只调判定函数。
- **失败要响亮**：证据缺失、预算超限、边界不平衡一律结构化报出——不许"应该没问题"。（逐条见 [规范页](conventions.md#rules)）
