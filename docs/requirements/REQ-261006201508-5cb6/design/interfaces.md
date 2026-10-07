<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

# 接口设计（REQ-261006201508-5cb6 pm 插件工具面梳理与文档计数校准）

> 本需求**不改任何对外工具接口**。本文档把三处「新定的内部契约」写死：
> README 工具表的机器可读口径、注册日志的派生口径、校验用例的输入输出口径。
> 这三处是后续实施与验收的判据——契约定不死，就不算设计完成。

## 1. 对外工具接口：零变更 `serves: FR-1`

**结论**：27 个 `reqboard_*` 工具的名字、入参 schema、返回体、错误码、副作用**逐条不变**。

| 面 | 改前 | 改后 | 依据 |
|---|---|---|---|
| 工具名集合 | 27 个（`TOOL_REGISTRY`） | 27 个，完全相同 | 需求边界「不新增 / 不删除 / 不改名任何工具」 |
| 入参 schema | 各工具原样 | 原样 | 同上 |
| 返回体 / 错误码 | 各工具原样 | 原样 | 同上 |
| 别名 `reqboard_task_execute` | 已弃用兼容壳 | 保留（仅文档标注「已弃用」） | 清退别名属行为变更，另立需求 |

**调用方影响**：无。窗口 agent、看板页面、HTTP 路由的调用方式一律不变。

## 2. 内部契约：README 工具表 `serves: FR-1, FR-2`

**用途**：让「人读的工具表」同时是「机器可校验的表」——校验用例按本契约抽取事实。

| 契约项 | 形态（逐字） | 校验方式 |
|---|---|---|
| 节标题与计数 | `## 提供的工具（N 个）` | 正则抽 `N`，断言 `N === TOOL_REGISTRY.length` |
| 工具行 | 表格首列放反引号包裹的 `reqboard_xxx`（一行一个工具） | 行正则计数，断言 `=== TOOL_REGISTRY.length` |
| 工具名集合 | 全文出现的 `` `reqboard_[a-z_]+` `` | 与 `TOOL_REGISTRY.map(e => e.toolName)` **双向差集为空** |
| 分组标题 | `### <组名>` | **不参与断言**（排版自由度） |

**字段级约束**：

| 约束 | 说明 |
|---|---|
| 每行必须恰有一个工具名 | 一行的首单元格就是该工具名；描述里不再重复写别的工具名（避免集合抽取到"被顺带提及的工具"） |
| 别名也占一行 | `reqboard_task_execute` 在表内，描述写「已弃用别名：等价 `reqboard_task_run`」 |
| 描述不得写未证实的数字 | `reqboard_capture` 行的描述**不写提问数**（口径三套并存，见 `architecture.md` 第 13 节遗留问题） |

**使用示例**：

```markdown
## 提供的工具（27 个）

### 立项与自查

| 工具 | 作用 |
|---|---|
| `reqboard_capture` | 立项弹框：… |
```

## 3. 内部契约：注册日志 `serves: FR-3`

**用途**：装配期日志是"工具到底注册上没"的第一现场，名单必须与登记面同源。

```typescript
// Before（手写数字 + 手写名单，实测漂移为 (13) 且只列 19 个）
logger.info(
  'agent tools registered (13): reqboard_create / reqboard_capture / … / reqboard_skill_install',
)

// After（数字与名单都从登记面派生）
logger.info(
  'agent tools registered (' + TOOL_REGISTRY.length + '): '
  + TOOL_REGISTRY.map(e => e.toolName).join(' / '),
)
```

**契约**：

| 项 | 约定 |
|---|---|
| 行形态 | `agent tools registered (N): a / b / c`（单行，` / ` 分隔） |
| N | `TOOL_REGISTRY.length`（派生，禁止字面量） |
| 名单 | `TOOL_REGISTRY.map(e => e.toolName)`（派生，禁止字面量） |
| 级别与时机 | `logger.info`，仍在 `toolsCtx.effect` 内、注册循环之后（不变） |

**异常情况**：

| 情况 | 行为 |
|---|---|
| 某工具工厂注册失败 | 既有行为不变（注册抛错即响亮失败，日志不会打印） |
| 登记面为空数组 | 日志打印 `(0): `（不崩；正常装配不会发生） |

