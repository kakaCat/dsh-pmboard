---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 后端（host 侧）设计（REQ-261005151245-54ae）

> 需求源：`requirement.md`（FR-1~FR-7）；`sides: [backend]`——本需求不改客户端，无 UI 改动、不交原型。
> 架构与取舍见 `architecture.md`，字段与三态语义见 `data-model.md`，签名与错误语义见 `interfaces.md`，
> 三条入口的人 / agent 旅程见 `use-cases.md`，用例编号与取证口径见 `test-cases.md`。

## 文件级改动清单 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 文件 | 改动 | 类型 | 对应 FR |
|---|---|---|---|
| `src/application/ports.ts` | 新增 `WindowInheritanceStatus` / `WindowSourceProfile` / `WindowProfileRead` / `WindowModelSelection` / `WindowInheritance` 五个类型声明；`WindowCreateOptions`（`:803` 起）加 `agentPreset?`；`WindowOpenerPort`（`:774` 起）加 `readProfile?` / `rename?` / `selectModel?` 三个**可选**方法 | 修改（加性） | FR-2, FR-3, FR-4, FR-5 |
| `src/application/internal/window-inherit.ts` | **新增**四个导出：`increasedWindowTitle` / `readWindowProfile` / `presetInheritanceOf` / `applyWindowInheritance`（纯编排，零 I/O；文件须 ≤400 行，`tests/size-budget.test.ts` 兜底） | **新增** | FR-1, FR-2, FR-3, FR-4, FR-5 |
| `src/adapters/SessionWindowOpener.ts` | `createRequestOf`（`:45-51`）透传 `agentPreset`；新增 `readProfile` / `rename` / `selectModel` 三个实现（全仓**唯一 I/O 点**） | 修改 | FR-1, FR-2, FR-3, FR-4 |
| `src/application/use-cases/OpenWindow.ts` | 入参加 `title?`；流程改为**读画像 -> create 带 preset -> 建窗 -> 继承 -> 投递**；`OpenWindowValue` 加 `inheritance` | 修改 | FR-1, FR-2, FR-3, FR-4, FR-5 |
| `src/application/use-cases/HandoffOwner.ts` | `openTargetWindow`（`:266`）返回 `{ windowKey, inheritance? }`；新建窗口时带回执，`to_window` 指定已有窗口时不带 | 修改 | FR-5, FR-6 |
| `src/http/routers/settings-support.ts` | `openMigrationWindow`（`:158`）：create 前读画像并带上 preset；create 后 `applyWindowInheritance(..., { explicitTitle: '台账迁移窗口' })`；返回值加 `inheritance` | 修改 | FR-1, FR-3, FR-5, FR-6 |
| `src/tools/OpenWindowTool/OpenWindowTool.ts` + `prompt.ts` | parameters 加 `title`；output schema 加 `inheritance`；提示词补「继承三件套 + 三态如实回报」 | 修改 | FR-1, FR-5, FR-6 |
| `src/tools/HandoffTool/HandoffTool.ts` | output schema 加 `inheritance`（可选出现） | 修改 | FR-5, FR-6 |
| `src/index.ts` | **无需新服务注入**：只确认装配处端口实现已带新方法 | 确认（无代码改动） | FR-3, FR-4 |
| `tests/open-window-inherit.test.ts` | **新增**主用例集（T-01 ~ T-14） | **新增** | FR-1, FR-2, FR-3, FR-4, FR-5, FR-7 |
| `tests/open-window-tool.test.ts` | 回归 + 新增 `title` 透传断言 | 修改 | FR-1, FR-5, FR-7 |
| `tests/handoff-owner.test.ts` | 回归 + 新增「新建窗口带回执 / 指定已有窗口不带」断言 | 修改 | FR-5, FR-6, FR-7 |
| `tests/settings-storage.test.ts` | 回归 + 新增迁移开窗回执含 `inheritance` 断言 | 修改 | FR-5, FR-6, FR-7 |
| `scripts/open-window-inherit-probe.mts` | **新增**探针（假宿主服务，打印六个读数并断言三对相等，退出码 0） | **新增** | FR-7 |
| `src/client/**` | **不动**：回执多出的键前端不读（`sides=[backend]`） | — | — |

