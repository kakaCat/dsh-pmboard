---
serves: FR-4, FR-1, FR-2, FR-3
---

# REQ-261004143941-b2ca 设计 · 测试策略（能红的断言）

## 总策略（serves: FR-4）

三层各管一件事，缺一层就会出现「测了但没拦住」：

| 层 | 断言对象 | 工具 | 跑法 |
|---|---|---|---|
| 模型层 | `tokenTotal` 的落模型规则（有值 / 缺席 / 0 / NaN） | vitest 纯函数单测 | `vitest run tests/header-progress-responsive.test.ts` |
| 渲染层（真实容器查询） | 各宽度档下**真的有 token 像素可见**、且标题行不被撑破 | headless Chrome 探针 | `tsx scripts/header-progress-probe.mts` |
| 接口层 | `tokenTotal` 与 Σnodes 自洽、缺失时键缺席 | vitest 路由级测试（假 req/res） | `vitest run tests/session-progress.test.ts` |

**为什么必须有渲染层**：`display:none` 写在 CSS 里，模型层单测读不到「用户是否看得见」——本需求的原发病（档位隐藏）恰恰只有真实容器查询能量到。

## TC-1 探针：各档可见 token 元素 ≥ 1（serves: FR-4）

**改造点**：`scripts/header-progress-probe.mts` 的标本模型加 `tokenTotal: 24800000`；页内量布脚本新增统计 `.dsh-pm-cprog-token-total`，并把「可见 token 总数」并入 `problems` 判定：任一拍（6 档视口）`tokens + totalBadge < 1` → `problems=TOKENS_HIDDEN`（非 NONE）→ 退出码 1。
**期望输出**：6 行 `DIAG … tokens=<n>+<m> problems=NONE`，末行 `PROBE PASS`，退出码 0。
**能红吗（证伪性）**：把渲染块的 `tokenTotal` 去掉 → B/C/D 档 `totalBadge=0` 且节点级 token=0 → 必红。改造前实测该断言为红（B/C/D 档 tokens=0）。

## TC-2 模型层：有值渲染、缺席与 0 不渲染（serves: FR-2, FR-4）

在 `tests/header-progress-responsive.test.ts` 补：

| 用例 | 输入 | 期望 |
|---|---|---|
| TC-2a | `tokenTotal: 1234` | `model.tokenTotal === 1234` |
| TC-2b | 不传 `tokenTotal` | `'tokenTotal' in model === false`（不是 `undefined` 值键） |
| TC-2c | `tokenTotal: 0` | 同 TC-2b（0 视为「无」，避免 `🪙 0`） |
| TC-2d | `tokenTotal: Number.NaN` / `Infinity` | 同 TC-2b（非有限不落模型） |
| TC-2e | 源码结构断言 | `src/client/conversation-progress.ts` 含 `.dsh-pm-cprog-token-total`，且该元素**不在** `.dsh-pm-flow` 的渲染分支内（防未来被挪进档位隐藏区） |

## TC-3 接口层：自洽与缺失语义（serves: FR-1）

在 `tests/session-progress.test.ts`（既有夹具 `makeTestStore` + 假 req/res）补：

| 用例 | 夹具 | 期望 |
|---|---|---|
| TC-3a | 需求有 `tokenUsage.byStage` + 任务执行差值 | `data.requirement.tokenTotal === Σ data.nodes[].tokens.total > 0` |
| TC-3b | 需求无任何快照（无 byStage、任务无执行差值） | `data.requirement` **无** `tokenTotal` 键（`'tokenTotal' in requirement === false`） |
| TC-3c | 沿用 `tests/progress-nodes-fallback.test.ts` 的兜底夹具 | `tokenTotal` 含任务执行差值（不是 0、不是仅 byStage） |

## TC-4 不变量回归：不撑破标题行（serves: FR-3, FR-4）

**期望输出**：探针 6 档 `rowRightOverflow ≤ 0`、`docOverflow = 0`、`chartScrollX = 0`、`problems=NONE`（与改造前逐档同口径）。
**D 档最小化变体的判据**：容器 <600px 时 `.dsh-pm-cprog-token-ico` 不可见，但 `.dsh-pm-cprog-token-total` 的**文本仍可见**（探针按 `getClientRects().length` 量，不看 `display`——仓库既有踩坑记录：只看 display 会漏掉「颜色 token 缺失导致肉眼不可见」那一类）。

## 验收命令与期望输出（serves: FR-4）

```bash
# ① 渲染层（真实容器查询，需本机 Chrome；找不到会响亮失败）
./node_modules/.bin/tsx scripts/header-progress-probe.mts
#   期望：6 行 DIAG problems=NONE，末行 PROBE PASS，退出码 0

# ② 模型/接口层
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts tests/session-progress.test.ts tests/progress-nodes-fallback.test.ts
#   期望：全绿

# ③ 接口实测自洽（对本机运行中的看板）
curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/session/<sid>/progress" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; r=d['requirement']; s=sum((n.get('tokens') or {}).get('total',0) for n in d.get('nodes',[])); print('tokenTotal',r.get('tokenTotal'),'sumNodes',s); assert r.get('tokenTotal')==s and s>0"
#   期望：打印 tokenTotal <n> sumNodes <n>，断言通过

# ④ 客户端重建（规范 C-12）
pnpm build:client
#   期望：[verify-client] OK … 退出码 0

# ⑤ 类型检查（规范 C-15）
pnpm typecheck
#   期望：退出码 0
```

**规范引用**：C-11（发版前 host+client 构建）、C-12（改客户端源码必重建 bundle）、C-14（提交前跑测试与基线比对）、C-15（改源码必跑类型检查）。
**基线比对（C-14）**：除本需求新增断言外，`tests/header-progress-e2e.test.ts`、`tests/token-tab.test.ts`、`tests/token-endpoint.test.ts` 必须与改造前同样全绿——它们覆盖本次**刻意不动**的链路。
