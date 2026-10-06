---
serves: FR-1, FR-3, FR-4, FR-5, FR-6
---

# REQ-261005122347-e07a · 接口设计

## 1. 新工具 `reqboard_skill_install`（serves: FR-1, FR-6）

投放的唯一入口。幂等：默认按 `sha256` 比对，全等即不重写。

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `requirement_id` | string | 否 | 缺省 = 本窗口绑定需求（与既有工具同一口径） |
| `skills` | string[] | 否 | 只投放指定的 skill 名；缺省 = 全部 7 个。未知名字 → 拒 |
| `force` | boolean | 否 | `true` = 忽略 sha256 全等，强制重写（用于排查资产损坏） |
| `root` | string | 否 | 覆盖投放根（绝对路径）；缺省 = `<会话工作区>/.dsh/skills` |

**返回**

```jsonc
{
  "success": true,
  "root": "/abs/path/to/workspace/.dsh/skills",
  "materialized": ["ui-ux-pro-max", "ui-styling", "..."],   // 本次真写的
  "reused": false,                                          // true = 全等跳过
  "bytes": 4404019,
  "manifest": { "commit": "477bcb28…", "version": "…", "trimmed": ["…"], "sha256Count": 214 },
  "python": { "found": true, "name": "python3", "version": "3.8.10", "path": "/usr/bin/python3" },
  "searchScript": "/abs/path/…/ui-ux-pro-max/scripts/search.py",
  "note": "该目录为过程资产，已写 .gitignore(*) 自忽略"
}
```

`python` 字段是**探测结果**（§4），让主 agent 一次拿到"能不能检索"，不必自己探。

**错误码（结构化，不静默）**

| code | 触发 |
|---|---|
| `REQBOARD_SKILLS_DISABLED` | 插件配置 `skills.enabled=false` |
| `REQBOARD_SKILLS_ASSET_MISSING` | `<pkg>/skills/<name>` 不在盘（装机漏打包）——附缺失路径 |
| `REQBOARD_SKILLS_UNKNOWN_SKILL` | `skills[]` 里有非 7 个受控名 |
| `REQBOARD_SKILLS_WRITE_FAILED` | 写盘失败（权限/磁盘）——附首个失败路径与原因，**不留半份**（先写临时目录再整体改名） |
| `REQBOARD_NOT_BOUND_TO_WINDOW` | 与既有工具同口径 |

**事务性**：先写到 `<root>.tmp-<id>`，逐文件校验 `sha256`，全部通过后 `rename` 顶替。
失败即删临时目录 → 目标目录**从头的到尾没被碰过**（与 `migrate-ledger-to-sqlite.ts` 的"暂存库顶上"同一纪律）。

## 2. 注入节契约（serves: FR-3）

- **落点**：brainstorming 节点的追加节，**可裁优先级**（数值 priority，**非 floor**）；注入链仍只有 `resolveStagePrompt` 一个取词入口。
- **字符上限 1200**（用例断言：超限即红）。五要素必须齐：

| # | 要素 | 断言锚点（用例搜文本） |
|---|---|---|
| 1 | 何时该做原型 | 「有界面/交互产物时」 |
| 2 | 必须派 subagent | 「必须派 subagent」 |
| 3 | 两个入口路径 + 先读 SKILL.md | `SKILL.md` 与 `scripts/search.py` 的**绝对路径**字符串 |
| 4 | 检索命令模板 | `--design-system` 与 `--variance`/`--density` |
| 5 | 子代理红线 + 产物落点 | `reqboard_` 禁用声明 + `prototype/` |

- **占位符规则**：注入文本里**不得**出现 `${CLAUDE_PLUGIN_ROOT}`（本仓无此变量，需求 §路径契约）；
  投放根路径由工具回执给，注入节只写"先调 `reqboard_skill_install` 拿路径"。

**逐字稿（设计定稿，实施照抄）**：

```text
## 原型工作原则（需求分析节点）

- 当本次需求会产生界面/交互产物时，先在 `docs/requirements/<REQ>/prototype/` 设计原型。
- **必须派 subagent 做原型**，主 agent 不亲自写原型界面。
- 派活前先调 `reqboard_skill_install()`：它返回两件事——投放根 `root` 与 `searchScript` 绝对路径。
- 子代理必须先读 `<root>/ui-ux-pro-max/SKILL.md`，再按需检索（2–5 个词、一个主意图）：
  `python3 <searchScript> "<query>" --design-system --variance N --motion N --density N`
  可用域：ux / style / color / typography / chart / landing / icons / gsap / product；栈用 `--stack <name>`。
- Python 缺失时：如实声明「本轮未做数据库检索，以下为通用默认」，禁止把 0 结果或未检索包装成检索结果。
- 子代理红线：不得调用任何 `reqboard_*` 工具、不得改需求/任务状态、不得写
  `docs/requirements/<REQ>/prototype/` 以外的路径（含不得往项目落 `design-system/`）。
- 子代理返回：产出文件路径 + 一句设计说明 + 用了哪次查询（或"未检索"）。
```

## 3. 子代理派发指令骨架（serves: FR-4）

主 agent 派活时按此骨架组 prompt（骨架放注入节里，主 agent 不必自创）：

```text
你是原型工（subagent）。本次只做原型，不改项目状态。
1) 读准则：<root>/ui-ux-pro-max/SKILL.md
2) 检索（可选，2–5 词）：python3 <searchScript> "<query>" --design-system --variance <1-10> --density <1-10>
   若 python 不可用 → 直接声明「未检索，按通用默认」，不要编造结果。
3) 产出：docs/requirements/<REQ>/prototype/<文件名>（只写这个目录）
4) 禁止：调用 reqboard_*、修改需求/任务状态、写 prototype/ 以外路径
5) 返回：{ files: [...], note: "一句设计说明", queries: ["…"] | "unretrieved" }
```

**红线为什么是硬约束**：原型是过程产物（`ArtifactSpec.ts` 里归 `notes` 兜底），
若子代理顺手推进了需求状态，五道人工闸门即刻失效（需求 E-5）。

## 4. 解释器探测契约（serves: FR-5）

- **顺序**：`python3` → `python` → `py -3`（实测本机：`python3` 3.8.10 可用，`python`/`py` 缺失）。
- **兼容性实测**：上游 `search.py` 在 **Python 3.8.10** 上 exit 0（含 `--design-system` 与 dials）；无需 3.9+。
- **探测点唯一**：只在 `reqboard_skill_install` 的适配层做一次（`child_process` 走 adapters 层，
  与 `src/adapters/SystemFileOpener.ts`/`StoragePathPicker.ts` 同层），结果进回执；
  **不**在 domain/application 层碰 `node:child_process`（层边界用例守着）。
- **缺失时行为**：工具照常投放成功（`python.found=false`），注入节照常注入；
  主 agent 必须把"未检索"如实转达（§2 逐字稿最后两条）。

## 5. 插件配置契约（serves: FR-7）

```ts
skills?: {
  enabled?: boolean          // 缺省 true；false = 不注入该节 + 工具返回 REQBOARD_SKILLS_DISABLED
  root?: string              // 投放根（绝对路径）；缺省 <会话工作区>/.dsh/skills
}
```

与非功能口径一致（`archive.unlistedGate`/`docsRootSource`）：**非法值装配期抛错**，不静默回落。
