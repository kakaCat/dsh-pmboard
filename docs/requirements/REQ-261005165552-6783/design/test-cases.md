---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# 测试用例设计（REQ-261005165552-6783）

<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 覆盖基线：requirement.md 的 **6 条整体验收标准**与四条 FR。
> 被测对象一律带 `文件（FR-x）`；`covers`（任务卡编号）**设计阶段不填**——卡还不存在，编造即假引用，落库后由既有回填机制补。
> 三层：**纯函数/装配用例**（vitest）· **反例自证**（vitest，先证伪再证真）· **运行时证据**（重建 + 重载，人可复核）。

**命令与期望**

| 层 | 命令 | 期望 |
|---|---|---|
| 类型 | `pnpm typecheck` | 退出码 0 |
| 装配用例 | `npx vitest run tests/apply-wiring.test.ts` | 退出码 0，新增断言全过 |
| 反例用例 | `npx vitest run tests/capture-literal-section.test.ts` | 退出码 0，三组反例 + 自证判据全过 |
| 既有回归 | `npx vitest run tests/capture.test.ts tests/stage-prompts.test.ts tests/acceptance-criteria.test.ts` | 退出码 0（文本逐字节不变式） |
| 全量 | `pnpm test` | 退出码 0，与基线比对无新增失败（C-14） |
| 构建 | `pnpm build` | 退出码 0，`dist/index.mjs` 为新产物（C-11） |
| 运行时 | 重载插件 + 在被卡窗口发一条消息 | 该窗口完成一轮；诊断日志 `NODE-4/NODE-5` 正常 |

## 功能测试用例 `serves: FR-1, FR-2, FR-4`

### TC-1: 捕获段注册时显式声明字面量（`interpolate === false`） `validates: FR-1` <!-- serves: FR-1 -->

- **标的**：`src/gate-wiring.ts` 的 `systemPrompt.section({…})` 调用（经 `tests/apply-wiring.test.ts` 的桩 ctx 采集）。
- **步骤**：桩 ctx 跑 `apply()` → 取 `sections.find(name === 'reqboard:capture')`。
- **期望**：`sec.interpolate === false`；且 `name/order/text` 三项与改动前一致（`reqboard:capture` / `60` / 函数）。
- **失败含义**：开关没生效或段契约被改动 → 故障原样复现。

### TC-2: 本插件注册的每个段都必须显式声明插值开关 `validates: FR-4` <!-- serves: FR-4 -->

- **标的**：同 TC-1 采集到的**全部** section。
- **步骤**：遍历 `ctx.sections`，断言每项的 `interpolate` 是布尔值（不是 `undefined`）。
- **期望**：零个 `undefined`——未来新增段必须写下自己的选择。
- **失败含义**：有人新增段时又去依赖宿主缺省（本次事故的根因形态）。

### TC-3: 反例①——在制任务的验收标准含占位符，段文本字面保真  `validates: FR-2` <!-- serves: FR-2 -->

- **标本**：S-1（已绑定窗口 + 实现中需求 + 在制任务，其 `acceptance` 含 ASCII 双花括号占位符，复刻 `t-7e7da9` 现场）。
- **步骤**：调 `boundSectionTextFrom(facts, tasks, ctx)` 取段文本；用**与宿主同语义的判据**在"开关关掉"的段上渲染。
- **期望**：段文本**原样**包含该占位符（逐字节）；渲染**不抛**且返回值 === 原文本。
- **失败含义**：文本被改写（转义/清洗）→ 破坏原文保真；或开关未生效 → 窗口照旧卡死。

### TC-4: 反例①的**证伪半**——同一文本在 `interpolate: true` 下必须抛  `validates: FR-2` <!-- serves: FR-2 -->

- **标的**：TC-3 的同一段文本，换成"宿主默认语义"（扫描 `{{…}}`，名字不匹配 `/^[a-z][a-z0-9_]*$/` 即抛）。
- **期望**：**抛错**，且错误信息含段名与占位符名（与现场台账 `interruption.reason` 同形）。
- **失败含义**：判据是恒真的（既证不出"没有开关会炸"，TC-3 的通过也就没有意义）。

### TC-5: 反例②——用户消息节选含占位符，动态引导文本字面保真  `validates: FR-2` <!-- serves: FR-2 -->

