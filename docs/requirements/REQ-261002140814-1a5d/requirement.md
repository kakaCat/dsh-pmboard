---
requirement_refs: [FR-1, FR-2, FR-3]
---

# 需求说明（REQ-261002140814-1a5d）

> 面向：产品、开发、测试、用户——**写给人看**。核心原则：用户能看懂。
> **人读三件套**：TL;DR + ASCII 业务流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格，禁 ①②③ 内联枚举；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：**feature**（立项弹框所答；实质是缺陷修复，改判见文末「待人工裁定」） ｜ 档位：**轻档**（依据见文末「档位依据」） ｜ 立项：2026-10-02
> 窗口：`session-496379d5-446c-4a51-9710-2fe1ce0eb676` ｜ 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

`reqboard_clear_pause`（本仓**唯一 agent 可达的解锁口**）每次成功解锁都会**同时报错**：锁真的开了（台账已改、后续操作可用），但返回值里带了一个值为 `undefined` 的属性 `previous_activation`，被 DSH 绑定层的「无损 JSON」校验整体拒收，调用方只看到一条 `value is not lossless JSON`。

后果等同于"门开了、喇叭同时喊系统故障"：agent 以为失败，可能重试或绕路；第一次用的人则不敢进。本需求把返回值收敛为无损 JSON，并顺手修掉同一函数里另一处"汇报坏了"——解锁留痕写错了字段名（写 `text`、GUI 读 `body`），解锁评论在看板上因此是空白的。

**只改"怎么汇报"，不改"解锁"本身**：dive 状态机语义、输出 schema 字段集合、工具参数形状一律不动。

## 业务流程图

```
 agent 调 reqboard_clear_pause
        │
        ▼
 ① 校验窗口绑定 → 台账写入（activation=disarmed / phase=idle / 追加解锁留痕）
        │                                        └── 留痕用了错键 text（GUI 读 body）→ 看板显示空白
        ▼  ✅ 锁已经开了（副作用已落盘）
 ② 组装返回值
        │   { success, requirement_id, previous_activation: result.previousActivation, message }
        │                                              └── mutate() 返回的是 { changed, revision }
        │                                                  没有这个键 ⇒ 恒为 undefined（TS2339 已报）
        ▼
 ③ DSH 绑定层做无损 JSON 校验（snapshotJsonValue / walkJsonValue）
        │
        ├── undefined 既非 null/boolean/string/number 也非 object ──► 整体拒收
        │        └──► agent 看到 "value is not lossless JSON" ❌（副作用已发生，报错纯属误报）
        │
        └── 全部为 JSON 值 ──► 正常回执（含 previous_activation）✅ ← 本需求目标态
```

## 现场证据（三类，可复核）

| # | 证据 | 内容 |
|---|---|---|
| 1 | 用户实测（2026-10-02） | 按「解锁」→ 锁真的开了（后续手动操作成功），**同时**收到 `value is not lossless JSON` |
| 2 | 类型级铁证（本仓 `pnpm typecheck`，2026-10-02 复跑） | `ClearPause.ts(96,33): error TS2339: Property 'previousActivation' does not exist on type 'MutateResult'`；该文件另有 53/54/77/95/97 共 5 行错误（其中 77 行即 `text` 键） |
| 3 | 历史留痕（此前已被如实记下，只是没人补卡） | `docs/requirements/REQ-261002120707-deab/retro.md:13`「解锁实际生效，报错只是返回体序列化缺陷，可另立需求」；`REQ-261002110908-81d0/reviews/eval-independent-2026-10-02.md:43`「功能修好了、输出契约没修好，建议补一张小卡」 |

复核命令：

- `pnpm typecheck 2>&1 | grep ClearPause` —— 修前 6 条错误（含 TS2339），修后应无输出
- `grep -n "previousActivation\|text:" src/application/use-cases/ClearPause.ts` —— 修前：变更器 return 该键、用例从 mutate 结果读该键、留痕写 `text`

## 根因

