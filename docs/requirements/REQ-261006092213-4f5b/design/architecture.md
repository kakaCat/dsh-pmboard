# 架构设计 · REQ-261006092213-4f5b <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 写给零上下文的执行者：只凭本文 + requirement.md 就应能写出拆分计划。
> 本文只讲方向与接缝，不含任务划分（拆分内容属拆分阶段）。

## 现状：要改的三个接缝 <!-- serves: FR-1, FR-2 -->

现状不是"缺字段"，是**字段有了但没有任何写路径**。三处接缝：

| 接缝 | 现状 | 本次改成 |
|---|---|---|
| 结果从哪来 | `evidence` 里手写 `<验收项id> :: <结果>` 才绑定；而项 id `v<ver>-N` 在**提交那一刻**才分配（`buildSheet` 末尾连续编号）⇒ agent 提交前无从写出正确键，绑定实际上不可达 | 结构化 `results`，`ref` 与验收项来源同构，**不依赖项 id** |
| 谁保证不遗漏 | 无。`bindItemResults` 的 `unmatched` 返回值被丢弃（SubmitVerification 只当语句调用）⇒ 写错键也静默 | 硬门：可预见项逐项交代，漏项/坏引用/空结果**拒绝提交并点名** |
| 人怎么裁决 | 看板强制手打、弹框第 2 问逼填；`resultOf` 又回退 `evidence[0]` ⇒ `unverified` 不可达，底线形同不存在 | 有结果即零输入裁决；去掉 `evidence[0]` 兜底，底线恢复真实 |

**为什么 `ref` 不能复用项 id**：编号是读侧不透明键（`v<version>-<n>` 按最终顺序一次性分配），
存在于**组装之后**；把它当提交前的引用键，就是拿一个还不存在的值做主键。这是原设计踩的坑，
本次用「来源」当引用键从结构上绕开。

## 分层与职责边界 <!-- serves: FR-1, FR-3, FR-4 -->

| 层 | 职责 | 不做什么 |
|---|---|---|
| domain（`AcceptanceSheetSpec`） | 纯规则：结果匹配、项组装、裁决校验、放行判据 | 不做 IO、不弹框、不读环境变量（回滚开关由调用方读后传参） |
| application（`SubmitVerification` / `AcceptSheet`） | 编排：读数、跑门禁、写台账、写文档 | 不自己实现规则（单点引用 domain） |
| tools（`SubmitTool` / `AcceptSheetTool`） | 参数 schema 与提示词 | 不做校验逻辑 |
| client（看板 / 详情页） | 展示与预填；只提交"人改了什么" | 不判"是否算通过" |
| http | 协议转换 | 不复制判定规则 |

**执行方与裁决方的边界（本需求的骨架）**：agent 只交结果（`result`），不交裁决；
人只交裁决（`status`），不必交结果；`needsHuman` 是唯一例外通道，且必须写明理由。

## 数据流：一次闭环 <!-- serves: FR-1, FR-2, FR-3 -->

```
agent（实施完，逐项跑）
   │  results=[{ref:{kind:'task',taskId},result}, …]
   ▼
SubmitVerification
   ├─ ① 算出「可预见项集合」= 活卡中的顶层父卡 + 需求级 + 对照项（原型 / 裁定）
   ├─ ② matchStructuredResults(items, results) → bound / missing / badRef / duplicate
   ├─ ③ missing|badRef|duplicate 非空 → 拒绝提交（点名到 ref）
   ├─ ④ buildSheet 组装后把结果写进对应项（result / resultSource='agent' / needsHuman / humanReason）
   └─ ⑤ 系统项（孤儿 / E2E 缺口 / 一致性 / 锚点失效 / 追溯断链）提交时才由代码追加，**豁免逐项交代**
   ▼
验收单：每项带实测结果
   ├─▶ 弹框：needsResultInput=false ⇒ 只问 1 问
   ├─▶ 看板：逐项行展示 + 预填；人改动 ⇒ 记 resultSource='human'
   └─▶ 系统项仍要人写处置意见
   ▼
人裁决（含 needsHuman 项需人填）
   ▼
applyVerdicts：passed 需有结果（opinion 或 item.result）；否则 unverified
   ▼
全通过 → 「验收通过并归档」；含 pending/unverified → 不放行
```

