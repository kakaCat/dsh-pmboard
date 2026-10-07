<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

# 架构设计（REQ-261006201508-5cb6 pm 插件工具面梳理与文档计数校准）

> 一句话：把「工具面有几个、叫什么、谁说了算」从**四处手写、互相矛盾**，收敛为
> **一处登记面（`src/tools/registry.ts`）+ 一条从它派生期望值的机器校验**；
> 文档里的计数不再是「手工同步的对象」，而是从登记面读出来的读数。

## 1. 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4`

**问题**：同一条事实（工具面有哪些工具）被手写在四处，且已经漂移；漂移**不报错**，
所以「看着绿」与「事实对」是两件事。

**当前状况**（实测，2026-10-06）：

- 事实源：`src/tools/registry.ts` 27 条，与磁盘 27 个工具目录、宿主注册名三方对齐。
- `README.md:42` 表头写「21 个」，表内实际 23 行；`README.md:13` / `README.md:107` 写「13 个」。
- README 表**缺** 4 个已注册工具：`archive_amend` / `handoff` / `skill_install` / `task_refs`。
- README 表**多**一个源码里不存在的名字 `reqboard_advance`（真入口是 `reqboard_task_run`）。
- `src/index.ts:907` 日志写 `agent tools registered (13)`，紧跟的名单只列 19 个名。
- `src/tools/index.ts:2` 文件头写「13 → 9 收敛后的 9 个工具壳」；`package.json` description 写「13 个立项/拆分/验收工具」。

**设计方案**：三条动作，互不越界。

1. **登记面不动**：`TOOL_REGISTRY` 的 27 条与字段语义保持不变——它已被 3 个测试消费
   （`tests/tools-dispatch`、`tests/apply-wiring`、`tests/output-contract`），是既有事实源。
2. **文档与注释向它对齐**：README 工具表按 27 条重写并分 6 组；其余三处计数按 FR-2 改；
   源码内日志与文件头注释按 FR-3 改成**从登记面派生**（不再手写名字与数字）。
3. **加一条派生校验**：新增 `tests/readme-tool-face.test.ts`，期望值全部从 `TOOL_REGISTRY` 派生，
   断言 README 表名集合与计数一致；漂移即红并点名。

**不这么做的后果**：漂移是静默的——漏改不报错、门禁照样绿；新窗口 agent 照 README 找工具会扑空
（少 4 个、多 1 个），对工具面的认知从接手第一分钟就是错的。

改动前 / 改动后：

```
改动前（4 处手写，各说各的）                    改动后（1 处事实源 + 1 条校验）
------------------------------                  ----------------------------------
registry.ts (27) ──┐                            registry.ts (27) ──┬──▶ README 表（27，分 6 组）
README 正文 (13)   │                                               ├──▶ README 正文/目录树/package.json
README 表头 (21)   ├──▶ 谁也不看谁 ──▶ 漂移静默                    ├──▶ src/index.ts 日志（派生名单）
README 表内 (23)   │                                               └──▶ tests/readme-tool-face.test.ts
index.ts 日志 (13) │                                                      │
tools/index.ts (9) ┘                                                      └──▶ 差集非空 → 红 + 点名
```

## 2. 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

```
  README.md ──────────────▶ [改] 工具表 23→27 行 + 分 6 组；正文/目录树计数 13→27
        │
        ├──▶ package.json ──▶ [改] description 计数 13→27
        │
  src/index.ts:907 ───────▶ [改] 日志名单 = TOOL_REGISTRY.map(toolName) 派生（不再手写）
        │                        ▲
        │                        └── src/tools/index.ts ──▶ [改] 导出 TOOL_REGISTRY + 重写文件头注释
        │
  src/tools/registry.ts ──▶ [不动] 27 条登记面（期望值来源）
        │
        └──▶ [新增] tests/readme-tool-face.test.ts ──▶ 读 README + 登记面 → 集合/计数断言
```

**改动清单**：

