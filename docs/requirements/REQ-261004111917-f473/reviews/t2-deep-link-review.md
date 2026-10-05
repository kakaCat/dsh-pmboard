# 复核报告 · t2 客户端深链消费（t-bac32d 研发段 t-f94b67）

- **复核方式**：独立子代理（fresh context、**只读**）
- **被复核对象**：`src/client/deep-link.ts`、`src/client/index.ts` 的消费接线、`tests/deep-link.test.ts`
- **对照契约**：`design/interfaces.md` §客户端模块契约、`design/data-model.md` §不变量 I-1~I-10、`design/use-cases.md` UC-3/UC-4
- **结论**：**可以过复核，带条件放行**（解析/时序/兜底/接线/耦合均一致），附 6 条跟进项

## 逐条核对（摘要）

| 组 | 结论 |
|---|---|
| 解析规则（前缀恰好 `#pmboard`、req 取首 + 解码 + trim、`^REQ-`、未知键忽略） | 一致 |
| I-1 ignored 零副作用 / I-2 clearHash 恰一次 / I-3 malformed 不登记定位 / I-4 requestFocus 早于 selectPanel / I-5 尝试次数区间 / I-6 失败清意图 / I-8 不抛 | 一致（I-7 属 t3，I-9/I-10 属 t1） |
| 消费端接线（页面注册之后调用、clearHash 回落、try/catch） | 一致（layout 降级见 #5） |
| 耦合（只 import `dom.ts` 的 PANEL_ID、无 DOM 依赖、board-focus 语义未误用） | 一致 |
| 路径冲突（仓内除本卡与兼容页外无 `location.hash` 写入；无 hash 路由） | 无冲突 |

**复核者补充的关键事实**：应用包内框架文档明确「`selectPanel(id)` 对**已注册**面板的重复选中合法、不抛；key 不存在才抛」→ 因此「看板已挂载」时消费端会立即返回 `'focused'` 但**不会**切详情（`takeBoardFocus()` 在挂载时已消费过），这正是 t3 订阅通道要补的洞；**本卡单独交付时该路径是「无反应 + 意图滞留到下次挂载」**，验收口径不得把 UC-3 记在本卡。

## 偏离与风险清单 + 处置

| # | 风险 | 处置 |
|---|---|---|
| 1 | **重试预算 10×16ms≈144ms 无依据，冷启动可能静默失效**（中） | **已修**：改为 `DEFAULT_MAX_ATTEMPTS = 40`（≈640ms，导出常量 + 依据注释：插槽是延迟声明的），并补用例锁死预算下界（≥500ms）；真实时延由 t5 端到端量测后定值 |
| 2 | UC-3 本卡不成立（中，非本卡偏离） | **已记账**：验收口径写明 UC-3 是 t3+t5 的账；本卡只对「冷启动、面板未挂载」顺序负责 |
| 3 | **I-8 结构缺口**：解析与参数归一路径在 try 之外，`ports/options` 传 null 会 reject 且调用点接不住（低-中） | **已修**：整个函数体纳入 try、端口调用可选链；补用例（`ports=null` 必须 resolves `'failed'` 而非 reject）；调用点另加 `.catch` 兜底 |
| 4 | **文档口径冲突 `?req=` 空值**：解析规则表写 malformed，规范化规则表写「空值=无定位目标（合法）」（低，但需收口） | **已收口**：实现取文档多数（「写了 req 却空值」= malformed；「根本没写 req」= ok 缺省），补区分用例；三处文档与实现由此一致，**不改写已确认的设计文档**（改写会作废人工确认） |
| 5 | 错误矩阵 layout 行与实现不一致（文案/调用次数）（低） | **已修**：接线改为先判 `ctx.layout === undefined` → 打契约里那条专属诊断并跳过消费（省掉一整轮无谓重试），与 interfaces 降级表逐字对齐 |
| 6 | **失败路径无条件 `clearFocus` 可能误清别的动线留下的意图**（低） | **已修**：只在「本次登记过定位」时才清；补用例（无 reqId + 选择失败 → clearFocus 0 次） |
| 7 | `maxAttempts` 边界语义未入文档（低） | **已补**：JSDoc 写明非正/非有限值回落缺省 |
| 8 | clearHash 双路径都失败时 HMR 重放会再消费一次（低） | **已记账**：日志改为点名「该链接刷新后可能再消费一次」 |

## 命令输出摘要

- `npx vitest run tests/deep-link.test.ts` → 复核时 17 passed；处置后 **21 passed**
- 只读回归：`tests/board-focus.test.ts`(5) + `tests/board-attach.test.ts`(6) → 11 passed
- `npx tsc --noEmit | grep -E 'deep-link|client/index'` → 无输出
