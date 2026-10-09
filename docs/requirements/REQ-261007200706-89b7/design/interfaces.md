# 接口契约：reqboard 体检第二批文案契约漂移修复（REQ-261007200706-89b7）

> 验收前置补档。本批是文案/契约级重构，**对外接口面有两处**：① 探针的命令行接口；
> ② 工具面文本契约（description 内容）。本份把两处的**形状**定死，并列出逐字不变项。

## 探针命令行接口（`scripts/prompt-path-probe.mts`） <!-- serves: FR-1 -->

| 项 | 契约 |
|----|------|
| 命令 | `tsx scripts/prompt-path-probe.mts [--json] [--specimen] [--help]` |
| 退出码 | `0` = 判据全过；`1` = 有缺口（逐条点名）；`2` = 前置/用法错误（工作区根不可解析、扫描目标缺失、参数非法） |
| `--json` | stdout 只输出可 `JSON.parse` 的单对象；关键键：`ok` / `exitCode` / `scanned.{fragments,files,agentSurface,tokens}` / `counts.{exists,whitelist,forbidden}` / `tokens[]` / `gaps[{token,at,reason}]` |
| `--specimen` | 五条判据全过 → `exit 0`；缺一 → `exit 1`。键：`specimen.{ok,redOnInjected,whitePasses,redOnForbidden,agentSurfaceScanned}` |
| 扫描面 | `src/domain/prompt/fragments/**`（递归 `*.md`）+ `src/application/dive/round-state.ts` + `src/tools/**`（递归 `*.ts`，**先剥注释**）+ `src/application/internal/capture-section.ts` + `src/client/views/verification.ts` |
| 判据一 | 扫描面内抽出的路径 token 必须真实存在，或命中 `WHITELIST`（每条须写清"为什么不存在也合法"的理由） |
| 判据二 | `FORBIDDEN_PATTERNS`（`agent-dh/`、`docs/standards/`）在扫描面内命中即缺口，**不接受白名单豁免** |
| 白名单准入 | 只放行**裸目录/占位形态**（`docs/{adr,rfcs,work-logs}/`、`docs/requirements/REQ-xxxxxx`、`prototype/*.html`、`prototypes/INDEX.md` 等）；其下的具体文件仍走可达判据 |

**接线**：`pnpm prompts:check` = `inline-prompt-fragments` + `check-prompt-fragments` + `prompt-path-probe`；
`prompts:verify` 保持原两段（轻量口，不含探针）。

## 工具面文本契约 <!-- serves: FR-2, FR-3, FR-4, FR-5, FR-6 -->

| 工具 / 面 | 本批变化 | 逐字不变项 |
|-----------|---------|-----------|
| `reqboard_submit` description | 1966 → 1289 字符；补 `kind=prototype` 支；不数类数 | `SUBMIT_DISPATCH` 键集、各 kind 的 schema、全部错误码 |
| `reqboard_submit` 拒绝回执 | plan/archive/requirement 细则全文在场（message 变长，规则不丢） | `code` 与回执键结构 |
| `reqboard_create` prompt | 弹框逐问清单补齐「需求文档位置 / 工作区」；参数清单补 `doc_location`（含回落语义） | 参数 schema、`owner_window` 语义 |
| 立项问数文案 | 全部改为**不数问数**；事实源 = `CAPTURE_QUESTION_IDS`（5 项） | `CAPTURE_QUESTION_IDS` 与 `CAPTURE_ANSWER_KEYS` 的值 |
| `reqboard_run_status` description | 810 → 663 字符，删两段修复史，保留规范句 | 返回体 schema 与「降级形状必须能通过自己的 schema」 |
| 长文本注记 | `STYLE`（全字段）/ `SPLIT`（仅幂等）/ `ARG`（兼容） | 幂等工具的完整三锚点表述 |
| `reqboard_ask_confirm` prompt | 拦截清单改「本窗口全部写路径」定性表述 | 拦截**行为**（`assertNoPendingConfirm` 挂载面）与 `REQBOARD_CONFIRM_PENDING` |
| `reqboard_task_move` budget | 父描述补 `expectedWindowIndex`（CAS）语义 | budget 子 schema 结构、`REQBOARD_CONFLICT` 语义 |

## 新增测试接口（可被 CI 直接消费） <!-- serves: FR-1, FR-3, FR-5, FR-6 -->

| 测试文件 | 公开断言面 |
|----------|-----------|
| `tests/prompt-path-probe-tools-surface.test.ts` | 探针扫描面在场、禁词规则生效、specimen 五条、行号保真 |
| `tests/submit-prompt-budget.test.ts` | `SUBMIT_PROMPT.length ≤ 1300`、六支一致、四处细则之家（调导出纯函数取真实 message） |
| `tests/arg-guidance.test.ts` | 幂等字段三锚点；一次性字段**不得**含 SPLIT（反向锁）；两表不重叠 |
| `tests/ask-confirm-prompt.test.ts` | 「全部写路径」在场、9 个真实挂载工具名不被枚举 |

## 元数据契约 <!-- serves: FR-7 -->

`package.json`：`repository = { type: "git", url: "git+https://github.com/kakaCat/dsh-pmboard.git" }`
（无 `directory`）；`cordis.patch.yml` 装载结构（`- insert: / id: pmboard / name: "dsh-pmboard"`）逐字不变。