| 文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `README.md` | 改 | 「提供的工具」整节重写：表头 27、表内 27 行、按 6 组分类；补 `archive_amend` / `handoff` / `skill_install` / `task_refs`；删 `reqboard_advance`；`reqboard_task_execute` 描述改为「已弃用别名」；`reqboard_submit` 描述补 design / prototype 两种 kind；`reqboard_capture` 描述不写提问数（口径见第 14 节遗留问题） | FR-1 | 仅人读文档，无代码影响 |
| `README.md:13` / `README.md:107` | 改 | 「13 个 pm 工具」「13 个 Agent 工具定义」→ 与登记面一致 | FR-2 | 同上 |
| `package.json` | 改 | description 的「13 个立项/拆分/验收工具」→ 与登记面一致 | FR-2 | 包元信息，无运行时读取处 |
| `src/index.ts` | 改 | 注册日志改为 `'agent tools registered (' + TOOL_REGISTRY.length + '): ' + TOOL_REGISTRY.map(e => e.toolName).join(' / ')` | FR-3 | 仅日志文本；级别（`logger.info`）与时机不变 |
| `src/tools/index.ts` | 改 | 增补 `export { TOOL_REGISTRY } from './registry.js'`；文件头注释按当前 27 个工具壳重写 | FR-3 | 新增一个再导出，不改既有导出 |
| `tests/readme-tool-face.test.ts` | 新增 | 从登记面派生期望值，断言 README 表名集合 / 行数 / 计数一致 | FR-4 | 新增测试文件，不改既有用例 |
| `tests/registry-log.test.ts` | 新增 | 以 stub ctx 执行 `apply()`，捕获注册日志行，断言 `N` 与名单都等于登记面 | FR-3 | 新增测试文件，不改既有用例 |
| `docs/requirements/<本 REQ>/requirement.md` | 改（设计节点内） | 补 feature 必填节「失败与并发路径」（2026-10-06 门禁加固新增该节；如实写失败路径、并发重复，并对不适用项写「不适用 + 理由」）；**FR-1~FR-4 条款原文未动** | 必填节门禁（`missingCategoryDocs`） | 需求文档已在册且已确认；design 阶段不允许重交需求文档（实测 `REQBOARD_BAD_STATUS`），故以本行留痕这次必要修改 |
| `src/tools/**/Tool*.ts` | **不动** | 工具行为、入参 schema、返回体、错误码一律不变 | 边界 | —— |
| `src/http/**` / `src/client/**` | **不动** | 不在本需求范围 | 边界 | —— |

## 3. 数据结构变更 `serves: FR-1`

**无变更**。本需求只改文本（README / package.json 描述 / 注释 / 日志字符串）并新增一个测试文件，
不新增、不修改任何数据结构、字段、类型或台账形状。详见 `data-model.md`。

## 4. 接口变更 `serves: FR-1, FR-3, FR-4`

### 对外工具接口 `serves: FR-1`

**零变更**。27 个 `reqboard_*` 工具的名字、入参 schema、返回体、错误码逐条不动。
本需求对工具面的唯一动作是「**描述**它」，不是「改它」。

### 内部模块接口：`src/tools/index.ts` 再导出 `serves: FR-3`

```typescript
// Before：工具面出口只有工厂
export { defineCreateTool } from './CreateTool/index.js'
// …（27 个 define*Tool）

// After：多一行再导出（登记面与工厂从同一个出口取，调用方不必知道 registry 的路径）
export { TOOL_REGISTRY, type ToolRegistryEntry } from './registry.js'
```

**改动原因**：`src/index.ts` 现有习惯是只从 `./tools/index.js` 取工具面符号（第 82 行的 import 块）。
**影响范围**：`src/index.ts` 一处新增 import；既有导出全部保留，无调用方需要改。

### 内部契约：README 工具表（机器可读口径）`serves: FR-1, FR-2`

校验用例依赖三条**格式契约**（写进这里，实施与验收都以它为准）：