## 单点清单（改这些地方会连带破坏什么） <!-- serves: FR-2, FR-6 -->

| 单点 | 位置 | 连带 |
|---|---|---|
| `matchStructuredResults`（新） | `domain/workflow/ResultBinding.ts` | 提交校验与绑定**共用同一函数**，禁止在用例里再写一套匹配 |
| `isForeseeableItem`（新） | 同上 | 硬门范围与"谁豁免"的唯一判据 |
| `resultOf`（改） | `application/use-cases/AcceptSheet.ts` | 去掉 `evidence[0]` 兜底；顺序固定为 第二问 → 第一问 → `item.result` |
| `applyVerdicts`（改） | `domain/workflow/AcceptanceSheetSpec.ts` | `passed` 校验放宽为"opinion 或 result 非空"，其余状态不变 |
| `finalizeIfAllPassed`（改） | `AcceptSheet.ts` | 放行判据从"无 pending"改为"无 pending 且无 unverified" |
| 看板逐项渲染（改） | `client/stage-panel.ts` | 预填值必须来自 `item.result`，不得在前端另算 |

## 门禁顺序（不可换序） <!-- serves: FR-2, FR-6 -->

1. 参数与形状校验（`results` 必须是数组、ref 形状合法）→ `REQBOARD_INVALID_INPUT`
2. 文档完整性门、对照项前置门、覆盖度门（既有，不动）
3. **逐项交代硬门**（本需求新增）→ 漏项即拒
4. 组装验收单 + 落结果
5. 裁决时的底线校验（passed 需结果）
6. 放行判据（pending / unverified 都不放行）

顺序理由：硬门放在文档门之后、组装之前——文档缺失属于"没东西可验"，比"少交代一项"更靠前，
报错也更贴近病因（与既有 `verification_prototype_compare_missing` 的排序口径一致）。

## 错误处理与响亮失败 <!-- serves: FR-2 -->

- 拒绝一律给**点名到项**的缺口清单，不给"提交失败"这种无主语消息。
- 不复用静默：`matchStructuredResults` 的 `unmatched` 必须进返回体或用于拒绝，**不得丢弃返回值**。
- 兼容期文本绑定若命中未匹配键 → 作为 warning 进返回体（不再静默）。

## 兼容与回滚路径 <!-- serves: FR-8 -->

| 面 | 处理 |
|---|---|
| 不带 `results` 的老调用方 | 提交仍成功；项无 `result` ⇒ 人裁决时需填或记 `unverified`（诚实口径） |
| 回滚开关 `DSH_REQBOARD_NO_ITEM_RESULT=1` | 完全回到今天：不结构化绑定 + 保留 `evidence[0]` 兜底 |
| 存量在册验收单 | 不回写；`result` 只在提交那一刻产生 |
| 台账字段 | **零新增**，故无数据迁移（见 data-model.md） |

## 不做的事（边界） <!-- serves: FR-1 -->

1. 不造命令执行引擎：agent 是执行者，宿主不跑命令、不维护白名单（D-2）。
2. 不允许 agent 自判通过：`status` 只由人的通道写入。
3. 系统项不由 agent 落结果（提交时才算得出）。
4. 不改任务卡验收标准的生成规则与拆分模板。
5. 不重写存量验收单。

## 裁定对照 <!-- serves: FR-1, FR-2, FR-4, FR-5, FR-6, FR-8 -->

| 裁定 | 本设计落点 |
|---|---|
| D-1 人只做审核员 | 第 1 节职责表；`result` 由 agent 落，人只写 `status` |
| D-2 不新增执行引擎 | 第 1 节"不做的事"第 1 条 |
| D-3 提交时一次闭环 | 第 3 节数据流（无二次回填路径） |
| D-4 结构化 `results` 与 ref 同构 | 第 1 节接缝表；interfaces.md 参数定义 |
| D-5 零输入通过 | `resultOf` 顺序；`applyVerdicts` 放宽 |
| D-6 含前端两屏 | frontend.md；原型 `prototypes/verification-result.html#FR-3/#FR-4/#FR-5` |
| D-7 硬门逐项交代、系统项豁免 | 第 3 节 ①③⑤；第 5 节排序 |
