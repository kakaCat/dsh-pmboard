# 兼容口径与回滚说明（REQ-261005141830-7a3b · t8）

> 面向：验收人 / 后续维护者 / 出事时要退回来的人。
> 结论先行：**无数据迁移**——存量记录一条不改、不拒写；老 SQLite 库开库时**幂等补列**；
> 回滚是**反向编辑装配**（去掉项目表端口即回原行为），**不要 `git checkout`**
> （本仓工作区同时有多个窗口在途的改动，`checkout` 会把别人的活一起抹掉，实测过）。

## 一、存量记录口径（实测，不是推测）

对 `~/.dsh/reqboard/**/record.json` 全量审计（2026-10-05 本卡开工时，台账共 **74 条**）：

| 检查 | 条数 | 处置 |
|---|---|---|
| 带 `projectId`（新口径可归属） | **0** | ——（见下方"为什么是 0"） |
| 无 `projectId`（未归属，按路径兜底） | **74** | **不迁移、不拒写**：读写扫描全通，判定 `attributed=false` 并如实标注 |
| 其中本项目（`.../dsh/dsh-pmboard`） | 58 | 照旧可读可写，看板一并列出并标注未归属 |
| 其中另一个项目（`.../dsh/dsh-notice-webhook`） | 7 | 同左 |
| 其中第三处（`.../pi-investment/quantsys-v2`） | 6 | 同左 |
| 连 `workspaceRoot` 都没有 | 3 | 用调用方兜底根 + 标注（`T-15` 覆盖） |

**为什么带 `projectId` 的是 0**：本机**运行中的插件宿主仍是旧产物**（未重启、未重载），
这些记录是旧代码写下的；用例层已证明新立项会写身份（`T-08` / `T-11` / E-01b）。
重启宿主后新立项即带身份，**存量不需要动**。

**兜底口径**（与既有 `projectRootOf` 一致）：处理存量记录时用「调用方当前的项目根 / 记录自带路径」，
并在返回体与评论里**标注 `attributed: false`（未归属）**。

- 为什么不是「跳过」：跳了它们就再也没人管得住，看板会看起来「需求全没了」；
- 为什么不是「静默当成本项目」：那正是本需求要根治的病（把 A 的东西算到 B 头上）；
- 所以取「**照做，但如实说这是兜底**」。

**不做的**：不回填 `projectId` / 不迁移台账。回填要判断每条到底属于谁，而台账里没有可靠依据
——**猜出来的身份比空着更危险**。

## 二、老 SQLite 库（幂等补列）

老库（建表时没有 `project_id`）配本次代码，实测两种后果（复核用破坏性探针，2026-10-05）：

| 动作 | 补列前 | 补列后 |
|---|---|---|
| 读（`SELECT *` + 行映射取 `project_id`，缺列即 `undefined`） | **读得到**（缺列 = 未归属） | 同左 |
| 写（`INSERT` 按 `HOT_COLUMNS` **显式列名**） | **全部失败**：`table requirements has no column named project_id` | 正常 |

处置：开库时按 `PRAGMA table_info` 逐条补列（`requirements` 与 `archived` 各一条），
**列已存在即跳过，不重建表、不靠捕获 `duplicate column` 错误**（那会把真正的建表错误一并吞掉）。
实现与理由见 `src/repositories/sqliteSchema.ts` 的 `SQLITE_COLUMN_MIGRATIONS`。

`REQBOARD_SCHEMA_VERSION` **维持 9**：`projectId` 是可选字段 + 读端折算（与 `seats` 同款先例），
不升版、不需灰度。

## 三、回滚（反向编辑，`git checkout` 禁止）

### 3.1 最小回滚：只动装配（推荐）

去掉**项目表端口**的装配，判定链立刻回到"按路径"的改造前行为，记录上的 `projectId` 留着无害
（读端是可选字段，老代码忽略它）：

| 文件 | 反向做法 |
|---|---|
| `src/index.ts` | 删 `useCaseDeps.projectRegistry`、路由 deps 的 `sessionProject`、`diveRoundPorts.projectIdOfWindow` |
| 配置开关 | `docsRootSource=legacy-cwd` 本就不装配 `sessionProject` / `sessionWorkspace`（t13 既有回滚口），读根回到插件宿主目录 |

