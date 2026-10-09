# 接口设计（REQ-261007191737-0eb5）

> 契约定死在此：函数签名、返回值语义、台账字段、DOM 属性、错误码。
> 定不死的项在这里写「不适用」并给理由，不留待实施期临场决定。

## 接口清单 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 接口 id | 形态 | 职责 | serves |
|---|---|---|---|
| IF-1 | 纯函数（domain） | `humanFactForProxy(item)` —— 判定该人工项能否由 agent 事实代写，命中则返回可采纳文本 | FR-1, FR-3, FR-5 |
| IF-2 | 纯函数（domain） | `humanProxyEnabled(env)` —— 回滚开关读取（唯一读点） | FR-5 |
| IF-3 | 纯函数（domain） | `humanFactRequestOf(item)` —— FR-4 补问题干文案（含 itemId 与可照抄样例） | FR-4 |
| IF-4 | 台账字段（数据契约） | `SheetItem.opinionSource` —— 裁决文本来源，`'agent' \| 'human'`，可选 | FR-1, FR-2 |
| IF-5 | 域内裁决路径（domain） | `applyVerdicts` 的「通过」取值多一档：文本为空且人工项代理命中 → 用 agent 文本，来源记 `'agent'` | FR-1, FR-2, FR-3 |
| IF-6 | DOM 属性契约（client） | `data-proxy-candidate="1"` —— 渲染期算好的「可代写」结论，收集侧据此免去手写要求 | FR-1, FR-4 |
| IF-7 | 渲染契约（domain/client） | 代写项在 `verification.md` 与看板行显示「agent 代写（人已确认）」 | FR-2 |
| IF-8 | 工具接口 | `reqboard_accept_sheet` —— **入参与返回体零变更**（见下节） | FR-1, FR-4 |

## 新增/修改的工具接口 <!-- serves: FR-1, FR-4 -->

### reqboard_accept_sheet（`src/tools/AcceptSheetTool/AcceptSheetTool.ts`） <!-- serves: FR-1 -->

| 参数 | 变更 | 说明 |
|---|---|---|
| `requirement_id` | 无 | 既有 |
| `batch_size` | 无 | 既有 |
| `version` | 无 | 既有 |

**为什么不动入参**：代写资格是「台账里的既成事实 + 人点了通过」推出的确定结论，不需要调用方多传一个「我采纳 agent 文本」的开关；需要新参数才能表达的口径，通常说明判据被放在了错误的层。返回体同样零变更：代写成功仍走既有 `recorded/passed/…` 字段，FR-4 补问未作答也仍走既有 `unverified` 读数。

**行为变更两处，签名零变更**：① 既有「通过」裁决在人工项上多一档取值（IF-5，域层落一次，两条通道共享）；② 弹框通道在同一次调用内**多问一轮**，question id = `<itemId>#human-fact`（与既有 `<itemId>#result`、`<itemId>#change-reason` 同构，不新增前缀体系）。

## 内部函数契约 <!-- serves: FR-1, FR-3, FR-4, FR-5 -->

```ts
// IF-1 · src/domain/workflow/AcceptanceSheetSpec.ts
humanFactForProxy(item: Pick<SheetItemLike, 'needsHuman' | 'result'> , enabled?: boolean): string | undefined
// 命中（返回 result.trim()）：needsHuman === true 且 enabled（缺省取 humanProxyEnabled(env)）且 hasHumanFact(result)
// 未命中（返回 undefined）：非人工项 / 开关关 / result 缺失或空白 / result 不过事实形态判据
// 纯函数、零 IO；判据复用 hasHumanFact，不新写正则

// IF-2 · 同文件
humanProxyEnabled(env: Record<string, string | undefined>): boolean
// DSH_REQBOARD_NO_HUMAN_PROXY 非空且非 '0'/'false' → false（回今天）；其余 → true
// 与 itemResultBindingEnabled（:291）同款式：只读一次、把布尔值往下传

// IF-3 · src/domain/workflow/VerdictNotices.ts
humanFactRequestOf(item: Pick<SheetItemLike, 'id' | 'criterion' | 'needsHuman' | 'humanReason' | 'result'>): string
// 返回 FR-4 补问题干：含 itemId、「已有一条 agent 记录的事实」说明、以及一句可照抄样例
// 非人工项返回空串（调用方据此不补问）

// IF-5 · src/domain/workflow/AcceptanceSheetSpec.ts · applyVerdicts 内（不是对外接口，是裁决取值规则）
// 第 ② 档：verdict.status === 'passed' 且 verdict.opinion 为空 且 humanFactForProxy(item) 命中
//   → 用代理文本参与 judgePassedVerdict（判据）与写回（item.opinion / item.opinionSource = 'agent'）
// 副作用范围：只写该项的 opinion / opinionSource / status / decidedAt / decidedBy / unverifiedReason
// 不变量：写 opinion 与写来源同址；记 unverified 时删除来源（data-model I-2）
```