- **标本**：S-2（未绑定窗口 + 待捕获消息，消息正文含 ASCII 双花括号占位符）。
- **步骤**：调 `capturePromptForMessage(windowKey, text)` → 得到段文本；套用 TC-3/TC-4 的两态判据。
- **期望**：节选原样保留占位符（≤300 字上限不变）；`interpolate:false` 不抛，`true` 必抛。
- **失败含义**：用户只要贴一段含占位符的消息，就能把任意未绑定窗口打死。

### TC-6: 反例③——需求标题含占位符，绑定段清单行字面保真 `validates: FR-2` <!-- serves: FR-2 -->

- **标本**：S-3（已绑定窗口 + 需求标题含 ASCII 双花括号占位符）。
- **步骤**：调 `boundSectionTextFrom(facts, tasks, ctx)` 取段文本；两态判据同上。
- **期望**：清单行里的标题原样保留；`interpolate:false` 不抛，`true` 必抛。
- **失败含义**：标题是台账字段（人可改），同属外来原文，必须与任务字段同等对待。

### TC-7: 文本逐字节不变式（既有断言全绿） `validates: FR-1` <!-- serves: FR-1 -->

- **标的**：`tests/capture.test.ts` / `tests/stage-prompts.test.ts` / `tests/acceptance-criteria.test.ts`。
- **期望**：**一个断言都不改**即全绿——证明改动只落在"渲染语义"，没碰文本内容。
- **失败含义**：有人顺手改了文案（本需求的边界外行为）。

### TC-8: 类型检查与构建产物 `validates: FR-1, FR-3` <!-- serves: FR-1, FR-3 -->

- **步骤**：`pnpm typecheck` → `pnpm build`。
- **期望**：均退出码 0；`dist/index.mjs` 时间戳/构建指纹更新。
- **失败含义**：产物没重建 → 重载后仍是旧代码，窗口照旧卡死。

## 运行时验证（证据留档，非单测） `serves: FR-3`

| 证据 | 取法 | 判据 |
|---|---|---|
| 窗口解冻 | 重载后在被卡窗口 `session-5632659d`（`REQ-261005105032-3b02`）发一条消息 | 窗口正常回复一轮（不再整轮失败） |
| 装配正常 | 读 `/Users/mac/.dsh/state/reqboard-capture-diag.log` | 出现该窗口的 `NODE-4` 与 `NODE-5` 行（含 `pending=NONE` 或 `EXISTS`，均为正常分支） |
| 台账无新故障 | 读该需求 `record.json` 的 `interruption` | 时间戳仍为事故那次（`1791190281767`），**无新增**同形记录 |

> 说明：`QueueTaskStore` 的任务是**进程内缓存**，只改盘上的 `queue.json` 不重启不生效——所以解冻必须走"重建 + 重载"。

## 测试覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4`

| 条款 | 覆盖用例 | 覆盖方式 |
|---|---|---|
| FR-1 | TC-1、TC-7、TC-8 | 装配断言 + 文本不变式 + 类型/构建 |
| FR-2 | TC-3、TC-4、TC-5、TC-6 | 三组外来原文反例 + 证伪半 |
| FR-3 | TC-8、运行时三项证据 | 构建产物 + 现场解冻证据 |
| FR-4 | TC-2 | 全段显式声明断言 |

**未覆盖说明**：不改宿主，故**不测**宿主的插值器本身（那是宿主自己的测试面）；
本次只测"我们传对了开关"与"我们的文本在任何开关下都保真"。

## 关键决策与取舍 `serves: FR-2`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 判据来源 | 直接调宿主 `renderPrompt` | 测试内复刻宿主同语义判据 | 宿主内部函数未导出到测试面；复刻判据 + 写明参考契约同样能证伪，且不引入跨包耦合 |
| 反例要不要"证伪半" | 只断言"不抛" | 加 TC-4 先证"会抛" | 只证"不抛"是恒真断言的重灾区 |
| 是否补 E2E 探针 | 写一个 headless 探针驱动窗口 | 只留运行时证据三项（人可复核） | 驱动窗口需要真实会话与插件重载，探针化收益低、脆性高 |

## 技术方案与亮点 `serves: FR-2`

- **反例先行**：先证明"这笔输入在旧语义下必抛"（TC-4），再证明"新语义下字节级保真"（TC-3/5/6）——
  两条腿站住，测试才不是装饰。
- **三组外来原文全覆盖**：任务字段（agent 写的）、用户消息（人写的）、需求标题（人改的）——
  正是本次事故的三种可能入口，一个都不漏。
