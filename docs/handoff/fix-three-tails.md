# 交棒提示词：三条尾巴（fix-three-tails）

> **用法**：在新窗口整段发送「读 `docs/handoff/fix-three-tails.md` 并照做」。
> 本文件自足——读完即可开工，**不需要立项**（原窗口选了「方式 B：轻量交棒」）。
> 写作窗口 `session-90ecf6a7`（2026-10-02 14:2x）；**文中所有数字都是该窗口实测**，命令见 §4 / 附录 B。
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`（= 本仓根；下面所有路径都相对它）。
> **行号仅供参考**：本工作区同时有别的窗口在改文件（写作期间 `round-driver.ts` 的行号就从 277 漂到了 291），
> 一切以文中给出的**文本锚点**（代码/字符串原文）为准。

---

## 0. 一句话任务

三个互不依赖的小活，**唯一真缺陷是尾 3**（一条门禁红灯，现在就是红的）：

| 序 | 尾巴 | 性质 | 实测状态（2026-10-02 14:2x） | 建议 |
|---|---|---|---|---|
| 尾 3 | 3 个工具缺 `RESPONSE_SOURCES` 映射 | **真缺陷 / 门禁红** | `tests/output-contract.test.ts` **3 failed** | **先做** |
| 尾 1 | 卡文本与证据文档的数字口径打架 | 纯文档 | 双方各说一套，且**卡片是对的** | 再做 |
| 尾 2 | `clear_pause` 回执报「无损 JSON」 | **主体已被别的需求修掉** | 用例 7/7 绿，仅剩一行同口径潜伏项 | 最后一句话判断：做或跳过 |

**执行顺序建议：尾 3 → 尾 1 → 尾 2。**

---

## 1. 背景三句话

1. `REQ-261002115204-ba52`（长文本入参写法约定）在 2026-10-02 上午收尾核验时留下三条尾巴：一处卡文本数字与证据文档互相矛盾、一处 `reqboard_clear_pause` 回执误报、一处输出契约静态门禁红灯。
2. 其中 `clear_pause` 那条已被 `REQ-261002140814-1a5d`（窗口 `session-496379d5`）修掉，**代码在位、用例全绿**；门禁红灯（三个后加工具没登记响应源映射）至今没人认领。
3. 本文件是**交棒件**而不是需求：不走 reqboard 立项/设计/验收，做完把证据写回来即可——但**改代码前先跑一遍 §4 的命令确认现状没有被别的窗口改过**（本工作区同时有其它窗口在跑）。

---

## 2. 开工前的三条硬约束

1. **基线先取**：`npx vitest run --reporter=dot 2>&1 | tail -20`（约 30 秒）。记下 `failed` 的文件数/用例数当作开工基线——本仓工作区长期带大量存量失败，判据是「**新增失败 = 0**」，不是「全绿」。
2. **不提交 git**：工作区里堆着多个窗口的在途改动（`git status` 一大片），提交会把别人的半成品一起卷进去。
3. **不动 `dist/`**：`dist/index.mjs` 是宿主正在用的构建产物（且已 gitignore）。除非你要复现尾 1 的计数，否则别跑 `pnpm build` 覆盖它——别的窗口可能正在用它做端到端。

---

## 3. 三条尾巴

### 尾 3（先做）· 3 个工具缺 `RESPONSE_SOURCES` 映射 → 门禁红灯

**现状（实测，可复现）**

```
$ npx vitest run tests/output-contract.test.ts --reporter=dot
FAIL  defineTaskAdoptTool：所有 return 分支键均已声明
      AssertionError: defineTaskAdoptTool 缺少响应源映射（新增工具必须补 RESPONSE_SOURCES）
FAIL  defineKnowledgeTool：…
FAIL  defineRegenerateTool：…
      Tests  3 failed | 28 passed (31)
