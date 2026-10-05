# REQ-261002110908-81d0 架构设计 · 长文本入参的写法约定（工具描述 + 实施片段） `serves: FR-1, FR-2, FR-3`

> 范围：只改**文本** —— `reqboard_task_report` 的工具描述与参数说明、一处共享约定常量与覆盖清单、
> `implementing` 阶段提示词片段（含生成产物）、一个守覆盖的用例。
> **零行为变更**：工具入参 schema、返回体、拒绝码、落盘格式、状态机一律不动。
>
> 条件文档说明：本需求无前后端接口改动（`requirement.md` 的 front-matter 未声明 `sides`），
> 故不触发 `design/frontend.md` / `design/backend.md`；迁移与兼容见 `design/data-model.md`。

## 问题与现状 `serves: FR-1, FR-2`

**问题**：模型写长中文入参时半角双引号漏转义 → 工具参数 JSON 非法 → 适配器整轮报错（2026-10-02 实测两次，同卡连犯）。

现状三个缺口，正好对应三条 FR：

| 缺口 | 现状载体 | 后果（serves） |
|---|---|---|
| 没有「怎么写」的约定 | `src/tools/TaskReportTool/prompt.ts` 只说了参数是**什么** | `completed` 里裸引号（FR-1） |
| 约定无处共享 | 各工具 `description` 各写各的 | 改一处，换个工具又踩（FR-2） |
| 实施阶段无自检 | `implementing` 片段无汇报纪律 | 写之前没人提醒（FR-3） |

## 总体方案 `serves: FR-1, FR-2, FR-3`

三层，缺任一层都仍有洞：**① 单点约定**（共享常量）→ **② 覆盖面**（各工具描述引用它）→ **③ 时机提醒**（实施片段）+ 一个**守覆盖的用例**。

```
        src/tools/shared.ts（既有共享模块，22 行 → 加两个导出）
   +--------------------------------------------+
   | LONG_TEXT_ARG_NOTE   约定正文（唯一来源）    |
   | LONG_TEXT_FIELDS     工具 x 字段 覆盖清单    |
   +---------------------+----------------------+
                         | 引用（不复制粘贴）
      +------------------+-------------------+---------------------+
      v                                      v                     v
 TaskReportTool/prompt.ts         其他工具 parameters        implementing 片段
 （report 工具描述）                （submit/ask_confirm…）     （汇报前自检一行）
      |                                      |                     |
      +------------------+-------------------+                     v
                         v                        scripts/inline-prompt-fragments.mjs
              tests/arg-guidance.test.ts                      → generated/ 产物
         （遍历 LONG_TEXT_FIELDS 断言约定在场 = 守覆盖）
```

**为什么不把约定写进适配器 / 不改 schema**：触发点在模型输出侧，改 schema 治不了它（参数照样是字符串）；
真正的粒度修复在 DSH 核心（另立需求），见 `requirement.md` 的「边界」。

## 模块改动地图 `serves: FR-1, FR-2, FR-3`

| 模块/文件 | 类型 | 改动内容 | 原因 | 影响范围 |
|---|---|---|---|---|
| `src/tools/shared.ts` | 改 | 加 `LONG_TEXT_ARG_NOTE` + `LONG_TEXT_FIELDS`（见 interfaces.md 第 3 节） | FR-2 | 仅被工具定义 import |
| `src/tools/TaskReportTool/prompt.ts` | 改 | `TASK_REPORT_PROMPT` 追加三锚点（短句 / 「」代引号 / 拆多次） | FR-1 | 模型读到的工具描述 |
| `src/tools/TaskReportTool/TaskReportTool.ts` | 改 | `summary` / `completed` / `next_step` 的 `description` 各追加约定短语 | FR-1 | 同上；**类型与必填不变** |
| `src/tools/SubmitTool|AskConfirmTool|TaskMoveTool|CaptureTool|NoteInterruptionTool/*.ts` | 改 | 长文本字段 `description` 引用同一常量 | FR-2 | 同上；**schema 不变** |
| `src/domain/prompt/fragments/implementing/light.md`、`heavy.md`、`light/overrides.md`、`heavy/overrides.md` | 改 | 各加一行「汇报自检」 | FR-3 | 注入模型的实施提示词 |
| `src/domain/prompt/generated/**` | 生成 | C-16 重生成产物（**不手改**） | FR-3 | 运行时读生成物 |
| `tests/arg-guidance.test.ts` | 新增 | 三锚点断言 + 遍历覆盖断言 + 反向证伪 | FR-1/2/3 | 仅测试 |

## 数据结构变更 `serves: FR-1`

**无变更**：工具 `parameters` 与输出 schema、队列台账、产物簿、RTM 全部不动。
本需求新增的「数据」只有两个**进程内只读常量**（形状见 `data-model.md` 第 2 节）。

## 接口变更 `serves: FR-2`

**无对外接口签名变更**（工具名/参数名/类型/必填/长度上限一字不改）。
仅新增两个**模块内导出**供各工具与用例引用，签名见 `interfaces.md` 第 3 节。

## 依赖关系 `serves: FR-1`

**新增依赖**：无（只用既有 `shared.ts` 与既有脚本）。
**删除依赖**：无。

## 关键决策点 `serves: FR-1, FR-2, FR-3`

| 决策 | 选项 A | 选项 B | 选了 | 为什么 |
|---|---|---|---|---|
| 约定放哪 | 每个工具各写一遍 | 共享常量 + 引用 | **B** | 改一处全域生效；用例可遍历断言（FR-2） |
| 覆盖范围 | 只治 `reqboard_task_report` | 报告 + 同类长文本字段 | **B** | 事故是"长中文 + 引号"这一类，不是这一个工具（FR-2） |
| 超长入参怎么处置 | 硬拒（返回错误要求拆） | 只引导（描述里写） | **B** | 硬拒会拒掉合法汇报；本需求承诺**零行为变更**（FR-1） |
| 提示词加在哪 | 改 heavy 正文 | 只加覆盖层与轻档片段 | **B** | heavy 正文受 C-17 与 vendor 原文一致性约束（FR-3） |

## 测试策略 `serves: FR-1, FR-2, FR-3`

| 场景 | 输入 | 预期输出 | 用例 |
|---|---|---|---|
| 报告工具描述含三锚点 | `TASK_REPORT_PROMPT` | 三锚点全部命中 | TC-1 |
| 覆盖清单内每个字段都带约定 | `LONG_TEXT_FIELDS` x 工具定义 | 零缺项（缺项时报出名单） | TC-2 |
| 反向：删一个锚点 | 临时改写描述文本 | 用例必须红 | TC-3 |
| 反向：清单漏接新字段 | 造一个未接约定的长文本字段 | 用例必须红 | TC-4 |
| 片段与产物一致 | C-16/C-17 命令 | 退出码 0 | TC-5 |

## 错误处理 `serves: FR-1`

**无新增错误码**；本需求不新增任何拒绝路径（拒绝条件与文案结构零变更）。

## 回滚 `serves: FR-2, FR-3`

纯文本回滚：还原描述 / 常量 / 片段 → 跑 `node scripts/inline-prompt-fragments.mjs` 重生成 → 重跑用例。
无数据迁移、无状态残留、无需重启之外的操作。

## 文档更新清单 `serves: FR-1, FR-2`

| 文档 | 更新内容 |
|---|---|
| `docs/requirements/REQ-261002110908-81d0/tasks/*.md` | 各卡完工记录 |
| 归档时按 feature 规则申报 `manual_updates` | 把「长文本入参写法约定」写进项目说明书对应章节 |
