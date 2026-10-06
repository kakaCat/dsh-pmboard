---
serves: [FR-1, FR-3, FR-4, FR-5, FR-6]
---

# 用例设计（REQ-261005151245-54ae）

> 需求源：`requirement.md`（FR-1~FR-7）。场景语言：谁 → 什么条件 → 做什么 → 看到什么。
> 字段与签名见 `interfaces.md` / `data-model.md`，文件级改动见 `backend.md`，验收命令见 `test-cases.md`。

## UC-1 `reqboard_open_window`：源窗口开续作窗口 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

**谁**：源窗口里的 agent（人让它「开个新窗口接着干」）。**条件**：源窗口有标题、有模式、有模型读数；`mode` 缺省 `fork`。

1. 触发：agent 调 `reqboard_open_window`；输入 `mode`（可选）、`title`（可选，语义名）、`at_seq`、`seed_text`。
2. 插件侧：冷读源画像一次（`FR-2`）→ 按 `mode` 建窗（`create` 把源 `agentPreset` 随请求带入）→ 落继承三件套（**不短路**）→ 合成回执。
3. 宿主侧：`fork` 复制上下文并按源会话继承 preset；子会话收 `rename` 与 `selectModel` 各至多一次。
4. 投递：`seed_text` 非空则按自署来源投给新窗口（投递**在继承之后**，互不改变成败）。
5. **看到**：回执含 `window_key` 与 `inheritance`；侧栏出现「登录重构 (1)」；打开后模式芯片与模型选择器与源一致。

**`inheritance` 期望**：`title='set'`（`<源标题> (1)` 或显式 `title`）、`preset='set'`、`model='set'`、`reasons=[]`。

**异常路径**：源画像不可得 → 开窗仍成功，三项 `failed` + 原因原文；`rename` 或 `selectModel` 抛错 → 只该项 `failed`，不牵连另一项。

## UC-2 `reqboard_handoff`：交出需求并新建接管窗口 `serves: FR-1, FR-3, FR-4, FR-5, FR-6`

**谁**：源窗口（需求 owner）里的 agent。**条件**：水位到顶墙档，或人在 `reason` 里明确要求交接；`to_window` 不传 ⇒ 走新建窗口路径。

1. 触发：`reqboard_handoff`；输入 `reason`、可选 `mode`（新建窗口时缺省 `create`）、可选 `to_window`。
2. 插件侧：判水位档 → 解析源项目落点 → 建新窗口（`create` 带源 preset）→ 继承三件套 → **这才写台账**（席位升降 + `sourceSessionId`）。
3. 投递：断点底稿按自署来源（`kind=reqboard-handoff`）投给新窗口；投递失败不回滚交接。
4. **看到**：回执含 `from_window` / `to_window` / 角色变化，以及 `inheritance`（**仅新建窗口**时出现）；侧栏新会话标题为「<源标题> (1)」。

**`inheritance` 期望**（新建窗口路径）：`title='set'`（源标题递增）、`preset='set'`、`model='set'`；`to_window` 指向**已有**窗口时该键整体省略，且该窗口的标题 / 模式 / 模型**一个字节都不动**。

**异常路径**：建窗失败 → 台账零改动（失败发生在任何写入之前），回执按既有错误码响亮报出；显式 `to_window` 跨项目仍按既有 `REQBOARD_CROSS_PROJECT_SEAT` 拒。

## UC-3 看板迁移开窗：存储与数据库页发起迁移 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

**谁**：人在看板「存储与数据库」页点「发起迁移」。**条件**：请求带发起页的会话 id，且能解析出项目落点。

1. 触发：页面带 `session=<发起页会话 id>` 调迁移开窗路由（`src/http/routers/settings-support.ts:158` 的 `openMigrationWindow`）。
2. 插件侧：读源画像 → `create`（落点 + 源 `agentPreset`）→ 继承，标题走**显式语义名**（如「台账迁移窗口」，不递增）→ 投递迁移底稿。
3. 宿主侧：`create` 建会话并归入源项目分组；子会话收 `rename` 与 `selectModel`。
4. **看到**：页面给出窗口键与「打开迁移窗口」入口；侧栏出现标题为语义名的新会话；打开后模式与模型与发起页窗口一致。

**`inheritance` 期望**：`title='set'`（显式语义名）、`preset='set'`、`model='set'`；返回值与另两个入口**同一形状**。

**异常路径**：源画像不可得 → 窗口照建、迁移任务照投，三项 `failed` + 原因（**不**阻断迁移发起）；开窗本身失败仍走既有三态（能力未装配 / 建会话失败 / 底稿没送到）。

## 结果三态的用户观感 `serves: FR-5`

