<!-- serves: FR-1, FR-4 -->

# 数据模型设计（REQ-261006201508-5cb6 pm 插件工具面梳理与文档计数校准）

> **本份结论：无数据结构变更。** 本文档只做两件事：把「为什么无变更」写实，
> 并把本需求**只读引用**的既有结构（`ToolRegistryEntry`）的字段契约钉住——
> 校验用例的期望值全部来自它，它的字段语义变了，校验就失去意义。

## 1. 结论：无数据结构变更 `serves: FR-1`

| 检查项 | 结论 | 依据 |
|---|---|---|
| 新增数据结构 | 无 | 改动只涉及 README 文本、package.json 描述、注释与日志字符串 |
| 修改字段 / 类型 | 无 | 不触碰 `src/shared/protocol.ts`、台账 JSON、任务卡结构 |
| 台账 schema 版本 | 不变（仍为现状版本） | 不写台账、不迁移、不回填 |
| 持久化 / 迁移 | 无 | 本需求零数据写入 |
| 测试夹具 | 无新增夹具 | 校验用例读仓内既有文件，不造数据 |

**为什么容易误判**：本需求改的是「描述工具面的文档」，不是「工具面本身」。
凡是涉及工具 schema、返回体、错误码的改动，都在需求边界外（见 `requirement.md` 的「边界（不做什么）」）。

## 2. 只读引用的既有结构 `serves: FR-1, FR-4`

### ToolRegistryEntry（`src/tools/registry.ts`，**只读、不改**）`serves: FR-1, FR-4`

**用途**：工具登记面的一条登记——本需求把它当作**期望值的唯一来源**，一个字节都不改。

**定义**（现状原样，**不修改**）：

```typescript
interface ToolRegistryEntry {
  key: string                   // 工厂名后缀：define<key>Tool（output-contract 的扫描键）
  factoryFile: string           // 工厂所在文件（src 相对路径）
  dir: string                   // 工具目录名（src/tools/<dir>）
  toolName: string              // 宿主注册的工具名（apply-wiring 名单派生源）
  responseSources: readonly string[] // 响应字面量所在文件（可多个）
}
```

**字段说明**（本需求用到的部分）：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `toolName` | `string` | 是 | 宿主注册的工具名，如 `reqboard_handoff` | 本需求拿它当**期望工具名集合**；28 条时必须与 README 同步 |
| `dir` | `string` | 是 | 工具目录名 | 由 `tests/tools-dispatch.test.ts` 与磁盘目录集合比对（既有不变量） |
| `factoryFile` | `string` | 是 | 工厂文件路径 | 由 `tests/output-contract.test.ts` 消费（既有不变量） |
| `responseSources` | `readonly string[]` | 是 | 响应字面量来源文件 | 既有门禁用；本需求不读它 |

**索引设计**：不适用（内存常量数组，无持久化、无索引）。
**关联关系**：不适用（无外键、无关联结构）。

### 校验用例的期望值形状 `serves: FR-4`

**用途**：用例内部从登记面投影出的两个派生值（非持久化结构，不落盘）。

```typescript
// 派生：不新增数据结构，只是 map/length 的中间结果
type ExpectedToolFace = {
  names: readonly string[]  // = TOOL_REGISTRY.map(e => e.toolName)
  count: number             // = TOOL_REGISTRY.length
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `names` | `readonly string[]` | 是 | 期望工具名集合 | 必须**派生**，禁止字面量数组 |
| `count` | `number` | 是 | 期望条数 | 必须**派生**，禁止写成 `27` |

## 3. 兼容性分析 `serves: FR-1`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| 台账数据 | —— | —— | 无变更，无需迁移 |
| 工具 schema | 27 个工具各自现状 | 完全相同 | 无 |
| 登记面结构 | 5 字段 | 完全相同 | 无 |
| README 表格排版 | 单表 23 行 | 分组多表 27 行 | 人读文档，无程序读取方；校验只认集合与计数 |
| `package.json` description | 含「13 个…」 | 含真实计数 | npm 元信息，无运行时读取处；`pnpm build` 不受影响 |

**回滚路径**：本需求零数据变更，回滚 = `git revert` 对应提交（无残留状态需要清理）。

## 4. 关键决策与取舍 `serves: FR-1, FR-4`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 是否给登记面加字段 | 给 `ToolRegistryEntry` 加 `group`（分组）字段，让 README 分组也机器可校验 | 不加字段，分组只在 README 手写 | 加字段会动到 3 个既有门禁测试的期望结构，收益只是"分组也可校验"；而分组会随认知调整，锁它反而碍事 |
| 是否新建文档清单结构 | 新建 `tools.json` 作为文档与代码之间的中间层 | 不建，直接用 `TOOL_REGISTRY` | 中间层 = 第三个需要同步的副本，正是本需求要消灭的东西 |
| 期望值写法和硬编码 | 用例里写死 27 与名字数组 | 派生 `names` / `count` | 写死会让"登记面加一条"变成假红，与 `tests/apply-wiring.test.ts` 的既有纪律冲突 |

## 5. 技术方案与亮点 `serves: FR-4`

**本份相关的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 数据结构清单的处理 | 强行造一个"文档模型"结构凑满本节 | 如实写「无变更」并钉住**只读引用**的结构契约 | 造出来的模型没人用，只会变成下一个漂移点 | 本文第 1 节结论 + `requirement.md` 边界节 |
| 期望值的形态 | 引入 `ExpectedTools` 类/接口 | 用例内的 `map` / `length` 中间结果 | 只有两个派生值，不值得为它定义一个类型 | `tests/readme-tool-face.test.ts` |

**设计模式**：未引入新模式。复用仓内既有惯例——「期望值从登记面派生」
（同 `tests/apply-wiring.test.ts`、`tests/tools-dispatch.test.ts`）。
