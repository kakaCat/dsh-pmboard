# 数据模型设计（REQ-261006123819-3af3）· serves: FR-1, FR-3

> 本需求**不改任何持久化结构**：FR-3 是删两个从未被写入的字段，FR-1 是新增一个**代码内常量表**，
> FR-2 的基线文件是知识层文档而非数据。故本文的重点是"删什么、删了之后判据从哪来、
> 以及新增常量表的确切形状"。

## 新增/修改的数据结构 <!-- serves: FR-1, FR-3 -->

### FR-3：删除的字段（唯一涉及协议结构的改动） <!-- serves: FR-1,FR-3 -->

```ts
// src/shared/protocol.ts:983-984  —— 整两行删除
// 删除前
export interface ArchiveRecord {
  ...
  archivedAt?: number
  archivedBy?: ActorRef
  submittedAt: number
  submittedBy: ActorRef
}
```

```ts
// src/client/types.ts:144-145  —— 客户端镜像同步删除
  archivedAt?: number
  archivedBy?: ActorRef
```

**删除依据（不是"看起来没人用"，是数据事实）**：

| 判据 | 命令 | 结果 |
|---|---|---|
| 有写入者吗 | `grep -rn "archivedAt\s*[:=]\s*[^=]" src/ lib/ scripts/` | 唯一命中是造数夹具 `scripts/fixtures/req-detail-specimen.mts:376`，**生产零赋值** |
| 真实数据里有人写吗 | 台账扫描（§证据：87 条 archived 记录） | 有 `archive` 记录的 64 条里 `archivedAt` 命中 **0** |
| 字段可空吗 | 协议声明 | `archivedAt?: number`，可空 ⇒ 删除**不需要数据迁移**，旧记录不含该键也合法 |

**为什么不是"补上写入点"**（D-2 已裁定）：字段曾经断过一次（按钮下线后无人写），
补写入点会让它继续存在且仍无人保证下次不断。删掉后判据回到 `RequirementRecord.status`——
一个**有真实写入者、UI 已在用**的字段。

### FR-3：新增的判定函数（不改存储，只收敛判据） <!-- serves: FR-1,FR-3 -->

```ts
// src/domain/status/ArchivedMoment.ts（新增文件）
import type { StatusEvent } from '../../shared/protocol.js'

/**
 * 这条需求进入 archived 的时刻——**唯一判定点**。
 *
 * 取值来源：`statusHistory` 中最后一条 `status === 'archived'` 事件的 `at`。
 * 为什么不用 `archive.submittedAt`：那是"归档材料提交时刻"，与"归档时刻"是两件事；
 * 拿它冒充归档时刻正是本需求要消灭的那类谎报（FR-3）。
 *
 * 拿不到时返回 `undefined` —— 调用方必须**整体省略**该键，不得发 undefined/null
 * （绑定层无损 JSON 铁律：值为 undefined 的属性会被整体拒收）。
 */
export function archivedMomentOf(req: { statusHistory?: readonly StatusEvent[] }): number | undefined {
  const hits = (req.statusHistory ?? []).filter(e => e.status === 'archived')
  return hits.length > 0 ? hits[hits.length - 1]!.at : undefined
}
```

**覆盖率实测（真实台账，非夹具）**：`archived` 记录 **87 条，87 条都能取到真实时刻**（100%），
时刻范围 2026-09-29 20:25 → 2026-10-06 12:24。

**为什么放 `domain/status/`**：服务端（`QueryDocs`）与客户端（`views/verification.ts`）都要用，
且 `client/` 已有 import `domain/` 的先例（`src/client/node-panel.ts:31`、`src/client/render/subtask-view.ts:17`）。
不放 `shared/protocol.ts`：该文件 1114 行且卡在 `size-budget` 白名单内，不应再加内容。

### FR-1：新增的登记表（代码内常量，非持久化数据） <!-- serves: FR-1,FR-3 -->

```ts
// src/tools/registry.ts（新增文件）
export interface ToolRegistryEntry {
  /** 工厂名去掉 define/Tool 前缀后的键（= output-contract 的扫描键，如 'TaskAdopt'） */
  key: string
  /** 工厂所在文件（src 相对路径，如 'tools/AdoptTaskTool/TaskAdoptTool.ts'） */
  factoryFile: string
  /** src/tools 下的目录名（如 'AdoptTaskTool'）——tools-dispatch 的目录清单由此派生 */
  dir: string
  /** 注册到宿主的工具名（如 'reqboard_task_adopt'）——apply-wiring 的名单由此派生 */
  toolName: string
  /**
   * 响应字面量所在的**全部**源文件（src 相对路径）。
   * 必须含两处：① 委托的用例文件；② 工具自身 catch 分支里的内联 return（若有）。
   * 例：SkillInstall 既有用例返回，也有工具内联的失败返回 ⇒ 两条路径都写。
   */
  responseSources: readonly string[]
}

export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [ /* 27 条 */ ]
```

