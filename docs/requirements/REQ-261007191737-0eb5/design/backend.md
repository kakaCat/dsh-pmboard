# 后端设计（REQ-261007191737-0eb5）

> 本需求的「后端」= 插件 host 侧：域层判据（`src/domain/workflow/AcceptanceSheetSpec.ts`）+ 应用用例
> （`src/application/use-cases/AcceptSheet.ts`）+ 域→用例之间的错误码映射（`src/application/internal/verdicts.ts`）。

## 服务与接口实现 <!-- serves: FR-1, FR-2 -->

| 层 | 位置 | 做什么 |
|---|---|---|
| 域·判据 | `src/domain/workflow/AcceptanceSheetSpec.ts` | 新增 `humanFactForProxy`（IF-1，复用 `hasHumanFact` :83）、`humanProxyEnabled`（IF-2）、`SheetItemLike.opinionSource`（IF-4） |
| 域·裁决 | 同文件 `applyVerdicts`（:832 起） | 「通过」取值多第 ② 档（代理文本）；`judgePassedVerdict`（:907）吃代理文本；写回处（:936 / :938）同址写来源；`unverified` 时清来源 |
| 域·文案 | `src/domain/workflow/VerdictNotices.ts` | `humanFactRequestOf(item)`（IF-3）：FR-4 补问题干（含 itemId + 可照抄样例） |
| 域·渲染 | `src/domain/workflow/VerificationDoc.ts` | 代写项在验收结果表渲染「agent 代写（人已确认）」（IF-7） |
| 应用·用例 | `src/application/use-cases/AcceptSheet.ts` | FR-4：在 `applyVerdicts` 调用（:363）之前发一轮补问；**不改** `resultOf`（:253-264） |
| 应用·映射 | `src/application/internal/verdicts.ts` | 透传：不新增错误码，既有 `invalid_input → opinion_required` 映射（:191-196）不动 |
| 协议 | `src/shared/protocol.ts` | `VerificationItem` 镜像 `opinionSource`（可选） |

## 数据流 <!-- serves: FR-1, FR-2, FR-4 -->

```
agent ──reqboard_submit(kind=verification)──▶ 验收单 item{result:'与原型一致；差异…', needsHuman:true}
                                                        │
人 ──弹框第1问「通过」+ 第2问留空──┐                     │
人 ──看板勾「通过」+ 输入框留空 ────┴──▶ verdict{status:'passed', opinion 缺省}
                                                        │
                                            applyVerdicts（唯一汇聚点）
                                                        │
                    ① opinion 非空？ ──是──▶ 用它判定 + 落库，来源='human'
                    ② 人工项 且 humanFactForProxy 命中？ ──是──▶ opinion=result，来源='agent'
                    ③ 都没有 ──▶ status='unverified'（blank_pass），不写 opinion
                                                        │
                              verification.json · sheet.items[i]{opinion, opinionSource}
                                                        │
                        ┌───────────────────────────────┴──────────────────────────┐
                verification.md 渲染（IF-7）                                 看板行渲染（IF-6/IF-7）
```

## 关键逻辑 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

### S-1 代写判定与取值（`humanFactForProxy` + `applyVerdicts` 第 ② 档） <!-- serves: FR-1, FR-3, FR-5 -->

```ts
// 判据（IF-1）：三条同时成立才给文本，否则 undefined
function humanFactForProxy(item, enabled = humanProxyEnabled(process.env)): string | undefined {
  if (!enabled) return undefined                    // 开关关 → 逐字回今天（FR-5）
  if (item.needsHuman !== true) return undefined    // 只管人工项（FR-3 的边界：普通项走既有锚点判据）
  const t = (item.result ?? '').trim()
  return hasHumanFact(t) ? t : undefined            // 复用既有词表与长度判据，不新写正则
}
```

在 `applyVerdicts` 的落状态循环里，**判定与写入同址**：

```ts
const hasOpinion = (verdict.opinion ?? '').trim().length > 0
const proxy = verdict.status === 'passed' && !hasOpinion ? humanFactForProxy(item) : undefined
const effective = proxy ?? verdict.opinion            // 代理文本参与判定
const judged = judgePassedVerdict({ item, ...(effective !== undefined ? { opinion: effective } : {}) })
// …落 status（既有分支不动）…
if (hasOpinion) { item.opinion = verdict.opinion; item.opinionSource = 'human' }
else if (proxy !== undefined) { item.opinion = proxy; item.opinionSource = 'agent' }   // 【新增·第②档】
else if (verdict.status === 'passed' && hasResult && !needsHumanNeedsText) item.opinion = item.result
```