| 契约 | 形态 | 说明 |
|---|---|---|
| 表头计数 | `## 提供的工具（N 个）` | N 必须等于登记面条数 |
| 表内工具行 | 行首 `\| \`reqboard_xxx\`` | 每行一个工具，`reqboard_` 名出现在行首单元格 |
| 分组 | `### <组名>` 二级标题 | 分组只是给人读的排版，**不参与断言**（避免把文档排版锁死） |

### 内部契约：注册日志 `serves: FR-3`

```typescript
// Before
logger.info('agent tools registered (13): reqboard_create / … / reqboard_skill_install')
// After（派生，无手写名单）
logger.info('agent tools registered (' + TOOL_REGISTRY.length + '): ' + TOOL_REGISTRY.map(e => e.toolName).join(' / '))
```

**契约**：日志形态保持「`agent tools registered (N): a / b / c`」单行；N 与名单**同源**，
不再存在"数字改了名单没改"的可能。

## 5. 依赖关系 `serves: FR-3, FR-4`

**新增依赖**：

| 依赖项 | 版本 | 用途 | 不引入的后果 |
|---|---|---|---|
| —— | —— | 无新增运行时依赖 | —— |

**删除依赖**：无。

校验用例只用仓内既有 devDependency（`vitest`）与 Node 内置 `node:fs` / `node:url`，
与 `tests/apply-wiring.test.ts` 的读文件方式同款。

## 6. 目录结构 `serves: FR-4`

```
dsh-pmboard/
├── README.md                              # 改：工具表 27 行 + 计数
├── package.json                           # 改：description 计数
├── src/
│   ├── index.ts                           # 改：注册日志派生
│   └── tools/
│       ├── index.ts                       # 改：再导出 TOOL_REGISTRY + 文件头注释
│       └── registry.ts                    # 不动：27 条登记面（期望值来源）
└── tests/
    ├── readme-tool-face.test.ts           # 新增：README ↔ 登记面 校验
    └── registry-log.test.ts               # 新增：注册日志 ↔ 登记面 校验
```

## 7. 关键算法/流程 `serves: FR-4`

### 校验流程 `serves: FR-4`

```
读 README.md 文本
   │
   ├─ 抽工具名集合：/`(reqboard_[a-z_]+)`/g ──▶ Set<string>
   ├─ 抽表头计数：/## 提供的工具（(\d+) 个）/
   └─ 抽表内行数：行匹配 /^\| `reqboard_/m 的条数
   │
   ▼
期望值（全部从登记面派生，不写死数字）
   ├─ expectNames  = TOOL_REGISTRY.map(e => e.toolName)
   └─ expectCount  = TOOL_REGISTRY.length
   │
   ▼
   ├─ 集合相等？ ── 否 ──▶ 失败：缺 [ … ] / 多 [ … ]（点名到工具）
   ├─ 表头计数 == expectCount？ ── 否 ──▶ 失败：报「登记面 N 条 / README 写 M 个」
   └─ 表内行数 == expectCount？ ── 否 ──▶ 失败：报行数差
```

### 关键决策点 `serves: FR-1, FR-4`

| 决策 | 选项A | 选项B | 选了哪个 | 为什么 |
|---|---|---|---|---|
| 期望值来源 | 测试里写死 27 与 27 个名字 | 从 `TOOL_REGISTRY` 派生 | **B** | 写死等于把「第二份事实源」搬进测试；登记面加一条时测试会假红。与 `tests/apply-wiring` 同纪律 |
| 断言范围 | 连排版 / 分组 / 列顺序一起锁 | 只锁工具名集合与计数 | **B** | 文档排版会随人优化（加列、调分组），锁死会让每次排版调整都红，最后被人加豁免绕过 |
| 表名抽取方式 | 只认标准表格行（`^\| \``） | 扫全文 `reqboard_*` | **A + B 并用** | 集合用全文扫（能抓"多写了一个不存在的名字"），行数用表格行正则（能抓"表少了一行"）；两者互补 |

## 8. 安全/性能考虑 `serves: FR-4`

**安全风险**：无新增攻击面。校验用例只以只读方式读仓内两个文件，无网络、无写盘、无子进程。

