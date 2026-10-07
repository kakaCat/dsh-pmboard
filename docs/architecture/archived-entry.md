# 归档需求的可回看入口（L2 领域篇）

> **TL;DR**：归档**不是**把数据收走，而是"移出进行中视野、始终可回看"。看板的可见性由**两个投影**
> 决定：`toReqCards`（进行中，泳道只认它）与 `toTerminalCards`（归档 ∪ 取消，只喂底部归档条与列表终态组）。
> 归档需求详情一律**只读**：DAG 与任务表照常渲染，但不出现任何会失败的操作按钮。

**来源**：REQ-261002105242-a3fb（2026-10-02）。

## 为什么需要它（根因备忘）

用户的原始困惑是一句话：「归档后 DAG 的数据会被收回吗？我看不到 DAG 的数据展示了。」
三层事实都指向"数据没丢"：

| 层 | 归档后的事实 | 复核方式 |
|----|-------------|---------|
| 盘上 | `queue.json` 原样保留（锚点需求 39 张卡一张不少） | `python3 -c "import json;print(len(json.load(open('docs/requirements/REQ-261001213924-1441/queue.json'))['tasks']))"` |
| 接口 | `GET /api/reqboard/state` 用 `listAll()` 返回**全量**任务，不按需求状态过滤 | `curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state` → 29 需求 / 553 任务（21 条归档） |
| 渲染 | `buildReqDetail` 对 `archived` 照常渲染执行 Tab + DAG 画布 | `npx vitest run tests/archived-entry.test.ts` 的 A2 |

**真正的失效点只有一个：入口**。`toReqCards()` 把 `archived` / `canceled` 全滤掉，泳道与列表都走它，
于是归档需求在看板上**零卡片**——点不进去，DAG 再完整也没人看得见。当时 `.dsh-pm-archived-bar`
的 CSS 还在，渲染代码从未接上（"只活了一半"），列表视图的终态分组也因此成了**死分支**
（`finished` 从已被过滤的 `cards` 里挑 archived，永远挑不到）。

## 契约

```
state.requirements（全量，含终态）
      |
      +-- status ∉ {archived, canceled} --> toCard --> toReqCards  --> 泳道（进行中）
      +-- status ∈ {archived, canceled} --> toCard --> toTerminalCards --+--> 泳道底部归档条（<details> 默认折叠）
                （按 updatedAt 降序）                                     +--> 列表「已完成 / 已归档」分组
```

| 约束 | 内容 | 为什么 |
|------|------|--------|
| 单一构造点 | `toCard(state, req)` 私有，两个投影都由它派生 | 归档条的 `done/total` 与详情统计卡不可能对不上（本仓反复吃过的"两份真相"） |
| 归档不进泳道 | 泳道只认 `toReqCards` | 「已归档不进进行中视野」是既有裁定，本机制不倒退它 |
| 一个视图一个入口 | 泳道给归档条，列表给终态分组，二者不在同一视图重复 | 同一份东西给两个入口只会让人怀疑哪个是真的 |
| 条目动作复用 | chip 走既有 `data-action="open-req"` + `data-req` | 不新增事件类型；点开就是需求详情那条路 |
| 默认折叠 | `<details>` 不带 `open` | 回看是低频动作，不占泳道空间 |
| 条数受控 | `ARCHIVED_CHIPS_MAX = 100`，超出只提示不静默截断 | 折叠态零成本，但 DOM 不是免费的 |
| 终态只读 | `renderActionBar` 对 `archived / canceled / done` 早退返回 `''` | 改造前是"switch 恰好没有分支"的巧合，两个反例真能发生：canceled + 未批准计划 → 渲染「批准计划」；legacy done + 材料已备 → 渲染「归档」（端点已随 REQ-9f4a44 移除，点了必 404） |

## 为什么不做归档快照

归档时把任务复制一份存档看似"稳妥"，实际会造出**第二份真相**：详情页画的是哪一份？副本过期了谁负责？
本机制的前提是"数据本来就在"，所以只做**入口与只读口径**，零持久化变更、零迁移，回滚就是
`git revert` + `pnpm build:client`（仓库规范 C-12）。

## 判据（可跑）

| 断言 | 命令 | 通过条件 |
|------|------|----------|
| 归档区可见且不进泳道 / 列表终态组含归档 / 终态只读 | `npx vitest run tests/archived-entry.test.ts` | 14 例全绿 |
| 真实数据端到端（归档条 → 点开 → DAG + 任务表 + 零操作条） | `npx tsx docs/requirements/REQ-261002105242-a3fb/evidence/probe-archive-entry.mts` | exit 0 |
| 僵尸归档入口零残留 | `grep -rn "archiveReq\|archive-req" src` | 无输出 |

## 归档条的来源标注：三态与「在别处」（2026-10-06，REQ-261006201841-944d）

**根因**：归档条原先只显示 `id + 标题 + done/total`。归档记录分属不同项目（本仓 / `dsh-notice-webhook` /
`quantsys-v2` / 少数无根），**根不在本仓的那些条目点开是一片空白**——人第一反应是"文件丢了"。

**三态判据**（服务端**一处**派生，`src/application/internal/requirement-origins.ts`；取根与同项目判定
都走既有单点 `rootOfRequirement` + `sameProjectRoot`，不新造项目身份判定）：

| 态 | 判据 | 呈现 |
|----|------|------|
| `local` | 解析出的根 == 当前工作区根 | 极轻纯文字「本仓」（信息量为零，不抢眼） |
| `elsewhere` | 根解析成功、但不是当前项目 | 「别处·<项目名>」+ `data-project`（身份感来自**名字**，不是颜色） |
| `unknown` | 记录既无 `projectId` 也无 `workspaceRoot` | 「归属未知」+ 警示令牌 + 虚线边框（**不冒充本仓**） |

**取数与降级**：`/state` payload 带 `origins`（**只算本页** `page.items`，不整册扫）；
客户端 `renderArchivedBar(cards, limit, origins?)`；`origins` 缺键或缺整参（旧服务端 / 旧 bundle）
→ **不渲染标注**，输出与改动前**逐字节相同**。`elsewhere` 缺项目名时写「未命名项目」——**不编造名字**。

**不越界**：只把「在别处」**说清楚**，**不去读别的项目工作区**（跨项目读文件涉及权限与一致性，另立需求）。

**判据（可跑）**：

| 断言 | 命令 | 通过条件 |
|------|------|----------|
| 服务端三态 + 客户端渲染 + 缺参降级 | `npx vitest run tests/board-archived-origins.test.ts` | 28 例全绿 |
| 构建新鲜度（新增选择器**恰好 4 条**，只用既有令牌） | `pnpm build:client && node scripts/verify-client-build.mjs` | OK（bundle 含新 class） |
| 视觉对照（**人看**） | 打开 `docs/requirements/REQ-261006201841-944d/prototypes/archive-source-label.html` 的 §1～§3，与本仓归档条逐态比对 | 无差异，或差异已写明 |

## 已知次优

1. **归档条不分页**：超 100 条只渲染前 100 条 + 「另有 N 条未显示」（当前台账 21 条归档，离上限尚远）。
2. **列表视图归档行在后续页**：默认 10 条/页，要翻到「已完成 / 已归档」组；常驻入口是泳道底部归档条。
3. **`canceled → archived` 仍无 UI 入口**：状态机允许，但全站没有入口——属既有缺口，本机制未新增（也不因"少了个按钮"给 legacy `done` 开新出口）。