## 宿主依赖与不改宿主的边界 `serves: FR-3, FR-4`

| 宿主事实（已核实） | 出处（宿主仓库 `deepseek-harness`，只读） | 本需求的用法 |
|---|---|---|
| fork 的模型取**全局默认** `agentDefaultModel.currentSelection()`，**不是**源会话的 `modelSelection.next` | `packages/api/session-controller/src/commands.ts:266-284` | 对子会话补一次 `selectModel` 纠正（FR-4） |
| fork **会**继承源会话的 `agentPreset`（`composeAgent(presetForObservation(source))`） | 同上 `commands.ts:266-284` | fork 路径**不重复设** preset，只如实标 `set`（FR-3） |
| `create` 请求体支持 `agentPreset`；preset 不存在 -> `agent-preset/not-found` 抛错 | `commands.ts:105-144`、`agent.ts:375-397`、`preset/agent-preset-registry/src/index.ts:180-187` | create 路径随请求带入 preset（FR-3） |
| 冷读任一会话投影（含 `title` / `agentPreset` / `modelSelection`） | `packages/api/session-controller/src/index.ts:490-506` | 一次 `projections` 读全三样（FR-2） |
| `modelSelection` 对外形状 `{ lastUsed, next }`（`next = pending ?? lastUsed`） | `model-selection-projection.ts:58-68` | 取 `next` 当模型读数 |

宿主源码在**另一个仓库**（`/Users/mac/Documents/ai/dsh/deepseek-harness`），只读参考：
本需求**不改宿主实现**，也**不改客户端 UI**；标题 / 模式 / 模型写入后由宿主与界面自然反映。

## 适配器实现口径（`SessionWindowOpener`） `serves: FR-1, FR-2, FR-4`

三条共同纪律：三个方法都在「**服务按调用时解析**」的既有风格里（`this.service()`，与 `fork` / `create` 同款）；
服务缺失时**抛错**，由用例层翻成 `failed` + 原因，**不伪造成功**；空值一律按缺失；宿主错误原样抛，不在适配器里改写文案。
原因文案的改写只发生在用例层（`reasons`）。

### `readProfile(sessionId): Promise<WindowSourceProfile>` `serves: FR-2`

- 调 `sessionController.projections({ sessionId })` 一次读全三样；**只读源会话一次**（不 resume、不新增数据源）。
- 取值：`values.title`（非空 string）/ `values.agentPreset`（非空 string）/ `values.modelSelection?.next`（`provider` + `model` 都非空才算）；
  `title` 为空串按缺失，不写空标题。
- **读不到就抛**：服务不可用 → 抛「未装配读画像能力（readProfile）」；宿主抛错 / 投影返回 `null`（会话不存在）→ 原样抛。
  由 `readWindowProfile` 收成 `WindowProfileRead.reason`，**绝不静默返回 `undefined`**（那会让「读不到」被误报成「源没有」）。
- 三项都缺读数但读成功 → 返回 `{}`（合法空画像，三项各自 `skipped`）。

### `rename(sessionId, title): Promise<void>` `serves: FR-1`

- 调 `sessionController.rename({ sessionId, title })`；宿主错误**原样抛**（用例层翻成 `failed` + 原因）。
- 只在「有显式标题」或「源标题 trim 非空」时被调用；标题文本由 `increasedWindowTitle` 算好后传入。
- 端口方法未装配（测试替身没实现）-> 用例层记 `failed` + 「未装配写标题能力」，**不静默当过**。

### `selectModel(sessionId, selection): Promise<void>` `serves: FR-4`

- 调 `sessionController.selectModel({ sessionId, provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) })`；
  宿主错误原样抛；`reasoningEffort` 缺省时**不带该键**。
- **已知副作用（如实写出）**：宿主会把这次选择在后台存成**全局默认模型**——与「人在新窗口手动选一次模型」同效。
  需求 D-6 已裁定接受，本期不做规避（绕开就得新增宿主能力，超范围）。

## 用例接线顺序（`OpenWindow.ts`） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