## 4. 内部契约：校验用例输入输出 `serves: FR-4`

**用途**：把「文档漂移」变成一次可跑的判定。

**接口定义**：

```typescript
/** 用例读入（全部为仓内只读路径，相对仓库根解析） */
interface ReadmeToolFaceInput {
  readmePath: string      // 缺省 'README.md'
  packageJsonPath: string // 缺省 'package.json'
  registry: readonly { toolName: string }[] // 实际传入 TOOL_REGISTRY
}

/** 用例输出（断言失败时的消息形态；成功无输出） */
interface ToolFaceDiff {
  missing: string[]   // 登记面有、README 没有
  extra: string[]     // README 有、登记面没有
  headerCount?: { declared: number; expected: number }
  rowCount?: { rows: number; expected: number }
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `readmePath` | `string` | 否 | README 路径 | `README.md` |
| `packageJsonPath` | `string` | 否 | package.json 路径 | `package.json` |
| `registry` | 数组 | 是 | 期望值来源 | 直接 import `TOOL_REGISTRY` |

**返回值说明**（断言消息，逐条点名）：

| 失败类别 | 消息包含 | 说明 |
|---|---|---|
| 缺项 | `README 缺：reqboard_handoff` | 登记面有、文档没写 |
| 多项 | `README 多：reqboard_advance` | 文档写了、登记面没有（幽灵名） |
| 表头计数 | `登记面 27 条 / README 写 26 个` | 抽到的 N 与登记面不等 |
| 表内行数 | `表内 26 行 / 登记面 27 条` | 表格行数不等 |

**异常情况**：

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| ——（不用错误码） | README 文件不存在 | 测试框架抛 `ENOENT`，用例红（响亮失败，不静默跳过） |
| —— | 抽不到节标题 | 断言失败并提示契约形态：`未匹配 ## 提供的工具（N 个）` |

**使用示例**：

```bash
pnpm vitest run tests/readme-tool-face.test.ts     # 期望：全绿
```

## 5. 删除的接口 `serves: FR-1`

**无接口删除**。注意区分：`reqboard_advance` 只是从 **README 文本**里删掉的一个
**从未存在的名字**——源码里没有这个工具，也没有可删的接口。

| 名字 | 原用途 | 处理 | 替代方案 |
|---|---|---|---|
| `reqboard_advance` | README 表里的幽灵条目 | 从 README 删除 | 真入口是 `reqboard_task_run`（表内已有） |

## 6. HTTP API 变更 `serves: FR-1`

**无变更**。`/dashboard/api/reqboard/*` 的端点、请求体、响应体一律不动；
本需求不新增端点、不改看板渲染。

## 7. 关键决策与取舍 `serves: FR-1, FR-3, FR-4`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 绑定契约的强度 | 要求 README 工具表逐字节等于某个 golden 文件 | 只绑定「节标题计数 + 行数 + 名字集合」 | 排版会持续优化；绑死会让每次调排版都红，最后被豁免绕过 |
| 日志改造深度 | 仅把 `(13)` 改成 `(27)` 并补全名单字面量 | 改为派生表达式 | 字面量名单是下一次漂移的种子；派生后不可能不一致 |
| 契约写在哪 | 只写在测试代码里 | 先写进本设计文档，再落测试 | 契约要能被实施者与验收者读到，而不是只活在断言里 |

## 8. 技术方案与亮点 `serves: FR-4`

**本份相关的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 契约与断言的关系 | 直接写断言，契约只存在于代码里 | 契约先落设计文档，测试实现它并**点名**失败项 | 实施者与验收者要能独立复核同一份契约 | 本文第 2/3/4 节 ↔ `tests/readme-tool-face.test.ts` |
| 文档的「机器可读面」 | 全文扫关键字 | 明确三条格式契约（节标题 / 行首 / 集合） | 全文扫会把描述里顺带提到的工具名也算进去，产生假红 | 本文第 2 节「字段级约束」 |

**技术栈与关键依赖**：见 `architecture.md` 第 15 节（vitest + node:fs，无新增依赖）。

**设计模式**：契约先行（contract-first）——先定表结构与失败消息形态，再写断言。
