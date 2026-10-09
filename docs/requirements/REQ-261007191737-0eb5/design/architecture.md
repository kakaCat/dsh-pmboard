# 架构设计（REQ-261007191737-0eb5）

> 需求：人工项（`needsHuman`）允许 agent 代写事实，人只做通过/退回裁决。
> 读者：零上下文的实施者——只凭本套设计 + `requirement.md` 就应能写出拆分计划并开工。

## 目标与总体方案 <!-- serves: FR-1, FR-2, FR-3 -->

把人工项的裁决口径从「**文本必须由人写**」改成「**文本可以是 agent 已写的事实 + 人确认**」，同时守住三条底线：裁决动作必须由人发起、来源必须可辨、不合格仍要拦住。

方案骨架（三句话）：

- **判据单点**：新增纯函数 `humanFactForProxy(item)` —— 只有「该项是人工项 + 开关开 + agent 的 `result` 过事实形态判据」三条同时成立时才返回可代写的文本，否则 `undefined`。判据复用既有 `hasHumanFact`（`src/domain/workflow/AcceptanceSheetSpec.ts:83`），不新写第二份正则。
- **代写落点在域层**：代理判定放在 `applyVerdicts` 里（判据与落库同址、同一次写入），于是弹框与看板**两条通道自动同口径**——看板只需放开「留空点通过」的前端拦截，不需要自己算代写、也不需要把文本回传。看板渲染侧另用同一判据置 `data-proxy-candidate="1"`，供收集侧免去手写要求（不复制正则）。
- **原子性不动**：`applyVerdicts` 的「整批先验证、后落状态」（`AcceptanceSheetSpec.ts:832` 起）保持不变；FR-4 的改善方式是**提交前就地补问**，不是半批落库。

## 模块改动地图 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 文件 | 改动 | 服务 |
|---|---|---|
| `src/domain/workflow/AcceptanceSheetSpec.ts` | ① `SheetItemLike` 增可选字段 `opinionSource?: 'agent' \| 'human'`；② 新增纯函数 `humanFactForProxy`（判据单点）；③ 新增开关读点 `humanProxyEnabled`；④ `applyVerdicts` 内解析代理文本并让它参与 `judgePassedVerdict` 与写回（`:907-940` 区段）；⑤ 来源字段与 `opinion` 同址写、`unverified` 时清 | FR-1 / FR-2 / FR-3 / FR-5 |
| `src/shared/protocol.ts` | `VerificationItem` 镜像同一可选字段（只增不改，台账序列化兼容） | FR-2 |
| `src/application/use-cases/AcceptSheet.ts` | FR-4 就地补问插在 `applyVerdicts` 调用（`:363`）之前；用 `humanFactForProxy` 判「该人工项有没有 agent 事实」。**不改** `resultOf`（`:253-264`）的既有兜底——代写由域层统一落，两条通道因此自动同口径 | FR-4 |
| `src/application/internal/verdicts.ts` | 透传 `opinionSource` 到域层写入（既有错误码映射不动，`:191-196`） | FR-2 |
| `src/domain/workflow/VerdictNotices.ts` | 新增文案单点 `humanFactRequestOf(item)`（FR-4 补问题干 + 可照抄样例） | FR-4 |
| `src/domain/workflow/VerificationDoc.ts` | 渲染 `opinion` 时对代写项加「agent 代写（人已确认）」标注 | FR-2 |
| `src/client/views/panels/verify.ts` | 行渲染（`:574-600`）：置 `data-proxy-candidate="1"` + 来源徽标 + 占位文案改写 | FR-1 / FR-2 |
| `src/client/board-mount.ts` | 收集块（`:968-1037`）：`missingHuman` 守卫只对 non-candidate 行生效；提示升级为「差什么 + 样例」 | FR-1 / FR-4 |

**不改**：`reqboard_accept_sheet` 工具入参（`src/tools/AcceptSheetTool/AcceptSheetTool.ts`）、`applyVerdicts` 的校验次序、`hasHumanFact` 词表、原型对照项的生成条件。

## 数据结构变更 <!-- serves: FR-2 -->

新增字段一个，可选、只增不改：`SheetItemLike.opinionSource?: 'agent' | 'human'`。

- `'agent'` = 这次 `opinion` 的文本取自 agent 的 `result`（人只点了通过）；
- `'human'` = 人自己写的（含人改写 agent 原文的情形）；
- 缺席 = 老台账 / 本次未产生新写入（渲染按「人写 / 未知」处理，不得猜成 agent）。

