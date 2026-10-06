# 设计 · 测试策略与用例（REQ-261005143615-5ab1） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

## 测试分层 `serves: FR-1, FR-2`

| 层 | 用例 | 手段 |
|---|---|---|
| 服务端判定（单测） | TC-1…TC-4 | 注入假 `docRootsOf` / `docsAt`（内存 fs 桩），断言 `state` 与 `absPath` |
| 客户端渲染（单测） | TC-5、TC-6 | 直接调 `docsPanel.render(...)`，断言 HTML 里的类名与文案 |
| 真机对账（命令） | TC-7、TC-8 | 用真实端点 + `os.path.exists` 逐条比对 |

## 判定用例 `serves: FR-1, FR-2, FR-3`

| # | 输入 | 期望 |
|---|---|---|
| TC-1 | 需求根有全部文件；会话根为空目录；不带 `?session=` | 全 `confirmed/pending`，`absPath` 以**需求根**开头，无 `file-missing` |
| TC-2 | 需求根缺文件、会话根有该文件 | 该行命中会话根（`absPath` 以会话根开头）且状态为在盘态 |
| TC-3 | 需求根与会话根都可用，文件都不在 | `file-missing`（诚实缺失，**不得**降级成 `unknown`） |
| TC-4 | 所有候选根都不存在（临时改根） | 全 `unknown`；`absPath` 一律不注入 |

## 客户端渲染用例 `serves: FR-4`

| # | 断言 |
|---|---|
| TC-5 | `absPath` 在场 → 路径格显示绝对路径，且 `data-open-doc` 等于该绝对路径 |
| TC-6 | `unknown` 行 → 文案含「未判定」、**不含** `dsh-pm-doc-missing` / 无 `text-decoration: line-through`；`file-missing` 行维持划线不变 |

## 真机对账（可跑命令） `serves: FR-1, FR-3, FR-4`

| # | 命令 | 期望 |
|---|---|---|
| TC-7 | `curl -s ".../REQ-261005123641-3982/docs"`（不带 `?session=`） | `state=='file-missing'` 条数 = 0（现状 25/25） |
| TC-8 | 带 `?session=<本仓会话>` 拉同一端点，逐条 `os.path.exists(absPath)` 比对 | 0 分歧；`REQ-260930094139-2d65` 仍为 `file-missing` |

## 命令与门禁 `serves: FR-5`

- `npx vitest run tests/query-docs-*.test.ts`（新用例全绿）
- `pnpm typecheck`（C-15；错误数不高于基线 223）
- `pnpm test`（C-14；失败数不高于基线）
- `pnpm build:client` + `pnpm build`（C-11 / C-12；客户端改动必须重建 bundle）
