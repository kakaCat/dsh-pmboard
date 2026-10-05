# REQ-261002140814-1a5d 接口设计 · 工具回执 / 用例签名 / 错误码 `serves: FR-1, FR-2, FR-3`

> 本需求**不改任何对外签名**：工具名、参数、`output.schema` 字段集合一律不动。
> 改的是"值怎么来、缺值怎么写、失败怎么报"——契约钉在这里，实施照抄。

## 1. 工具壳接口（签名不变）`serves: FR-1`

```ts
// src/tools/ClearPauseTool/ClearPauseTool.ts
defineClearPauseTool(deps: UseCaseDeps): Tool
parameters: { requirement_id?: string }        // 不变（顶层 DSL，非嵌套 schema）
async execute(input: { requirement_id?: string }, context: ToolRunContext) {
  const windowKey = deps.session.windowKey(context)   // 不变（窗口身份与其它工具同源）
  return await clearPause(deps, windowKey, input)
}
```

输出声明（`output.schema`）**不变**：

| 声明键 | 类型 | 必填 | 依据 |
|---|---|---|---|
| `success` | `boolean` | 是 | 契约 |
| `requirement_id` | `string` | 是 | 契约 |
| `previous_activation` | `string` | **否** | 本仓 DSL 无 `required` 概念 ⇒ 缺键合法、`null` 不合法 |
| `message` | `string` | 是 | 契约 |

## 2. 用例签名与三条实现契约 `serves: FR-1`

```ts
// src/application/use-cases/ClearPause.ts
export interface ClearPauseArgs { requirement_id?: string }

export interface ClearPauseResult {
  success: boolean
  requirement_id: string
  previous_activation?: string   // 缺值 ⇒ 键整体省略
  message: string
}

export async function clearPause(
  deps: UseCaseDeps, windowKey: string, args: ClearPauseArgs
): Promise<ClearPauseResult>
```

| # | 契约 | 怎么落 | 反例（不许这么写） |
|---|---|---|---|
| C1 | 前值在**变更器内**捕获 | 闭包变量 `let previousActivation: string \| undefined`，在 mutator 里 `previousActivation = req.dive?.activation` | 从 `mutate()` 返回值读（`MutateResult` 只有 `changed/revision`） |
| C2 | 缺值条件展开 | `...(previousActivation !== undefined ? { previous_activation: previousActivation } : {})` | `previous_activation: previousActivation`（产出 undefined 属性） |
| C3 | 变更器返回 `LedgerChange` | `return { requirements: [req] }` | `return { previousActivation }`（无共同属性） |

**类型收敛**：三处 `reject(...)` 调用改为 `return reject(...)`——`reject` 声明为 `never`，`return` 之后控制流可判不可达，`target` 由 `RequirementRecord | undefined` 收窄为 `RequirementRecord`，消除 TS18048（行 54/95/97）。文案与 code 一字不改。

## 3. 错误码与拒绝条件 `serves: FR-1`

| code | 触发条件 | 改前 | 改后 |
|---|---|---|---|
| `REQBOARD_NO_BOUND_REQ` | 窗口无绑定中的需求 | 抛 | **不变**（文案、时机、零写入） |
| `REQBOARD_NOT_BOUND_TO_WINDOW` | 显式 `requirement_id` 不属于本窗口 | 抛 | **不变** |
| `REQBOARD_MUTATION_FAILED` | 变更器在草稿里找不到目标需求（并发删除 / 数据冲突） | **死分支**：`mutate()` 在变更器返回 `undefined` 时仍返回 `MutateResult`，`result === undefined` 恒为 false ⇒ 会返回**假的 success** | **活分支**：判定 `result.changed.requirements.length === 0` ⇒ 抛错、不报假成功 |

> 判定依据：端口签名 `mutate(...): Promise<MutateResult>`（[ports.ts:78](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/ports.ts#L78)）+ 实现里"变更器返回 undefined 时回落成空变更集"（`JsonLedgerRepository.mutate`）。故"找不到需求"只能从 `changed` 里读，不能从 `result === undefined` 读。

## 4. 变更通知契约 `serves: FR-2`

| 项 | 改前 | 改后 |
|---|---|---|
| `LedgerChange.kind` | `'dive-cleared'` | 不变 |
| `LedgerChange.requirements` | `[]`（变更器没返回 `requirements`） | `[req]`（改动后的需求记录，深冻副本） |
| 可见行为 | 今天无差异——唯一订阅者只处理 `requirement-moved` | 仍无差异，但契约归位：后续新增订阅者不再收到"空手通知" |

## 5. 门禁与测试接口 `serves: FR-3`

| 接口/口径 | 位置 | 本次改动 |
|---|---|---|
| 契约断言 `assertConformsToSchema` | [tests/output-contract.test.ts:100-103](/Users/mac/Documents/ai/dsh/dsh-pmboard/tests/output-contract.test.ts#L100-L103) | 删掉 `obj[k] === undefined` 的豁免 → 值为 `undefined` 的属性**判红**（与 `tests/status-lossless.test.ts` 同口径） |
| 无损 JSON 口径函数 `undefinedPaths(v)` | `tests/status-lossless.test.ts`（已存在） | 新用例复用同款递归扫描，不另造第二套口径 |
| 测试文件 serves 头 | `testFileHasServesHeader`（头 20 行内含 `serves:`） | 新增用例文件首行注释 `// serves: FR-1, FR-2, FR-3` |
| 静态扫描 return 键 | `tests/output-contract.test.ts` 的 `RESPONSE_SOURCES.ClearPause` | 已映射到 `application/use-cases/ClearPause.ts`，无需新增映射 |