`ReqboardRepository.mutate` 的契约（[ports.ts:78](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/ports.ts#L78)）是：**变更器**返回 `LedgerChange | undefined`（说明"改了什么"）；**方法本身**返回 `MutateResult = { changed, revision }`。ClearPause 把它当成了"回传自定义值"的通道：

1. 变更器 `return { previousActivation }`——不是 `LedgerChange`（TS：「与 LedgerChange 无共同属性」），且 mutate 并不回传它；
2. 用例 `previous_activation: result.previousActivation` 从 `MutateResult` 上读一个不存在的键 ⇒ **恒为 `undefined`**（不是偶发，是必然）；
3. 返回对象因此带 own property `previous_activation: undefined`；
4. dsh-tools 绑定层用 `snapshotJsonValue` → `walkJsonValue`（`@deepseek-ai/dsh-util-values`）做无损 JSON 校验：`undefined` 不属于任何 JSON 值类型 ⇒ 整个返回值被转成无信息的硬错误。

同一行还有第二个后果：`dive-cleared` 的 `LedgerChange.requirements` 是空数组（变更器没返回 `requirements`）。今天无可见影响（唯一订阅者只认 `requirement-moved`），但它违反端口契约，与上面是同一处根因，一并修。

留痕写错字段（77 行）是独立的第二处"汇报坏了"：`CommentRecord` 只有 `body`，看板渲染读的也是 `c.body`（[dom-utils.ts:254](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/client/render/dom-utils.ts#L254)、[stage-panel.ts:242](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/client/stage-panel.ts#L242)）⇒ 解锁评论写进去了、但渲染为空。

## 产品定义

| 问题 | 答案 |
|---|---|
| 这个工具是什么 | `reqboard_clear_pause`：把需求的 Dive 自动流程置为 `disarmed`（解锁），让 agent 能在该需求上手动拆分/推进；也是死锁时的**唯一 agent 可达出口** |
| 对外契约 | 成功即 `success:true` + 人话 message，且返回体是**无损 JSON**（JSON 往返不丢信息）、与已发生的副作用**一致**：锁开了就不许报错 |
| 失败语义 | 未绑定需求 / 需求不属本窗口 / 数据冲突 → 抛带 code 的结构化错误（`REQBOARD_NO_BOUND_REQ` / `REQBOARD_NOT_BOUND_TO_WINDOW` / `REQBOARD_MUTATION_FAILED`），不写盘 |
| 留痕语义 | 每次成功解锁追加一条评论，正文写解锁前的 activation，供人回看"谁在什么时候解了锁" |
| 本次改什么 | 只改"怎么汇报"：返回体形状 + 留痕字段名 |
| 本次不改什么 | 解锁语义（写哪些字段、写什么值）、输出 schema 的字段集合、工具描述与参数形状 |

## 用户与角色

| 角色 | 关心什么 | 本次改动带来的变化 |
|---|---|---|
| 驾驶 reqboard 的 agent（主用户） | 返回值能否指导下一步；"报错"是否意味着要重试 | 解锁成功后拿到正常回执（含 `previous_activation`），不再误判失败、不再无谓重试 |
| 用看板的人 | 解锁有没有留痕、能不能看懂 | 解锁评论在看板上可见（此前字段写错 → 显示为空），可回看解锁前状态 |
| 插件维护者 | 同类缺陷会不会再溜过门禁 | 契约门禁补上"值为 undefined 的属性"这一格，同类缺陷不再全绿通过 |

## 功能点

- **FR-1: 解锁成功的返回体是无损 JSON**——可选字段在缺值时**整体省略**，绝不出现值为 `undefined` 的属性；`previousActivation` 在变更器内捕获（或从写前快照读），**不得**再从 `mutate()` 的返回结果上读；变更器按端口契约返回 `LedgerChange`（`{ requirements: [req] }`）。
- **FR-2: 解锁留痕写入 `body` 字段**——`req.comments.push(...)` 使用 `CommentRecord.body`（现值写的是 `text`，GUI 读 `body` ⇒ 评论渲染为空）；**不迁移**已写坏的历史评论、也不加宽容读回退。
- **FR-3: 回归用例 + 门禁补洞**——新增用例断言"成功路径返回体无 `undefined` 属性、解锁语义不变、留痕在 `body`"（修前必红）；`tests/output-contract.test.ts` 的契约断言不再把 `obj[k] === undefined` 当合法省略（该豁免正是本缺陷能全绿溜过门禁的原因，[output-contract.test.ts:100-103](/Users/mac/Documents/ai/dsh/dsh-pmboard/tests/output-contract.test.ts#L100-L103)）。

## 边界

| 类别 | 内容 |
|---|---|
| 做 | FR-1 / FR-2 / FR-3；改动集中在 `src/application/use-cases/ClearPause.ts`、新增回归用例文件、`tests/output-contract.test.ts` 的断言口径（必要时含该文件的故障注入反向自检） |
| 不做 | ① **不改 dive 状态机语义**：activation / phase / roundsInStage 的写入规则、立项仍置 armed，一律不动；② **不改输出 schema 的字段集合**：`previous_activation` 仍是声明字段，只是缺值时省略；工具描述与参数形状不动；③ **不做数据迁移、不加宽容读回退**：已写坏的 `text` 评论不管，历史台账不回填 |
| 不做（续） | ④ **不顺手改其它工具**：若 FR-3 的门禁加固暴露出别处的同类缺陷（本仓已知 `AdvanceTool` / `QueryRunStatus` / `rtm-health` 三处同口径已修），只**登记为发现**写进验收材料，不在本需求里修；⑤ 不修 `pnpm typecheck` 里其它文件的 188 条历史错误 |

## 判定标准（可证伪）

判定标准挂可跑命令；仓库既有约定见 `reqboard_kb(kind='standard')` 的 C-14（测试与基线比对）、C-15（改动文件零类型错误）、C-11（发版前构建）。

| # | 判定 | 命令 / 观察点 | 修前 | 修后 |
|---|---|---|---|---|
| D1 | 成功路径返回体无 `undefined` 属性，且 armed 需求解锁后含 `previous_activation` | `npx vitest run tests/clear-pause-lossless.test.ts` | **红**（own property 值为 undefined） | 绿 |
| D2 | 解锁语义不变：`armed → disarmed / idle`，且恰好新增一条留痕 | 同上用例内的台账断言 | 绿 | 绿（守住回归） |
| D3 | 留痕字段是 `body`：`comments.at(-1).body` 有文字，且该对象无 `text` 键 | 同上用例断言 | **红** | 绿 |
| D4 | 门禁拦得住"值为 undefined 的属性" | `npx vitest run tests/output-contract.test.ts`（含注入 undefined 必红的反向自检） | 绿（豁免使其漏过） | 绿且反向自检为红 |
| D5 | 本文件类型错误清零（C-15） | `pnpm typecheck 2>&1 \| grep ClearPause` | 6 条 | 0 条 |
| D6 | 全量测试不高于基线（C-14） | `pnpm test`：失败数 ≤ 基线 106，且新增用例全绿 | — | 通过 |
| D7 | 端到端（人工，需 `pnpm build` 后重载插件，C-11） | 在 armed 需求上真调 `reqboard_clear_pause` → 回执含 `previous_activation:"armed"`、**无报错**；看板阶段评论能看到这条解锁留痕 | 报错 | 正常 |

## 档位依据（轻档）

- **改动面小**：1 个用例文件 + 1 个新增测试文件 + 1 处测试断言口径；无新增模块、无接口签名变更、无数据模型变更。
- **无新决策点**：修法唯一——把值在变更器里取出来、缺值就省略键、留痕改字段名；不存在需要人裁的岔路。
- **单向升级**：一旦出现下列任一信号，**立即停手并升级为重档**——需要动 `mutate` 端口契约本身 / 需要让 schema 表达 `string | null` / 需要迁移历史台账数据 / 门禁加固引发的连锁修复超出"登记发现"。

## 待人工裁定（确认时请一并给意见）

- **类型是否维持 feature**：本次实质是缺陷修复，`bug` 类型的文档集（复现步骤 / 根因 / 回归）比 feature 的（产品定义 / 用户与角色 / 功能点 + 5 份设计文档）更贴。立项弹框所答为 feature，本文已按 feature 的必填节撰写；若改判 bug，请在确认时说明——**改类型是人的决定，agent 不自行改**。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t3、t5 |
| FR-2 | ✅ 已接收 | t3、t5、t2 |
| FR-3 | ✅ 已接收 | t3、t5、t4 |

> 无未接收条款（3 条全部有落点）。

<!-- reqboard:marks:end -->