| 状态 | 人在侧栏看到什么 | 回执里看到什么 | 窗口能不能用 |
|---|---|---|---|
| `set` | 标题即「<源标题> (1)」或显式语义名；模式芯片、模型选择器与源窗口一致 | `inheritance` 对应项 `'set'`；`reasons` 里没有该项 | 开箱即用，无需手工重设 |
| `skipped` | 该项保持宿主默认（标题留默认、模式/模型回落默认） | 对应项 `'skipped'` + 原因，如「标题：源会话无标题」「模式：源会话未登记 Agent 预设」「模型：源会话无模型选择读数」（文案格式单点在 `interfaces.md` §`reasons` 文案规则） | 可用；人若在意该项，手工补一次 |
| `failed` | 外观与 `skipped` 相同（确实没写上） | 对应项 `'failed'` + 原因，`reasons` 里能看到**宿主错误原文**；同一响应 `success:true`、`window_key` 非空 | **仍然可用**；失败只记不拦，不静默 |

「读不到」与「源没有」两种情况**人一眼能分开**：前者三项 `failed` + 「源会话画像不可得——<读失败原因>」，
后者只有该项 `skipped` + 「源会话无…」。

三态都不改变「建会话 ≠ 打开窗口」的措辞纪律：`degraded_note` 逐字不动，回执里不出现「已打开」这类断言。

## 异常与边界用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 场景 | 触发者 / 条件 | 人看到什么 |
|---|---|---|
| 源画像不可得 | 服务未装配 / `projections` 抛错 / 会话不存在（`null`） | 开窗照常成功；三项 `failed` + 原因原文（不是「一入口 skipped、一入口 failed」的分叉） |
| 源无标题 | 源会话从未被命名 | **不调** `rename`（与 GUI 一致：无标题就不改名）；`title='skipped'`，不编造标题 |
| 源无模型读数 | `modelSelection.next` 为 `null`，或缺 `provider` / `model` | **不调** `selectModel`；`model='skipped'`，**不回落全局默认模型** |
| 显式标题覆盖 | 工具传 `title` / 迁移窗口语义名 | 子标题**恰为**显式值：不递增、不加后缀；源标题是什么都不影响这一项 |
| `create` 路径 preset 非法 | 源 `agentPreset` 已不存在（宿主 `agent-preset/not-found`） | **开窗就失败**——preset 是建会话请求的一部分，与 `mode=fork` 及 GUI fork 的既有行为一致，本需求不使这条变好也不变坏 |
| 端口未装配写能力 | 老宿主 / 测试替身只有 `fork`、`create` | 开窗成功；对应项 `failed` + 「未装配…能力」原因，**不伪造成功** |

## 端到端旅程图（一份图覆盖三条入口） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

```
人在源窗口（标题「登录重构」 / 创造模式 / 非默认模型）
    |
    |  (1) 触发：reqboard_open_window / reqboard_handoff(新建) / 看板迁移开窗
    v
+--------------------------------------------------------------+
| 插件用例层：冷读源画像（一次读全三样，不 resume 源会话）      |
|   projections({sessionId: 源})                               |
|   -> title / agentPreset / modelSelection.next               |
+--------------------------------------------------------------+
    |
    |  画像不可得 ---> 继续开窗（三项记 failed + 读失败原因）
    v  可得
+--------------------------------------------------------------+
| 宿主建会话：fork（按源 observation 继承 preset）              |
|             create（落点 + agentPreset 同一请求）             |
|   -> 子会话 id = 新窗口码                                     |
+--------------------------------------------------------------+
    v
+--------------------------------------------------------------+
| 继承三件套（不短路，各自独立）                                |
|   rename(子, 源标题 (1))    <- 有显式 title 就用它，不递增    |
|   selectModel(子, 源 modelSelection.next)                    |
|   preset：create 随请求带入 / fork 由宿主继承                 |
+--------------------------------------------------------------+
    v
回执 inheritance{title, preset, model, reasons} + window_key
    |  侧栏已出现该会话（建会话 ≠ 打开窗口，措辞照旧）
    |
    +-- seedText 非空 -> 自署来源投递（kind=reqboard-open-window）
    +-- 人看到：侧栏「登录重构 (1)」-> 打开 -> 模式芯片 / 模型选择器与源一致
```

## 用例与条款对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 用例 | 覆盖条款 |
|---|---|
| UC-1 `reqboard_open_window` | FR-1 / FR-2 / FR-3 / FR-4 / FR-5 / FR-6 |
| UC-2 `reqboard_handoff` 新建接管窗口 | FR-1 / FR-2 / FR-3 / FR-4 / FR-5 / FR-6 |
| UC-3 看板迁移开窗 | FR-1 / FR-2 / FR-3 / FR-4 / FR-5 / FR-6 |
| UC-4 结果三态观感 | FR-5（含 FR-6 的形状统一） |
| UC-5 异常与边界 | FR-1 / FR-2 / FR-3 / FR-4 / FR-5 |
| UC-6 端到端旅程图 | FR-1 / FR-2 / FR-3 / FR-4 / FR-5 / FR-6 |
| 可证伪回归 | FR-7（命令与判据见 `test-cases.md`） |