注意：**既有 `needsHumanNeedsText`（:907）那条「人工项不吃 `result` 兜底」保持不变**——第 ② 档不是兜底，而是「判据成立才采纳」，两者语义不同，不可合并。

### S-2 来源字段写入与清除 <!-- serves: FR-2 -->

- 写：只在 S-1 的两个分支内写 `opinionSource`，与 `opinion` 同一行前后，保证同生共死（`data-model.md` I-4）。
- 清：`judged.status === 'unverified'` 的降级分支里 `delete item.opinionSource`（与既有的 `unverifiedReason` 写法同址），避免「未复核却带着来源」。
- 人改写 agent 原文（覆盖路径，REQ-261006201920-2adc）仍记 `'human'`：现状由应用层补问 `#change-reason` 后写回，来源判定只看「文本是不是人给的」，不看它是否等于 agent 原文。

### S-3 FR-4 就地补问（时序与原子性位置） <!-- serves: FR-4 -->

```
AcceptSheet（弹框通道）
  ├─ deps.questions.ask(逐项两问)            ← 既有
  ├─ 组装 verdicts（:265-284）                ← 既有
  ├─ 【新增】挑出「needsHuman 且 humanFactForProxy 未命中 且 人没写文本」的项
  │     └─ ask(每项一问, id = `<itemId>#human-fact`, 题干 = humanFactRequestOf(item))
  │           人补写了 → 该项 verdict.opinion = 补写文本（来源 'human'）
  │           人没补   → verdict 保持无 opinion（后面按今天落 unverified）
  └─ applyVerdicts（:363）                     ← 既有，位置与语义都不变