**这张表的 27 条必须逐条与三处机器事实对齐**（对齐方式见 `interfaces.md` 的「登记面单点化」）：

| 机器事实 | 来源 | 关系 |
|---|---|---|
| 磁盘目录 | `readdirSync('src/tools')` 的目录 | `registry.dir` 集合 == 磁盘目录集合 |
| 宿主注册 | `apply()` 后 `ctx.tools.map(t => t.name)` | `registry.toolName` 集合 == 宿主注册名集合 |
| 工厂存在 | 正则扫描 `export function define(\w+)Tool(deps: UseCaseDeps[,)]` | 扫到的工厂集合 ⊆ `registry.key` 集合 |

### FR-1：本次必须补齐的 6 条映射（差异事实，已实测） <!-- serves: FR-1,FR-3 -->

| key | dir | toolName | responseSources | 现状 |
|---|---|---|---|---|
| `TaskAdopt` | `AdoptTaskTool` | `reqboard_task_adopt` | `application/use-cases/AdoptTask.ts` | **缺映射**（门禁红） |
| `Knowledge` | `KnowledgeTool` | `reqboard_kb` | `application/use-cases/QueryKnowledge.ts` | **缺映射**（门禁红） |
| `Regenerate` | `RegenerateTool` | `reqboard_task_regenerate` | `application/use-cases/RegenerateChain.ts` | **缺映射**（门禁红） |
| `SkillInstall` | `SkillInstallTool` | `reqboard_skill_install` | `application/use-cases/InstallSkills.ts` + `tools/SkillInstallTool/SkillInstallTool.ts`（catch 内联 `return {success,code,message}`） | **缺映射**（门禁红）且**不在 apply-wiring 名单**（该名单实际 26 条、少它一条） |
| `Bind` | `BindTool` | `reqboard_bind` | `application/use-cases/BindSeat.ts` | **门禁完全扫不到**（工厂带第二参数，正则不匹配） |
| `Handoff` | `HandoffTool` | `reqboard_handoff` | `application/use-cases/HandoffOwner.ts` | **门禁完全扫不到**（同上） |

**为何 `SkillInstall` 要写两个路径**：它的 `execute` 有两条返回路径——成功走用例
`src/application/use-cases/InstallSkills.ts`，`catch` 分支在工具文件内**内联**返回
`{ success, code, message }`（`src/tools/SkillInstallTool/SkillInstallTool.ts:74-78`）。
漏掉任一条，就有一半返回形状不被门禁看着。

## 关键决策与取舍 <!-- serves: FR-1, FR-3 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 登记面形状 | 保留三份手写清单，各改各的 | 新增 `TOOL_REGISTRY` 单表，三份清单从它派生 | 现状是**三处清单三个数**（工具目录 27 / 派发表 18 / 接线名单 26）；不收敛就会再次漂移（FR-1） |
| 覆盖驱动方式 | 继续用正则扫描当驱动 | **registry 当驱动**，正则降级为"未登记工厂"的安全网 | 正则漏掉带第二参数的工厂（`Bind`/`Handoff` 现完全无覆盖）；registry 驱动才能保证"登记了就被看着" |
| 注册表放哪 | 放进 `src/tools/index.ts`（既有出口） | 新增 `src/tools/registry.ts` | `index.ts` 是宿主的**导出面**（export 语句），把 27 条元数据塞进去会让"导出面"和"登记表"两种职责混居；独立文件可单独被测试 import（不必启动宿主） |
| 归档时刻来源 | `archive.submittedAt`；或新增写入点记 `archivedAt` | `statusHistory` 里 archived 事件 | 真实数据 87/87 可取值；且 `statusHistory` 是**已有写入者**的字段（状态机在写），不需要新增写入逻辑 |

## 技术方案与亮点 <!-- serves: FR-1, FR-3 -->

- **删字段而非补字段**：本次两个与"归档态"相关的改动都朝"减少事实源"的方向走——
  `archivedAt`（无人写）删掉、判定收进 `archivedMomentOf` 一个纯函数、客户端不复制谓词。
- **登记表带 `responseSources`**：把"这个工具的响应字面量在哪"从测试文件里的 map
  搬进 `src/tools/` 与工具同处——加工具的人在自己的目录里就能看到要填什么，
  而不是去 `tests/` 里找一张 700 行文件中的表。
- **零迁移**：删的是可空字段，新增的是代码常量；回滚 = 恢复两行声明 + 删掉两个新文件。