## 台账字段契约 <!-- serves: FR-2 -->

见 `design/data-model.md`：`opinionSource?: 'agent' | 'human'`（可选、只增不改），写入点唯一（`applySheetVerdicts` 落 `opinion` 处），不变量 I-1~I-4。

## 看板 DOM 契约 <!-- serves: FR-1, FR-2, FR-4 -->

| 属性 / 节点 | 取值 | 谁写 | 谁读 | 语义 |
|---|---|---|---|---|
| `data-needs-human` | `"1"` / 缺省 | 渲染侧（既有） | 收集侧（既有） | 该项是人工项 |
| `data-proxy-candidate` | `"1"` / 缺省 | 渲染侧（`verify.ts`，用 `humanFactForProxy`） | 收集侧（`board-mount.ts`） | 该项**可代写**：收集侧不再要求人写文本 |
| `data-item-id` | 验收项 id | 渲染侧（既有） | 收集侧（既有） | 点名用 |
| 来源徽标 | 文本「agent 代写（人已确认）」 | 渲染侧 | 人（界面） | 代写项可见来源（I-1 的界面投影） |

采集侧判定（唯一实现，`board-mount.ts:991-1034`）：`status==='passed' && needsHuman && opinion 为空 && data-proxy-candidate !== '1'` → 计入 `missingHuman` 并拦下提交；`data-proxy-candidate === '1'` 时留空合法（后端走 IF-5 代写）。

## 错误码契约 <!-- serves: FR-3, FR-5 -->

| 情形 | 域码 | 传输码 | 变更 |
|---|---|---|---|
| 人自填文本太薄（人工项） | `invalid_input` | `opinion_required` | **不变**（文案逐字保留） |
| 系统项通过没写有效处置 | `system_item_disposition_required` | 同名 | 不变 |
| 代写未命中（无事实文本） | —— | —— | 不报错：落 `unverified(blank_pass)`，与今天一致 |
| FR-4 补问未作答 | —— | —— | 不报错：按今天语义落库 |
| 并发冲突（同单两处裁决） | `REQBOARD_STORE_INCONSISTENT` | 同名 | 不变（乐观锁既有） |

## 关键决策与取舍 <!-- serves: FR-1, FR-4, FR-5 -->

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 工具入参与返回体零变更 | 加一个 `proxyHumanFact: true` 参数 | 判据可从台账推出，加参数等于把「什么算事实」的判断搬到调用方，两处口径必漂移（需求 D-2） |
| 看板用 `data-*` 属性传判据结论 | 在收集侧再跑一次 `hasHumanFact`（client 复制正则） | 复制正则 = 第二份真相；渲染侧已经算过一次，属性化传递最省且不可能不一致 |
| FR-4 补问复用 `<itemId>#…` 命名体系 | 新开一套 question id 前缀 | 既有 `#result` / `#change-reason` 已被弹框与用例识别，同构命名不需要改客户端的解析习惯 |
| 不新增/不改错误码 | 为「代写失败」造一个码 | 代写不成立不是错误，是「今天的行为」；造码会让人以为必须处理（需求 D-3 的口径延续） |

## 技术方案与亮点 <!-- serves: FR-1, FR-2 -->

- **一个判据、四处消费**：IF-1 是唯一实现，弹框（IF-5）、看板渲染（IF-6 的产生方）、看板收集（IF-6 的消费方）、文档渲染（IF-7）都从它取结论。
- **契约可测**：IF-1/IF-2/IF-3 都是纯函数，用例可直接穷举输入组合（见 `design/test-cases.md` TC-1~TC-4）。