```

- 补问**只发一轮**，且只针对命中的项；没有命中项时零行为变化。
- 补问发生在 `applyVerdicts` 之前，**不改变**「整批先验证、后落状态」的原子性：任何一个非法项仍然会让本批零落库（`verification.json` 逐项 status 不变）。
- 弹框通道不可用 / 调用方无弹框权限时行为与今天一致（返回 `fallback=board`）。

### S-4 看板通道（渲染置候选 → 收集放行 → 域层代写） <!-- serves: FR-1, FR-4 -->

1. 渲染（`src/client/views/panels/verify.ts`）：人工项且 `humanFactForProxy` 命中 → 该行 `data-proxy-candidate="1"`，显示来源徽标与「留空将采纳 agent 记录的事实」占位文案。
2. 收集（`src/client/board-mount.ts:991-1034`）：`missingHuman` 判定加一条 `data-proxy-candidate !== '1'`；命中候选的项留空合法。
3. 落库：HTTP 路径最终仍调 `applyVerdicts`，由 S-1 第 ② 档代写。**看板不计算、不回传 agent 文本**，因此两条通道不可能得出不同结论。

### S-5 文档与看板来源渲染 <!-- serves: FR-2 -->

- `VerificationDoc.ts`：渲染该行结论时，若 `opinionSource === 'agent'`，在结论后加「（agent 代写，人已确认）」；缺失或 `'human'` 时不加。
- 看板行：徽标只在 `data-proxy-candidate === '1'` **或** 台账 `opinionSource === 'agent'` 时出现（前者=本次可代写，后者=已代写落库）。
- 两处都不改既有列的语义：`opinion` 原文照旧渲染，来源只作标注（不拼进文本）。

## 错误处理 <!-- serves: FR-3, FR-5 -->

| 情形 | 行为 | 与今天的关系 |
|---|---|---|
| 人自填文本太薄 | 域 `invalid_input` → 传输 `opinion_required`，点名 itemId + 样例 | 不变（文案逐字保留） |
| 代理未命中（无 `result` / 判据不过） | 不报错，落 `unverified(blank_pass)` | 不变 |
| FR-4 补问未作答 | 不报错，按今天语义落库 | 新增一次问，落库结果不变 |
| 补问通道异常（超时 / 中断） | 与既有两问同一处理：不记录裁决，回执写明是工具故障还是用户取消 | 复用既有分支 |
| 并发冲突 | `REQBOARD_STORE_INCONSISTENT`（乐观锁：`status` + `sheet.version`） | 不变 |

## 数据库设计 <!-- serves: FR-2 -->

| 项 | 结论 |
|---|---|
| 改表 / 改 schema | 无 DDL。台账是 JSON 文件（`~/.dsh/reqboard/requirements/<REQ>/verification.json`），本次仅新增一个**可选**字段 `sheet.items[].opinionSource` |
| 迁移 | 无脚本、无回填；字段在下一次裁决写入时自然出现 |
| 回滚 | `DSH_REQBOARD_NO_HUMAN_PROXY=1` 停止新增；已写入的 `'agent'` 保留（只读字段，不参与判定，回滚后不影响行为） |
| 索引 / 约束 | 不适用：无查询索引；不变量 I-1~I-4 由写入点保证（见 `data-model.md`） |

## 性能考量 <!-- serves: FR-1 -->

- 判据是纯函数、零 IO；`result` 长度受既有 `RESULT_MAX_CHARS` 约束，正则匹配成本可忽略。
- FR-4 补问只在命中时发生，最坏多一轮弹框往返（人机交互，不是热路径）。
- 无新增磁盘读写：台账本来就是每次裁决整条 `mutate`。

## 安全设计 <!-- serves: FR-3 -->

**核心命题**：代写不得变成「agent 可以自己把人工项置为通过」。逐条排查 agent 侧可达路径：

| 路径 | 结论 |
|---|---|
| `reqboard_submit(kind=verification)` 写 `needsHuman` / `result` | 只写**输入材料**，不改 `status`；验收单生成时该项 `status='pending'` |
| `reqboard_move` / `reqboard_task_move` | 不触碰 `sheet.items[].status` |
| 域层代理（S-1） | 只在 `verdict.status === 'passed'` 时生效，而 `verdict` 只能由**裁决入口**（弹框由人生成、看板由人点击、HTTP 裁决路由带人类会话）产生 |
| 直接改台账文件 | 越出本插件能力面（等同伪造证据）；不在本设计的安全边界内，由既有台账审计与人工验收覆盖 |

输入校验：`result` 走既有 `RESULT_MAX_CHARS` 截断；代理文本一律 `trim()` 后写入；判据只认词表，不做任何求值/渲染。
敏感信息：本需求不新增任何输出字段到日志/回执；台账里已有的 `result` 内容按既有口径处理。

## 生效与回滚 <!-- serves: FR-1, FR-2, FR-5 -->

- 生效：`pnpm build` 产出 `dist/index.mjs` 并**重启宿主**（本仓 KB `kb-0006`：改 `src/` 不构建则现场照旧）。
- 回滚：`DSH_REQBOARD_NO_HUMAN_PROXY=1` 一行退回（等同 `humanFactForProxy` 恒返回 `undefined`，且看板渲染不置候选属性）。

## 关键决策与取舍 <!-- serves: FR-1, FR-3, FR-4 -->

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 代写落在域层 `applyVerdicts` | 在弹框用例 `resultOf` 里代写（只覆盖弹框通道） | 看板通道也汇聚到 `applyVerdicts`；落在域层则两条通道零分歧，且不必让 client 回传 agent 文本（减少一处可漂移的真相） |
| 复用 `humanFactForProxy` 判定、不合并进 `needsHumanNeedsText` | 直接把 `needsHumanNeedsText` 删掉/放宽（那会让「留空点通过」直接吃 `result` 兜底） | 兜底是「无条件采纳」，代理是「判据成立才采纳」；合并会让无观察词的 agent 散文也变成通过（正是本项目实测的静默放行） |
| FR-4 补问而不改整批原子性 | 让不合格项单独记 `unverified`、其余照落 | 原子性是刻意纪律（`:832` 的整批前校验）；改它会把「哪些裁决已落库」变成需要逐项核对的状态 |
| 不给 `SheetVerdictInput` 加来源字段 | 让调用方声明「这是代写」 | 来源可由判据推出，多一个可被错填的入参等于多一个可伪造点（需求 D-1/D-2 口径） |

## 技术方案与亮点 <!-- serves: FR-1, FR-4 -->

- **单点判据、单点写入**：代写资格只有 `humanFactForProxy` 一处；`opinion` 与 `opinionSource` 只有一处写入（同一次 `mutate`），不存在两处口径。
- **通道无关**：域层落库让弹框与看板天然一致，看板改动退化为「放开前端误拦 + 显示来源」两处 UI 行为。
- **可证伪**：第 ② 档只在「人点了通过 + 该项是人工项 + agent 的 result 过事实形态判据」三条同时成立时触发，用例可穷举（`design/test-cases.md` TC-1~TC-5）。
- **回滚成本一行配置**：与既有 `DSH_REQBOARD_NO_ITEM_RESULT` 同款式，团队无需回滚版本。