**性能影响**：

| 指标 | 改前 | 改后 | 可接受吗 |
|---|---|---|---|
| 插件启动 | 无此开销 | 无变化（日志字符串派生，O(27) 字符串拼接） | 可接受 |
| 测试耗时 | 无此用例 | 新增 1 个用例，读 1 个 md 文本 + 内存数组比较（< 50ms） | 可接受 |

## 9. 测试策略 `serves: FR-1, FR-2, FR-3, FR-4`

**必测场景**（用例明细见 `test-cases.md`）：

| 场景 | 输入 | 预期输出 | 用例编号 |
|---|---|---|---|
| 正向：表与登记面一致 | 现行 README | 全绿 | T-1 / T-2 / T-3 |
| 负向：README 少一行 | 临时删 `reqboard_kb` 行 | 红，消息含 `reqboard_kb` | T-4 |
| 负向：README 多一个未注册名 | 临时加 `reqboard_advance` 行 | 红，消息含 `reqboard_advance` | T-5 |
| 派生：登记面加一条 | 临时加一条登记项 | 红（README 未同步），且**不写死数字**也能报出差异 | T-6 |
| 计数一致性 | README / package.json 文本 | 无「13 个 / 21 个」残留 | T-3 / T-8 |
| 装配：注册日志派生 | stub ctx 跑 `apply()` 后捕获日志行 | `(N)` 与名单都等于登记面 | T-7 |
| 全量回归 | 既有测试套 | 与基线一致 | T-10 |

## 10. 错误处理 `serves: FR-4`

**新增错误码**：无（这是测试，不对外暴露错误码）。

**失败消息形态**（可核验：点名到工具）：

| 失败类别 | 消息包含 | 恢复动作 |
|---|---|---|
| 缺项 | `README 缺：reqboard_handoff` | 把该工具补进 README 表 |
| 多项 | `README 多：reqboard_advance` | 从 README 表删掉，或（若确实新增了工具）补进登记面 |
| 计数不符 | `登记面 27 条 / README 写 26 个` | 改表头计数 |
| 行数不符 | `表内 26 行 / 登记面 27 条` | 补回漏掉的行 |

## 11. 配置项 `serves: FR-1`

**无新增配置**。不引入开关：校验要么在，要么不在——给漂移检查加开关等于给漂移留后门。

## 12. 文档更新清单 `serves: FR-1, FR-2`

| 文档 | 更新内容 | 负责人 |
|---|---|---|
| `README.md` | 工具表 27 行 + 6 组 + 三处计数 | 本窗口 agent |
| `package.json` | description 计数 | 本窗口 agent |
| `docs/architecture/project-manual.md` | 归档阶段申报（本需求属 feature，需写 `manual_updates`）：工具面的事实源与校验口径 | 归档阶段 |

## 13. 遗留问题 `serves: FR-1`

| 问题 | 影响 | 计划何时解决 |
|---|---|---|
| **提问数口径三套并存**：`reqboard_capture` 实际弹 **5 问**（name/category/difficulty/doc_location/workspace，见 `CAPTURE_QUESTION_IDS` 与立项回执的 `answers`），但工具自述「四问」（`src/tools/CaptureTool/prompt.ts:2`）、注入文案写「三问」（`src/application/internal/capture-section.ts:48` 等 4 处、`README.md:12/18/46`）、客户端写「五问」（`src/client/node-panel-process.ts:76` 等 3 处），测试里两种口径都有（`tests/capture-tool.test.ts:91` 五问 / `tests/capture.test.ts:97` 三问） | 文档与提示词各说一套；本需求**不动**它（触及工具自述文案，超出「不改工具」边界），只保证 README 工具表的 capture 行**不写数字**、不再新增一处错 | 另立 doc 类小需求：先定事实源（`CAPTURE_QUESTION_IDS`），再统一约 12 处文案 |
| 已弃用别名 `reqboard_task_execute` 未清退 | 工具面长期多一个兼容壳 | 另立需求（需评估既有调用方） |
| README 表内其余行的措辞未逐条核对 | 可能还有与工具实际口径不符的描述 | 后续按 `reqboard_kb` 的代码地图逐工具核对（非本需求） |