```

**根因**

`tests/output-contract.test.ts:494` 起有一张「工具工厂名 → 响应体所在源文件」的路由表 `RESPONSE_SOURCES`；同文件 `:555` 的断言对 `src/tools/**` 下每个 `export function define<X>Tool` 都要求表里有条目（缺了就红，因为"扫描器看不到这个工具的返回键"等于门禁瞎眼）。三个**后加**工具没登记：

- `src/tools/AdoptTaskTool/TaskAdoptTool.ts:37` → `defineTaskAdoptTool`，`execute` 委托 `application/use-cases/AdoptTask.ts`
- `src/tools/KnowledgeTool/KnowledgeTool.ts:26` → `defineKnowledgeTool`，委托 `application/use-cases/QueryKnowledge.ts`
- `src/tools/RegenerateTool/index.ts:35` → `defineRegenerateTool`，委托 `application/use-cases/RegenerateChain.ts`

**改法（第一层）**：在表尾插入三行。锚点用**文本**不要用行号（表尾是 `ClearPause: ['application/use-cases/ClearPause.ts'],` 紧跟一个 `}`）：

```diff
   ClearPause: ['application/use-cases/ClearPause.ts'],
+  // 补登记：三个后加工具此前缺映射，门禁根本看不到它们的返回键（返回体在各自用例里）
+  TaskAdopt: ['application/use-cases/AdoptTask.ts'],
+  Knowledge: ['application/use-cases/QueryKnowledge.ts'],
+  Regenerate: ['application/use-cases/RegenerateChain.ts'],
 }
```

**第二层（补完就会冒出来，别被吓到）**：映射一补，扫描器**真的开始检查**这三个工具的返回键。本次已在**临时副本**上实测（改完立刻还原）：

```
FAIL  defineKnowledgeTool：所有 return 分支键均已声明
      AssertionError: defineKnowledgeTool 的 return 含未声明字段：list
```

- `TaskAdopt` ✓、`Regenerate` ✓ 直接通过；
- `Knowledge` 红一条。原因：`QueryKnowledge.ts` 里除了用例主体，还有一个**参数解析辅助函数** `parseKbQueryArgs`（`:64`，`export`），它自己的 `return { limit, budgetChars, ...(list ? { list: true } : {}), ... }`（`:100-107`）被**文件级**映射一并扫了进来，而 `list` 不在 `KnowledgeTool.ts:41-47` 的 `output.schema.properties` 里。

**Knowledge 的两种收口（推荐 B）**

- **B（推荐，结构性）**：把 `parseKbQueryArgs` 搬到 `src/application/internal/kb-args.ts`。它全仓只有两处引用（定义 `QueryKnowledge.ts:64`、调用 `:154`），**没有任何测试 import 它**（测试只用 `executeQueryKnowledge`），所以搬完只需改 `QueryKnowledge.ts` 一行 import。搬完映射指向的文件里就只剩真回执，门禁看的东西和它宣称的一致。
- **A（最小，退让）**：在 `KnowledgeTool.ts` 的 `output.schema.properties` 里、`hint` 那一行之后补 `list: { type: 'boolean', description: '入参解析辅助键（parseKbQueryArgs）；被文件级扫描器扫入，非回执字段' }`。缺点是 schema 里多一个永远不会出现在回执里的键（该 schema 已是 `additionalProperties: true`，加它不改变实际校验行为，但语义上算让步）。

**不接受的做法**：从 `parseKbQueryArgs` 的返回值里删掉 `list`（会让 `list: '1' / 'true'` 这条入参兼容失效）；把 `Knowledge` 排除在映射表之外（门禁退回"全绿瞎眼"，那正是本条的根因）。

**验收**：`npx vitest run tests/output-contract.test.ts` → **31 passed / 0 failed**（修前 3 failed）；若走 B，再跑 `npx vitest run tests/kb-tool-budget.test.ts tests/kb-domain.test.ts tests/output-contract.test.ts` 全绿；`npx tsc --noEmit 2>&1 | grep -E "output-contract|QueryKnowledge|kb-args"` 无输出（全仓错误数应 ≤ 188）。

---

### 尾 1 · 卡文本与证据文档的数字口径打架（纯文档）

**三份文本的现状**

| 文件 | 位置 | 现在写的 |
|---|---|---|
| `docs/requirements/REQ-261002115204-ba52/tasks/t-9d0b25.md` | `:16`（「得到什么结果」节） | `…命中「拆成多次调用」×3、「汇报自检」×2` |
| 台账 `docs/requirements/REQ-261002115204-ba52/queue.json` | `t-9d0b25` 的 `acceptance`（卡已 done） | 同上那一句 |
| `docs/requirements/REQ-261002115204-ba52/notes/t5-verification-evidence.md` | `:16`、`:20-23` | `「拆成多次调用」×2、「汇报自检」×2`，并断言"卡片写 ×3 系上一版产物口径" |

**今天复测（`dist/index.mjs` mtime 2026-10-02 14:17:30）**

```
$ grep -c '拆成多次调用' dist/index.mjs   → 3
$ grep -c '汇报自检'     dist/index.mjs   → 2
```

即：**卡片是对的，证据文档里的「×2（非 ×3）」才是旧口径。**

**为什么会漂**：这三处命中来自 ① `LONG_TEXT_ARG_NOTE` 常量（`src/tools/shared.ts:32`，13:55 被改过措辞）② 实施片段文本（`src/domain/prompt/generated/fragments.ts` ← `implementing/{light,heavy}/overrides.md`，打包后落在 `dist` 的 `:12636` / `:12730` 两行）③ `TASK_REPORT_PROMPT`（`src/tools/TaskReportTool/prompt.ts`）。`src` 里 4 个文件各 1 处，打包合并成 3 处——**任何一次措辞改动都会改这个数字**，写死计数本身就是坏味道。

**结论**：原始诊断的「把 ×3 改成 ×2」是**错的**，照做会把当前正确的数字改坏。二选一：

- **A（推荐，报口径）**：把卡片 `:16` 与证据文档改成不写死计数，例如
  「`pnpm build` exit 0，且 `dist/index.mjs` 含本次文本（`grep -c '拆成多次调用'` / `grep -c '汇报自检'` 均 ≥1；**实测值随构建内容而变**，取证命令、构建 mtime 与时点见 `notes/t5-verification-evidence.md`）」，并在证据文档 item 1/2 补一行「2026-10-02 14:2x 复测：3 / 2（dist mtime 14:17:30）」。
- **B（对齐数字）**：只把证据文档 item 1/2 的 ×2 改成 ×3，卡片与台账一字不动。零风险，但下次措辞一改又会漂。

**台账说明**：`queue.json` 里的 `acceptance` 只有**绑定 `REQ-261002115204-ba52` 的窗口**才能改（`reqboard_task_move` 要求任务属本窗口绑定需求）。新窗口大概率绑不上——**不要硬试**：报 `REQBOARD_NO_BOUND_REQ` / `REQBOARD_NOT_BOUND_TO_WINDOW` 就只改卡片 `.md` 与证据文档，并在回报里写明「台账未同步」。

---

### 尾 2 · `clear_pause` 的 undefined 值属性（主体已修，只剩一行可选硬化）

**主体已经修好了——不要重做。** `REQ-261002140814-1a5d`（窗口 `session-496379d5`）把「回执带 undefined 值属性」这条真缺陷修掉，代码在位：

- `src/application/use-cases/ClearPause.ts:115` —— 条件展开，缺值**整体省略**该键（不再发 `undefined`）；
- `:90-95` —— 留痕写 `CommentRecord.body`（此前写 `text`，看板渲染空白）；
- `:102` —— 变更器按端口契约返回 `LedgerChange`；
- 实测：`npx vitest run tests/clear-pause-lossless.test.ts` → **7 passed**；`npx tsc --noEmit 2>&1 | grep ClearPause` → **无输出**；全仓 tsc 错误 **188**（旧基线 197）。

**残留的是 `:84` 这一行**：

```ts
req.dive.pausedReason = undefined   // 留下一个 own property，值为 undefined
```

它是**同口径潜伏项，不是用户观测到的那条报错**：用户看到的 `value is not lossless JSON` 来自 `previous_activation: undefined`（已修）。判据——这个 `req` 对象**不在任何工具回执路径上**：回执只组装 `success / requirement_id / previous_activation / message`；`reqboard_status` 走 `projectRequirement`（`src/application/internal/support.ts:639`）只投影 `id / title / status / category`，不吐 `dive`；持久化走 `JSON.stringify` 会丢掉 `undefined`。

**可选硬化（1 行，做不做由你判断）**：

```diff
-      req.dive.pausedReason = undefined
+      delete req.dive.pausedReason
```

同口径另外三处（同属潜伏，**要修就一起修并登记，别只修一处**）：`src/http/routers/requirements.ts:392`、`src/application/dive/round-driver.ts`（`r.advance.pausedReason = undefined`，写作时在 `:291`，该文件正被别的窗口改）、`src/application/use-cases/HandleFailure.ts:68`（都是 `advance.pausedReason = undefined`；`advance` 目前也不进任何 query/工具回执）。

**并发红线**：`REQ-261002140814-1a5d` 写作时正在收尾（验收/归档），`ClearPause.ts` 可能仍有窗口在写。**无法确认 1a5d 已归档前，跳过本节**；要做也只改 `:84` 一行，不重构、不顺手清其它三处（那三处属新需求）。

**顺便一提（不属本条工作，别顺手改）**：`tests/output-contract.test.ts:99` 的 `UNDEFINED_VALUE_DEBT` 登记着第二条活缺陷 `ask_confirm(declined).user_feedback`（真实位置 `src/application/use-cases/AskConfirm.ts:354`，测试注释里写的 `:312` 已漂），到期日 2026-10-16，另立需求治理。

---

## 4. 命令总表（复制即用）

```bash
# 开工基线（先跑；记 failed 文件数/用例数）
npx vitest run --reporter=dot 2>&1 | tail -20

# 尾 3 —— 修前必红（3 failed / 28 passed）、修后必绿（31 passed）
npx vitest run tests/output-contract.test.ts --reporter=dot
# 尾 3 走 B（搬 parseKbQueryArgs）后的连带用例
npx vitest run tests/kb-tool-budget.test.ts tests/kb-domain.test.ts tests/output-contract.test.ts

# 尾 1 —— 复现计数（注意 dist 是共享构建产物，别覆盖它）
grep -c '拆成多次调用' dist/index.mjs      # 实测 3
grep -c '汇报自检'     dist/index.mjs      # 实测 2
stat -f '%Sm %N' dist/index.mjs            # 实测 Oct  2 14:17:30 2026

# 尾 2 —— 主体是否仍好（应 7 passed）
npx vitest run tests/clear-pause-lossless.test.ts --reporter=dot

# 类型闸门（全仓基线 188；改动文件零新增）
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

---

## 5. 验收标准（逐条可证伪）

| # | 判据 | 修前 | 修后 |
|---|---|---|---|
| A1 | `npx vitest run tests/output-contract.test.ts` 的失败数 | 3 failed | **0 failed（31 passed）** |
| A2 | 三个工具各自的用例名出现且通过 | `defineTaskAdoptTool` / `defineKnowledgeTool` / `defineRegenerateTool` 三条均 FAIL | 三条均 PASS |
| A3 | 门禁不是"假绿"：临时给 `AdoptTask` 用例加一个未声明返回键 → 必红；还原 → 绿 | — | 反向自检可复现（该文件已有故障注入用例，别删） |
| A4 | `npx tsc --noEmit 2>&1 \| grep -c 'error TS'` | 188 | ≤ 188，且改动文件零新增 |
| A5 | 全量 `npx vitest run` 的新增失败数 | — | **= 0**（与 §2 第 1 条取的开工基线逐项对齐，只允许不新增） |
| A6 | 尾 1 三份文本口径一致（数字或"报口径"表述二选一） | 卡片与证据文档互相矛盾 | 一致，且写明取证命令 + 时点 |
| A7 | 尾 2（若做）：`git diff` 只含 `:84` 一行 `delete` | — | 只有那一行；若跳过则明确记录「跳过，理由：1a5d 未确认归档」 |
| A8 | `git status` 里没有本窗口新增的提交 | — | 无提交（只留工作区改动） |

---

## 6. 边界（不要做）

- 不改任何工具的**入参 schema / 错误码 / 落盘格式 / 输出字段集合**——尾 3 的 A 方案是唯一例外，且必须在注释里说明原因。
- 不动 `src/application/use-cases/ClearPause.ts` 的解锁语义（写哪些字段、写什么值），也不动 `AskConfirm.ts:354`（已登记留债，到期另立需求）。
- 不重跑 `pnpm build` 覆盖 `dist/`；不提交 git；不新建需求（本文件就是"免立项"交棒）。
- 不扩大范围去修全仓 188 条 tsc 存量错误。
- 若发现**代码与本文描述不符**（别的窗口已经改过），停下来在回报里说明差异，不要照着旧描述硬改。

---

## 7. 完成后回报什么（给交棒窗口/用户看）

1. 三个尾巴各自：**做了 / 跳过**，跳过的写理由；
2. 每条挂上命令 + 关键输出（A1/A4/A5/A6 的数字必须给实测值，不要只写"通过"）；
3. `git status --short` 里本窗口动了哪几个文件（精确到行）；
4. 台账未同步之类的**遗留**（尾 1 大概率会命中）；
5. 是否发现新的同类问题（只登记，不动手）。

---

## 附录 A · 原始诊断原文（2026-10-02 12:0x，窗口 `session-d89ef03b`）

> 「根因全部定位到了，三个修法如下：
> **修 1**：`REQ-261002115204-ba52/tasks/t-9d0b25.md` 的「得到什么结果」节，把 `命中「拆成多次调用」×3` 改成 `×2`，并加一行指针「数字口径修正见 notes/t5-verification-evidence.md」。
> **修 2**：`ClearPause.ts:84` 的 `req.dive.pausedReason = undefined` ⇒ 改成 `delete req.dive.pausedReason`，并配一条回归测试。
> **修 3**：`output-contract.test.ts:494` 的 `RESPONSE_SOURCES` 表里，给 `TaskAdopt`、`Knowledge`、`Regenerate` 补 3 行。」

**本文与之的差异（都是本次实测的结论，以本文为准）**

- 修 1 的**方向反了**：×3 是对的（今天重建的 dist 实测 3 / 2），该改的是证据文档的旧口径；且写死计数本身不稳，推荐改成"报命令 + 时点"。
- 修 2 的**主体已由 `REQ-261002140814-1a5d` 修完**（`:115` 条件展开 / `:90-95` body / `:102` LedgerChange）；`:84` 只是同口径潜伏项，不在回执路径上。
- 修 3 **仍然成立**，但只补 3 行还不够——补完 `Knowledge` 会因文件里混着参数解析辅助函数 `parseKbQueryArgs` 而多红一条（`list` 未声明）。

## 附录 B · 本次写作窗口的实测输出（2026-10-02 14:2x，窗口 `session-90ecf6a7`）

```
$ npx vitest run tests/output-contract.test.ts --reporter=dot
FAIL defineTaskAdoptTool 缺少响应源映射 / FAIL defineKnowledgeTool … / FAIL defineRegenerateTool …
Test Files  1 failed (1)   Tests  3 failed | 28 passed (31)

$ npx vitest run tests/clear-pause-lossless.test.ts --reporter=dot
Test Files  1 passed (1)   Tests  7 passed (7)

$ grep -c '拆成多次调用' dist/index.mjs   → 3      # dist mtime Oct  2 14:17:30 2026
$ grep -c '汇报自检'     dist/index.mjs   → 2
$ npx tsc --noEmit 2>&1 | grep -c 'error TS' → 188
$ npx tsc --noEmit 2>&1 | grep ClearPause    → （空）

# 临时副本上预演尾 3：补 3 行映射后
#   defineTaskAdoptTool ✓  defineRegenerateTool ✓
#   defineKnowledgeTool ✗  AssertionError: 的 return 含未声明字段：list
#   （临时副本已还原，tests/output-contract.test.ts 保持原样，md5 da5fe32752524824702b38b8d46f8af1）
```