与 `resultSource` 的分工、写入与清除时机、不变量见 `design/data-model.md`。

## 接口变更 <!-- serves: FR-1, FR-2, FR-4 -->

**对外工具接口零变更**——这是刻意的：判据一处、人零输入即可成立，不需要新参数表达「我采纳 agent 文本」。内部新增三个函数（`humanFactForProxy` / `humanProxyEnabled` / `humanFactRequestOf`），签名与返回值语义见 `design/interfaces.md`。

新增的工具行为只有一处：FR-4 在弹框通道内**多问一轮**（question id = `<itemId>#human-fact`），它不改变工具入参，也不改变返回体字段。代写本身不是「新参数触发的新行为」，而是**既有「通过」裁决在人工项上的取值规则多了一档**（第 ② 档），因此两条通道无需区分。

## 依赖关系 <!-- serves: FR-1, FR-3 -->

- 域层零新依赖：判据是纯函数，只用既有 `HAS_HUMAN_FACT` 词表与字符串长度判定。
- 应用层只多一次 `env` 读取（开关），不引入时间 / IO / 随机。
- client 侧不新增依赖，用 `data-*` 属性把「渲染期算好的判据结论」传给收集侧。
- 反向依赖（谁读新字段）：看板渲染、`verification.md` 渲染、台账快照回归——三处都只读、不写。

## 关键算法/流程 <!-- serves: FR-1, FR-2, FR-4 -->

一次「通过」裁决的文本来源（**顺序固定**，命中即停；判定与落库同址，都在 `applyVerdicts` 内）：

```
人点「通过」 ──▶ verdict = { status: 'passed', opinion?: 人写的文本 }
   │
   ├─ ① verdict.opinion 非空 ─────────────────▶ 用它判定与落库        → opinionSource = 'human'
   ├─ ② 人工项 且 humanFactForProxy(item) 命中 ─▶ 用 agent 的 result   → opinionSource = 'agent'  【新增】
   └─ ③ 都没有 ───────────────────────────────▶ 不写 opinion → status = unverified(blank_pass)
```

第 ② 档放在域层而不是弹框用例里：**两条通道（弹框 / 看板）都汇聚到 `applyVerdicts`**，代写在此处落一次，看板通道不需要自己算、也不需要把 agent 文本回传。

FR-4 补问时序（仍在一次调用内，原子性不变）：

```
弹框作答收集完（verdicts 已组装）
   │
   ├─ 命中「needsHuman 且 ①②③ 都没落到文本」的项？ ── 否 ─▶ 直接 applyVerdicts
   │                                                  是
   ▼
就地补问一轮（题干含 itemId + 可照抄样例）
   │
   ├─ 人补写了 ─▶ 该项 opinion = 人写的 → 照常整批 applyVerdicts
   └─ 人没补   ─▶ 沿用今天：该项 unverified(blank_pass)，本批照今天语义落库
```

## 测试策略 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

- 新增单元/集成用例两份：`tests/needs-human-proxy.test.ts`（域判据 + 弹框路径 + 开关）、`tests/board-needs-human-proxy.test.ts`（看板渲染与收集）。用例清单见 `design/test-cases.md`。
- 回归（必须退出码 0）：`npx vitest run tests/accept-verdicts-snapshot.test.ts tests/accept-sheet-zero-input.test.ts tests/acceptance-criteria.test.ts`。
- 本仓标准自检（KB conventions）：`pnpm typecheck`（C-15）、`pnpm build`（C-11）、`pnpm build:client`（C-12，期望 `[verify-client] OK`）、`pnpm baseline:check`（C-14，判据 = 失败用例集合差为空，基线 `docs/reviews/test-baseline.md`）。
- 判据等价的穷举探针：`humanFactForProxy` 与既有 `hasHumanFact` 必须逐例一致（同一函数，不是两份实现）——用例里断言「开关开启时命中集合 = `needsHuman && hasHumanFact(result)` 的集合」。

## 错误处理 <!-- serves: FR-3, FR-5 -->