## 14. 关键决策与取舍 `serves: FR-1, FR-3, FR-4`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 事实源放哪 | 新建 `tools.yml` / 脚本生成 README | 沿用 `registry.ts`，用测试校验 README | 登记面已有三条不变量并被 3 个测试消费；新造机制 = 第二套真相 |
| 日志怎么改 | 老老实实把 `(13)` 改成 `(27)` 并补全名单 | 改成从 `TOOL_REGISTRY` **派生** | 数字与名单同源后，"改了一个忘了另一个"这一类漂移被结构性消灭——比修一次数更值 |
| 清单落点 | 新建 `docs/architecture/pm-tool-face.md` | 就地升级 README 工具表 | README 是 agent 与人读工具的第一入口；另建页会再长出一处需同步的副本 |
| 是否顺带清退别名 | 删掉 `reqboard_task_execute` | 只在表中标注「已弃用别名」 | 删别名是行为变更（影响既有调用方），按需求边界不做 |
| 是否顺带统一提问数口径 | 本次一并把 12 处文案改成 5 问 | 列入遗留问题，另立需求 | 会改到工具自述提示词与注入文案（影响 LLM 看到的文本），已被需求边界排除；且口径事实源本身需要先裁定 |

## 15. 技术方案与亮点 `serves: FR-3, FR-4`

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| `vitest` | ^2.0.0（既有） | 校验用例 | 仓内既有测试框架；不引入新依赖 |
| `node:fs` / `node:url` | Node ≥20（既有） | 读 README 与 package.json | 与 `tests/apply-wiring.test.ts` 同款读法 |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| `src/tools/registry.ts` | 唯一手写登记面（本需求**只读**它） |
| `tests/readme-tool-face.test.ts` | 把「README 的工具面」与登记面绑成一条断言 |

**设计模式**：**单一事实源 + 派生断言**（single source of truth + derived assertion）。
不新造模式：与 `tests/apply-wiring.test.ts` 从 `TOOL_REGISTRY` 派生注册名单是同一种手法，
本需求只是把同一手法扩到文档面。

**关键实现手法**：

- 期望值全部**派生**（`TOOL_REGISTRY.length` / `.map(toolName)`），用例内不出现 `27` 这个常量。
- 集合比对用「双向差集」而不是 `toEqual` 一次报错：失败消息要点名到**具体哪个工具**，
  否则维护者还得自己去 diff 两个 27 元素集合。
- 表名抽取用全文扫（抓"多写的名字"）+ 表格行正则（抓"少的行"）**两条互补口径**。

**攻克的难点**：

- 难点一：**校验 vs 排版自由度**。一开始想把分组、列顺序一起锁死，但文档排版会持续优化，
  锁死会逼人加豁免。解法：只锁「工具名集合 + 计数」，分组不参与断言。
- 难点二：**不写死数字还要能报差异**。数字从登记面派生后，必须保证"登记面加了工具而 README 没加"
  也能报出**具体缺哪个**——用双向差集输出集合，而不是一个"长度不等"。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 修漂移 vs 消灭漂移 | 把 `13` 改成 `27`，下次再漂再改 | 日志名单改为从登记面**派生** | 手工同步的数字一定会再漂；同源后才结构性不可能不一致 | `src/index.ts` 注册日志；T-3 断言日志名单数 == 登记面 |
| 文档校验的粒度 | 逐字比对整张表（golden file） | 只断言集合与计数 | golden file 会让每次排版调整都红，最终被豁免绕过；集合断言只在**事实**变化时红 | `tests/readme-tool-face.test.ts` T-1/T-4/T-5 |
| 事实源数量 | 各自维护一份（本仓现状 4 处） | 1 处手写 + 3 处派生/校验 | 事实源越少，漂移面越小 | `src/tools/registry.ts`（唯一手写） |
