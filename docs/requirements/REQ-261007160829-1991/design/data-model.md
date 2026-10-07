---
serves: [FR-2]
---

# 数据模型设计（REQ-261007160829-1991）

## 新增/修改的数据结构 `serves: FR-2`

### unverifiedReason（验收项新字段）`serves: FR-2`

落点两处（互为镜像，字段名与取值域逐字一致）：

| 位置 | 类型 | 说明 |
|---|---|---|
| `src/shared/protocol.ts` → `VerificationItem` | `unverifiedReason?: 'blank_pass' \| 'anchor_missing'` | 协议层（台账、看板取数、RTM 读的都它） |
| `src/domain/workflow/AcceptanceSheetSpec.ts` → `SheetItemLike` | 同上（镜像） | 域层裁决用；协议层禁止被 domain import，故按既有镜像口径成对声明 |

字段语义（**只有一个**）：

| 取值 | 含义 | 何时写 |
|---|---|---|
| `blank_pass` | 点了通过但**没有结果文本** | 裁决时无文本（人工项无文本，或该项本无 `result`） |
| `anchor_missing` | 有文本但**没有可核验锚点**（非人工自填的那条路） | 文本非空、非人工项、非系统项、`hasResultAnchor` 为假 |
| 缺席（`undefined`） | 不是降级产物 | `passed` / `failed` / `pending` / `not_verifiable`，以及**全部存量数据** |

## 字段约束 `serves: FR-2`

- **可选**：不写不等于空串；读取方一律按可选处理（`=== 'anchor_missing'` 这类精确比较，不做 `!value` 判定）。
- **与 status 同生共死**：只在 `status` 落成 `unverified` 的那一次赋值里写；`status` 变 `passed` / `failed` 时**清空**。不存在「status=passed 却残留 anchor_missing」的状态。
- **不受人工自填拒绝影响**：I-4 抛错时该项**一个字段都不写**（拒绝 = 零改动，不是「写一半」）。
- **不做枚举校验的兼容负担**：读侧按字符串处理，遇到未知取值只当「未复核、无原因」呈现，不抛错（前向兼容：将来加第三类原因不必改读侧）。

## 兼容性与迁移 `serves: FR-2`

- **读侧零迁移**：老台账缺该字段 → `undefined` → 呈现为「未复核」，与今天逐字一致。
- **写侧只增不改**：不修改任何既有字段的类型、必填性、默认值。
- **不回填**：存量 `unverified` 项一律保持 `unverifiedReason` 缺席（D-3：本需求不代改历史数据）。存量解锁路径见需求文档「边界」。
- **契约镜像不漂移**：两处声明成对，由契约测试钉住（见 `test-cases.md` 的 TC-7）。

## 是否改表 / 改 schema、迁移与回滚 `serves: FR-2`

- **不改关系表、不改 schema**：`VerificationItem` 以**整条需求记录的 JSON** 形式落库（台账 JSON 文档 / SQLite 的 `payload` 为权威原件，结构化列只是镜像，见 `SqliteRequirementWriter` 的既有口径）。因此新增**可选**字段不需要 DDL、不需要 migration 脚本、不需要版本号升级。
- **迁移方式**：无。老记录按「字段缺席」自然读通。
- **回滚路径**：回滚 = 撤掉写该字段的两处代码；已写的字段变成「读侧不认的多余键」，按「未知取值」的既有口径被忽略，**不产生脏读、不需要数据清理**。另可用既有回滚开关 `DSH_REQBOARD_NO_ITEM_RESULT`（它的语义就是「整段回到改造前行为」）临时验证。
- **写盘原子性**：`unverifiedReason` 与 `status` 在同一次 `mutate` 内写（不新增第二次写盘）；写失败即整体回滚，不产生半成品。

## 关键决策与取舍 `serves: FR-2`

- **为什么另立字段，而不是把原因写进 `opinion`**：`opinion` 是**人的话**（也是覆盖留档的比对基准），拿它承载系统判定会污染两处语义（看板展示、`isResultOverride` 比对）。
- **为什么用受控两值而不是自由文本**：回执要按原因分派不同补法（FR-2 的验收标准依赖它），自由文本会让「分派」退化成字符串匹配。
- **为什么不在 `evidence` 上做标记**：`evidence` 是整单级材料，验收项级的原因混进去会让「这一项为什么没过」失去唯一落点。