- 保留既有拒绝：人自填文本太薄（长度 ≤6 或无可核验观察词）→ 域 `invalid_input`，传输码 `opinion_required`（`src/application/internal/verdicts.ts:191-196` 映射不动）。文案与今天逐字一致。
- 代写路径**不产生新错误码**：判据不成立时不报错，只是落回今天的行为（人仍要写 / 记 `unverified`）。
- FR-4 补问**未作答不是错误**：不抛错，按今天语义落库，回执如实说该项未复核及其原因。
- 开关关闭（`DSH_REQBOARD_NO_HUMAN_PROXY` 置位）时，代写路径整段跳过，错误行为与今天逐字一致。

## 配置项 <!-- serves: FR-5 -->

| 配置 | 值域 | 默认 | 语义 |
|---|---|---|---|
| `DSH_REQBOARD_NO_HUMAN_PROXY` | 非空且非 `0`/`false` = 关；其余（含未设）= 开 | **开** | 关 = 逐字退回今天（人工项不吃 agent `result` 兜底） |

读取纪律与既有 `itemResultBindingEnabled`（`AcceptanceSheetSpec.ts:291`）同款：**只读一次**、把布尔值往下传，不在各处再读环境变量。

## 部署变更（生效链） <!-- serves: FR-1, FR-2 -->

本需求同时改 host 与 client，**改 `src/` 不构建则现场照旧**（本仓 KB `kb-0006`，出处 REQ-261001170807-06fd）：

| 层 | 构建 | 生效条件 | 验收读数 |
|---|---|---|---|
| host | `pnpm build` | 产物 `dist/index.mjs`，需**重启宿主** | `grep -c "opinionSource" dist/index.mjs` ≥ 1 |
| client | `pnpm build:client` | 产物 `lib/client.js`，看板**刷新页面** | `grep -c "data-proxy-candidate" lib/client.js` ≥ 1 |

## 文档更新清单 <!-- serves: FR-1, FR-2 -->

- 本需求设计文档 7 份（本目录）；
- 归档阶段：`docs/architecture/project-manual.md` 增「人工项代写口径与来源字段」一节；`docs/conventions.md` 视需要补一条「改 src 必须构建」已被 C-11/C-12 覆盖，不新增重复条目；
- 需求文档 `requirement.md` 的 D-1~D-4 已在需求阶段落账，本阶段不新增裁定。

## 关键决策与取舍 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 只取消「重抄」，不取消「人确认」 | 让 agent 直接把该项置 `passed`（连点击都省） | 视觉是否一致只有人能看；一旦 agent 可自置通过，人工门就等于取消（需求 D-2）。本需求的价值是**免录入**，不是免判断 |
| 新增 `opinionSource` 而不是复用 `resultSource` | 复用既有来源字段、少一个字段 | `resultSource` 描述的是「`result` 是谁填的」，而本需求要记的是「`opinion` 是谁写的」；两者可以同时存在且常常相反（agent 填 result、agent 代写 opinion、人点通过）。复用会让「谁裁决的」与「谁写的」在同一字段里互相覆盖 |
| 改判据落点（`humanFactForProxy`）而非放宽 `hasHumanFact` | 把长度阈值从 >6 降低、或加白名单词 | 阈值与观察词表是「什么算事实」的口径，放宽会连带影响人自填路径（那正是现状唯一防线）。本需求只回答「谁写的事实算数」，不动「什么算事实」 |
| FR-4 用「提交前就地补问」而不是「半批落库」 | 改掉整批原子性，让不合格项单独记 `unverified` | 「拒绝 = 台账零改动」是既有刻意纪律（`:832` 前置校验的注释即为此）；为一次体验问题破坏它，会把「哪些裁决已落库」变成需要逐项核对的不确定状态 |

## 技术方案与亮点 <!-- serves: FR-1, FR-2, FR-4 -->

- **判据单点**：代写资格只有 `humanFactForProxy` 一处实现，弹框、看板渲染、看板收集三处共用（看板经 `data-proxy-candidate` 传递结论），杜绝「两侧各写一份正则」的漂移。
- **来源可辨**：`opinionSource` 与 `opinion` 在同一次 `mutate` 内写，不存在「状态已通过、来源缺失」的中间态；看板与 `verification.md` 如实标注，不出现 agent 文本冒充人写的观察事实。
- **可回滚**：一行环境变量退回今天行为，回滚路径与既有 `DSH_REQBOARD_NO_ITEM_RESULT` 同款式，回归用例用开关两侧各跑一遍。
- **不新增对外参数**：工具入参零变更，说明判据位置正确——需要新参数才能表达的口径，通常意味着判据被放在了错误的层。
