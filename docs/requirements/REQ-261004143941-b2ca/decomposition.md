---
req_id: REQ-261004143941-b2ca
serves: FR-1, FR-2, FR-3, FR-4
---

# 拆分计划（REQ-261004143941-b2ca）

> 依据：`design/{architecture,interfaces,data-model,use-cases,test-cases}.md`（均已确认）。
> **契约卡不单列**：接口字段与落模型规则已在设计阶段定稿（`design/interfaces.md` 的
> `requirement.tokenTotal` 契约与 `FlowChartModel.tokenTotal` 规则、`design/data-model.md`
> 的同源口径与缺失语义），t1 按签名逐字实现、t2 按契约渲染；不造「把已冻结的东西再抄一遍」的空卡。
> 纪律：每卡 acceptance 必须能跑；本需求**动的是 client 源码**，构建（C-12）必须在收口卡里真跑。

## 目标

让会话头部流程图的 token 统计**不再随窗口变窄而消失**：窄档（容器 <1000px）在计数旁常显一个
「需求累计 Token 总数」，宽档保持既有「每节点 token」不变；token 口径与 `FLOW_TIERS` 档位**都不动**。

## 改动盘点

| 文件/区域 | 动作 | 归属卡 |
|---|---|---|
| `src/http/routers/stages.ts` | 修改（`handleSessionProgress`：复用同一份 `assembleRequirementToken` 视图；`nodeTokensOf` 收视图为参数；补 `requirement.tokenTotal`，仅 > 0 时写入） | t1 |
| `tests/session-progress.test.ts` | 修改（追加 TC-3a 自洽 / TC-3b 缺席 / TC-3c 兜底三例；既有用例不动） | t1 |
| `tests/progress-nodes-fallback.test.ts` | 修改（复用其兜底夹具断言 `tokenTotal` 含任务执行差值） | t1 |
| `src/client/flow-chart-model.ts` | 修改（`FlowChartInput`/`FlowChartModel` 增可选 `tokenTotal`；有限且 > 0 才落模型） | t2 |
| `src/client/conversation-progress.ts` | 修改（`ProgressPayload.requirement.tokenTotal?`；计数旁渲染 `.dsh-pm-cprog-token-total`） | t2 |
| `src/client/styles/token.ts` | 修改（徽章视觉；复用 `.dsh-pm-token-badge` 语言 + `.dsh-pm-cprog-token-ico`） | t2 |
| `src/client/styles/board.ts` | 修改（档位 D 的最小化变体：容器 <600px 隐藏 `.dsh-pm-cprog-token-ico`） | t2 |
| `scripts/header-progress-probe.mts` | 修改（标本带 `tokenTotal`；统计 `.dsh-pm-cprog-token-total` 并并入 `problems` 判定） | t3 |
| `tests/header-progress-responsive.test.ts` | 修改（追加 TC-2a~2e：落模型规则 + 源码结构断言） | t3 |
| `docs/requirements/REQ-261004143941-b2ca/evidence/` | 新增（探针红/绿输出、构建日志、真机截图路径） | t4 |

**不动**：`FLOW_TIERS` 三个阈值、`.dsh-pm-flow-token` 的档位显隐、`assembleRequirementToken` 的合计规则、
详情页 `🪙 Token` tab 链路、台账/RTM/队列存储、`requirement.tokenUsage` 的写法。

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|---|---|---|---|---|---|
| t1 | 进度接口补需求累计 token（与节点同源、缺失即不发） | implement | backend | — | FR-1 |
| t2 | 流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化） | ui | frontend | t1 | FR-2, FR-3 |
| t3 | 渲染层回归锚点：探针各档可见 token ≥ 1 | test | frontend | t2 | FR-4, FR-3 |
| t4 | 兼容/回滚验证 + 构建与基线回归（收口） | test | fullstack | t1, t2, t3 | FR-1, FR-3, FR-4 |