```
  reqboard_open_window(mode, at_seq, seed_text, title?)

  (1) requireLiveDriver / 取 windowKey / windowKey 校验          （既有）
        |
  (2) opener.available() 检查                                    （既有）
        |
  (3) sourceRead = await readWindowProfile(opener, source)     <- 新（FR-2，附加调用 1/3）
        |
  (4) mode === 'fork' ? opener.fork(source, atSeq)
                      : opener.create({ ...落点, agentPreset? })  <- preset 随 create 带入（FR-3）
        |
        +-- outcome.ok === false --> 既有三条拒绝分支**逐字不变**，到此结束（无 inheritance）
        |
        v ok
  (5) inheritance = await applyWindowInheritance(opener, { childKey, mode, sourceRead, explicitTitle })
        |      (1) 标题：rename 或 skipped                        （附加调用 <=2/3）
        |      (2) 模式：presetInheritanceOf 纯函数，不动端口
        |      (3) 模型：selectModel 或 skipped                   （附加调用 <=3/3）
        v
  (6) delivery（seedText 投递，既有）          <- **在继承之后**
        |
        v
  回执：{ success, window_key, parent_session_id, mode, degraded_note, inheritance }
```

三条钉子：

- **顺序即语义**：继承一律在「**建窗成功之后、底稿投递之前**」——窗口还不存在时谈不上继承；
  继承没落定就投递，会让接管方先看到底稿、再看到配置。
- **继承不改成败**：`success` 只由「会话建成了没有」决定；步骤 (1)(2)(3) 任一失败都不回滚会话、不改 `success`。
- **不短路**：三项全部尝试一遍后一次性返回状态（标题写失败不影响模型继承，反之亦然）。

### `create` 路径的 `agentPreset` 来源 `serves: FR-3`

- 取值 `sourceRead.profile?.agentPreset`；**无则不传该键**（不是传 `undefined`），请求体保持改造前形状。
- create 路径 preset 非法 -> **建会话本身失败** -> 开窗失败（与 `mode=fork` / GUI fork 既有行为一致，本需求不使这条变好也不变坏）。
- fork 路径**不核验**子会话 preset：宿主继承是构造事实（见「宿主依赖」表），核验会多一次调用并突破 NFR <=3。

## 装配（`src/index.ts`） `serves: FR-3, FR-4, FR-6`

**无需新增服务注入**，两条理由：

- **preset 随 `create` 请求体带入**：`agentPreset` 是 `sessionController.create` 已有的请求字段，不新开服务通道。
- **标题 / 模型走既有 `sessionController`**：`rename` / `selectModel` / `projections` 都在同一个已注入服务句柄上，
  沿用「惰性解析器、每次调用现取」的既有取法（装配期拿不到 != 永远拿不到）。

**为什么不用宿主 `agentPresets.select`**：

| 方案 | 结论 / 理由 |
|---|---|
| 建窗后调宿主 `agentPresets.select` 设模式 | **否掉**：对**已开过轮的 fork 子会话**会抛 `agent-preset/locked`（预设被锁），fork 路径反而多一条注定失败的分支 |
| 本期选择 | `create` 走请求体 `agentPreset`；`fork` 交给宿主既有继承（`composeAgent(presetForObservation(source))`），本需求只如实回报状态 |

装配处只做一件事：**确认端口实现已带新方法**（`SessionWindowOpener` 实现 `readProfile` / `rename` / `selectModel`）。
测试替身（只有 `fork` / `create`）不实现这三个可选方法时走 `failed` + 「未装配…能力」原因，既有用例逐字不破。

## 错误处理与可观测 `serves: FR-2, FR-5`

| 情形 | 行为 | 回执 |
|---|---|---|
| 画像读不到（服务缺失 / `projections` 抛错 / 会话不存在） | **不阻断开窗**，`WindowProfileRead = { reason }` | 无显式标题时 `title`/`preset`/`model` **三项皆 `failed`** + 读失败原因；**不把读失败报成 `skipped`**；有显式 `title` 时该项按写标题结果取值 |
| `rename` 失败（抛错 / 方法未装配） | **不短路**，继续模型继承 | `title = 'failed'` + 原因；开窗仍 `success: true` |
| `selectModel` 失败（抛错 / 方法未装配） | **不短路** | `model = 'failed'` + 原因；`title` 不受影响；开窗仍 `success: true` |
| `create` 因 preset 非法失败（`agent-preset/not-found`） | **建会话失败 => 开窗失败** | 既有 `open_failed` + 宿主错误原文；**不出现** `inheritance` 键 |
| 画像读到了但源侧无读数（无标题 / 无预设 / 无模型选择） | 不动端口、不猜默认值 | 对应项 `skipped` + 中文一句话原因（「源没有」≠「读不到」） |
| 端口方法未装配（测试替身只有 `fork` / `create`） | 走失败态，**不伪造成功** | 读画像未装配 → 三项 `failed`（原因见 `interfaces.md` §`reasons` 文案规则）；既有用例逐字不破 |