期望：所有归属判定退化为"路径形状比较 + 未归属标注"，即**改造前行为**（老装配零差异测试 `T-02`/`T-05`/`T-14` 仍绿）。

### 3.2 数据层回滚：**不需要**

- SQLite 多出的 `project_id` 列：读走 `SELECT *` + 行映射（多一列只是多一个键，**取不取由行映射决定**），
  写走显式列名（老代码不写这一列），留着无害；
- 记录上的可选 `projectId`：老读端不认该键，忽略即可；
- 没有任何"写进去就回不来"的格式变更（`schemaVersion` 未动）。

### 3.3 彻底回滚：逐文件清单

| 文件（相对 `src/`） | 反向做法 |
|---|---|
| `application/internal/project-identity.ts` / `project-root.ts` | 删；`support.ts` 里的 `projectRootOf` / `partitionByProject` / `normalizeProjectRoot` / `sameProjectRoot` 恢复为搬迁前实现 |
| `application/internal/support.ts` | 删 `rootOfRequirement` / `projectIdOfWindowForDeps` / `requireSameProject` / `CROSS_PROJECT_SEAT`；`applyRequirementWorkspaceRoot` / `ensureWritableProjectRoot` 改回只读 `record.workspaceRoot` |
| `adapters/WorkspaceRegistryProjectPort.ts` / `workspaceRegistryRows.ts` | 删（开窗落点 `SessionWindowOpener` 需要恢复自带的那份解析） |
| `application/ports.ts` / `domain/requirement/RequirementSummary.ts` / `shared/protocol.ts` | 删 `projectId` 字段、`includeUnattributed` 筛、`ProjectRegistryPort` |
| `repositories/ShardedRequirementWriter.ts` / `SqliteRequirementWriter.ts` / `sqliteRows.ts` / `sqliteSchema.ts` / `ShardedRequirementStore.ts` / `SqliteRequirementStore.ts` | 删 `project_id` 列、行映射、筛分支与 `SQLITE_COLUMN_MIGRATIONS` |
| `application/use-cases/CreateRequirement.ts` / `CaptureRequirement.ts` | 删立项写身份的几行与"未归属"评论 |
| `application/internal/knowledge-bootstrap.ts` | `ensure(root, projectId)` 改回 `ensure(root)`，去重键改回归一路径 |
| `application/use-cases/ExecuteTask.ts` | 删需求项目根的取数与出门前重校正 |
| `application/dive/round-driver.ts` | 删 `projectIdOfWindow` 端口与归属判定包装 |
| `application/use-cases/BindSeat.ts` / `HandoffOwner.ts` | 删两侧项目校验与回执新字段 |
| `http/routers/shared.ts` / `stages.ts` / `routes.ts` / `requirements.ts` / `envelope.ts` | 删 `sessionProject` / `projectSource` / 看板按项目筛 / 改绑校验 / `REQBOARD_CROSS_PROJECT_SEAT` 码 |
| `tools/BindTool` / `HandoffTool` / `CreateTool` | 删新增的输出字段声明 |
| `tests/project-identity*.test.ts`、`tests/support/dive-loop-harness.ts` 的新增项 | 删（本需求新增，可直接删） |

**风险**：彻底回滚会让原症状**立刻复发**——多窗口多项目并行时共享根互相覆盖、产物算到错项目。
故只应在"新判据造成不可接受的误拒"时才做；目前**未观察到任何误拒**
（本需求全部改动落地后，全量失败数逐字不高于开工前）。

## 四、验证命令（可复核）

```bash
# 存量口径与老库补列（T-14 存量回落 / T-15 两级兜底 / T-16 老库补列）
npx vitest run tests/project-identity.test.ts -t T-14
npx vitest run tests/project-identity.test.ts -t T-15
npx vitest run tests/project-identity.test.ts -t T-16

# 台账分布（存量仍在盘上、类型上仍是"未归属"）
python3 -c "import json,glob,collections,os;p=os.path.expanduser('~/.dsh/reqboard')+'/**/record.json';print(collections.Counter((json.load(open(f)).get('workspaceRoot'),json.load(open(f)).get('projectId')) for f in glob.glob(p,recursive=True)).most_common())"
```