**并行说明**：t1（host 路由）与 t2 的**文件面不重叠**，但 t2 消费 t1 定死的字段，故 t2 `depends_on t1`
（契约先行，避免两边各拍一个字段名）；t3 依赖 t2 的 DOM（要量 `.dsh-pm-cprog-token-total`）；
t4 是链尾收口，依赖前三张全部完成。

## 覆盖对照表

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1 |
| FR-2 | t2 |
| FR-3 | t2, t4 |
| FR-4 | t3, t4 |

## 各卡验收（可证伪）

- **t1**：`./node_modules/.bin/vitest run tests/session-progress.test.ts tests/progress-nodes-fallback.test.ts` → 全绿，逐条含：
  TC-3a 同一响应内 `data.requirement.tokenTotal === Σ data.nodes[].tokens.total > 0`；
  TC-3b 需求无任何快照 → `'tokenTotal' in data.requirement === false`（**不是** 0）；
  TC-3c 兜底夹具（有任务执行差值、无 byStage）→ `tokenTotal` 含该差值。
  接口实测：`curl -s .../session/<sid>/progress` + python3 断言 `tokenTotal == Σnodes` 且 > 0（打印两值）。
- **t2**：`./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts` 全绿（含 TC-2a~2e）；
  `pnpm typecheck` 退出码 0。
  TC-2e 的结构断言必须能拦住「把徽章挪进 `.dsh-pm-flow` 里」这类回退（源码里徽章元素在 flow 之外）。
- **t3**：`./node_modules/.bin/tsx scripts/header-progress-probe.mts` → 6 行 `DIAG … tokens=<n>+<m> problems=NONE`、
  各档 `n + m ≥ 1`、末行 `PROBE PASS`、退出码 0。
  **红态自证**（必须有据）：临时移除渲染块的 `tokenTotal` 分支 → B/C/D 档 `m=0` 且 `n=0` → 退出码 1；
  把红态输出与恢复后的绿态输出**一起**存进 `evidence/`（这条是 FR-4 的可证伪证据，不许只留绿态）。
- **t4**：`pnpm build`（C-11）与 `pnpm build:client`（C-12）退出码 0，`dist/index.mjs`、`lib/client.js` 均有新产物，
  `[verify-client] OK`；`./node_modules/.bin/tsx scripts/header-progress-probe.mts` 6 档 `problems=NONE`；
  `./node_modules/.bin/vitest run tests/token-tab.test.ts tests/token-endpoint.test.ts tests/header-progress-e2e.test.ts`
  失败数 ≤ 开工基线（基线开工时实测并记进卡文档）；
  **兼容证据**：无 `tokenTotal` 的响应 → 渲染树无 `.dsh-pm-cprog-token-total`（不出现 `🪙 0`）；
  **回滚证据**：写明「删响应字段 + 删渲染块即恢复」，并核对无写盘/无 schema 变更；
  **真机证据**：重载插件后，在**宽**（视口 ≥1280）与**窄**（视口 ~1024）两种窗口各截一张会话头部图，
  窄档图里能看到累计 Token 数字（截图路径进 `evidence/`）。

## 兼容与回滚

- **旧客户端**：忽略未知字段 `tokenTotal` → 行为与改造前逐字一致（不会因为多一个字段而崩）。
- **旧需求 / 无快照**：合计为 0 → 键缺席 → 不渲染徽章（不出现 `🪙 0`）——由 t1 的 TC-3b 与 t2 的 TC-2b/2c 双向锁住。
- **旧宿主 + 新客户端**：读不到键 → 同样不渲染（t2 的缺席分支）。
- **回滚**：撤 `stages.ts` 的字段写入 + `conversation-progress.ts` 的渲染块即可回到现状；
  无写盘、无 schema 版本变更、无缓存失效、无配置开关。

## 边界（不做）

与需求文档「边界」三条一致：不改 token 口径（仍为会话快照差值 + 任务执行兜底）；**不**把子代理会话消耗
计入统计（按人裁定另立项）；**不**放宽或取消每节点 token 的宽度档位。没写进边界的即本次不做。