措辞纪律（**逐字不动**）：`degraded_note` 与「建会话 != 打开窗口」照旧，回执里**不许**出现「已打开窗口」这类断言。
**不新增 `REQBOARD_*` 错误码**：继承没有「拒绝」态，只有 `set` / `skipped` / `failed`。

## 性能与体量 `serves: FR-2, FR-4, FR-7`

| 项 | 目标 / 事实 |
|---|---|
| 附加宿主调用 | **<=3 次**：`readProfile` 1 + `rename` <=1 + `selectModel` <=1，全部**串行** |
| 轮询 / 重试 | **无**：三项各一次调用，失败即记状态，不重试不等待 |
| 读取次数 | 源会话只读**一次**；fork 路径不追加读子会话核验（否则第 4 次，突破上限） |
| 成败影响 | **零**：三项都在会话建成之后，不影响 `success` 判定 |
| 时延 | 总附加耗时目标 P95 < 500ms（本地宿主同进程调用，无网络、无退避） |
| 写放大 | 零（本需求不写盘，不触 `writeAmplificationWarnBytes`） |

**P95 < 500ms 的测量方法**：探针 `scripts/open-window-inherit-probe.mts` 对假宿主服务 dry-run，
在 `readProfile` / `rename` / `selectModel` 调用前后各打一次 `performance.now()` 时间戳（探针打印每段耗时），
同时打印 `source_title / child_title / source_preset / child_preset / source_model / child_model` 六个读数并断言三对相等，退出码 0。

## 静态门禁与旁路防护 `serves: FR-5, FR-6`

| 门禁 | 要求 | 兜底 / 位置 |
|---|---|---|
| 层边界 | `application/` **不 import `node:` 与宿主包** => 三条宿主能力一律经端口注入（`window-inherit.ts` 是纯编排、零 I/O） | `tests/layer-boundary.test.ts` |
| 工具 output schema | schema 是 `additionalProperties: false` => **新回执字段必须同步声明**，否则键被静默丢掉 | `src/tools/OpenWindowTool/OpenWindowTool.ts:43-66`（parameters 加 `title`、output 加 `inheritance`）、`src/tools/HandoffTool/HandoffTool.ts:60-95`（output 加 `inheritance`） |
| 既有回执措辞 | `open-window-tool.test.ts` 四条既有断言（窗口码 != 源、`parent_session_id`、服务缺失响亮失败、`degraded_note` 含「请在侧栏打开」且不含「已打开」）**逐字不破** | `tests/open-window-tool.test.ts` |
| 迁移路由错误码 | `window_opener_unavailable` / `window_open_failed` / `dispatch_failed` 三码与文案不变 | `tests/settings-storage.test.ts` |
| 单文件尺寸 | 新模块 `window-inherit.ts` 与改动后的 `SessionWindowOpener.ts`（现 177 行）都须 ≤400 行 | `tests/size-budget.test.ts` |
| 知识层生成物 | 新增 `src/application/internal/window-inherit.ts` 会改 `docs/knowledge/code-map.md` + `code-map.symbols.tsv`（由 `src/**/*.ts` 确定性抽取）⇒ 实施后必须 `npx tsx scripts/kb-build.mts --write` 再 `pnpm kb:check`（kb C-13） | `scripts/kb-build.mts`、`pnpm kb:check` |
| 新测试文件头 | 新增 `tests/open-window-inherit.test.ts` 须在**文件头 20 行内**写 `serves: REQ-261005151245-54ae FR-x` 头注，否则被登记为「孤儿用例」（警告级，但会出现在验收面） | `collectOrphanTestFiles` / `testFileHasServesHeader` |
