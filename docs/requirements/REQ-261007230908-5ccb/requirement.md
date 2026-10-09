---
requirement_id: REQ-261007230908-5ccb
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [backend]
---

# 需求说明（REQ-261007230908-5ccb）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> 排版纪律：段落不超过 4 行；并列项用列表或表格；图一律 ASCII，禁用 mermaid。

## TL;DR

- **现象**：体检报告（REQ-261007165643-4275）§4.3 十项治理建议中，前三批已收 G1/G2/G3/G6/G7/G8/G9
  （第二批 REQ-261007200706-89b7）与工具面精简（第三批 REQ-261007220012-bd29）；
  剩 **G4（136 个大写错误码散落 123 个文件、无事实源）、G10（3 对双拼字段归一逻辑分散两处）、
  G5（错误码 prompt 清单漏码）+ 十项去向收官核对**未落地。
- **代价**：「prompt 列的码 = 代码抛的码」无法机械检查，漏码只能人眼抽查；
  双拼归一写两遍，改一处漏一处（plan-granularity.ts:73 独立再读一次就是实证）。
- **做完得到**：错误码常量注册表单源 + 「代码抛的码必须已注册」硬门（收敛存量扫描设施，不另起第二套）；
  双拼归一一个函数；体检报告 §4.3 十项 G 全部有去向，体检正式收官。

## 背景与证据

证据全文：`docs/requirements/REQ-261007165643-4275/design/research-report.md`
§3.2（错误码统计）、§1.3（双字段兼容统计）、§4.3（治理建议 G 表）。
批次脉络：第 1 批 bug 修复（REQ-261007193530-3133）、第 2 批文案契约
（REQ-261007200706-89b7，含路径存在性探针）、第 3 批工具面 27→21（REQ-261007220012-bd29），
均已完成/验收；本批 = 第 4 批·治理设施（防再犯机制）+ 收官。

### 关键现场（开工前实读复核）

| 项 | 现场 | 出处 |
|----|------|------|
| G4 存量设施 | `tests/helpers/error-code-scan.ts`（口径唯一实现，359 行）+ `tests/error-code-inventory.test.ts`（五组守卫）+ `tests/fixtures/error-code-inventory.json`（1719 行清单）+ `tests/drill/refresh-error-code-inventory.mts` 刷新钻 —— REQ-261006201814-ac4f 已建 | 本批盘点 |
| G4 种子 | `src/client/toolviews/shared.ts:151` 起大写码→中文映射表（可作注册表中文语义种子） | 报告 §4.3 G4 |
| G4 口径噪声 | 模板拼码 `REQBOARD_${…}` 13 处、占位 `REQBOARD_XXX`（已在 NOISE_TOKENS 排除清单） | 报告 §3.2 |
| G10 现场 | 归一读取 4 处：`src/shared/protocol.ts:1180`（skipIntegrationReason）、`:1197`（dep_reasons 并集）、`:1220`（granularity_exempt）、`src/application/internal/plan-granularity.ts:73`（独立再读，单源破坏点） | 报告 §1.3 + 实读 |
| G5 漏码 | OpenWindow 漏 OPEN_WINDOW_FAILED、SkillInstall 漏 SKILLS_INSTALL_FAILED、Create 漏 WINDOW_BOUND/INVALID_INPUT/INVALID_WORKSPACE、RunStatus 漏 REQUIREMENT_NOT_FOUND | 报告 §3.2 |

## 产品定义

一句话：给错误码与双拼字段各装一个「单一事实源 + 机械门」，让体检报告的防再犯建议闭环。

- **是什么**：1 个错误码常量注册表（src 侧可 import，含中文语义）+ 注册表一致性硬门
  （收敛既有 error-code-scan / inventory 守卫）+ prompt 列码校验 + 1 个双拼归一函数 + 收官对照表。
- **不是什么**：不改任何错误码的取值与触发条件；不改工具行为语义；不做 tasks[] 命名法统一
  （snake/camel 二选一是 G10 的「长期」半句，本批只收「单源化」半句）；不迁移 123 个文件的字面量为常量引用。

## 用户与角色

- **插件维护者（人）**：新增错误码时被硬门当场点名「未注册」，不再靠记忆同步 prompt 清单。
- **agent（工具调用方）**：prompt 里的错误码清单与实现同源，读到的码真实可触发。
- **CI / 测试**：注册表 ↔ 扫描 ↔ prompt 三方一致性由 vitest 守卫承载，报红给自助命令。

## 功能点

- **FR-1: 错误码常量注册表单源（G4 前半）**
  判据：注册表文件存在且 136 个在口径内大写码全量收录（`npx tsx tests/drill/refresh-error-code-inventory.mts` 后守卫绿；注册表条目数 = inventory 大写码数）。
- **FR-2: 注册表扫描硬门——代码抛的码必须已注册（G4 后半，收敛存量设施）**
  判据：`pnpm vitest run tests/error-code-inventory.test.ts`（及新增一致性用例）绿；负例（注册表删一条）即红并点名。
- **FR-3: prompt 列码校验——prompt 出现的码 ⊆ 注册表**
  判据：校验用例绿；负例（prompt 里写一个不存在的码）被点名。
- **FR-4: 双拼归一单源化（G10）**
  判据：3 对字段的双拼读取只剩归一函数一处实现（grep 归一模式命中数 = 1 处定义 + N 处调用）；`pnpm vitest run` 相关用例全绿。
- **FR-5: 收官盘点——G5 落实 + §4.3 十项去向对照表**
  判据：对照表落盘且十项 G 逐行有去向（REQ 编号 / 本批 FR / 明确不做及理由）；G5 按 D-4 裁定形态落地并可机械核验。

## 现状

- 大写 REQBOARD_* 码 136 个（去重、口径内）散落 123 个 .ts 文件，全是字符串字面量；
  `domain/errors.ts` 的 REQBOARD_ERROR_CODES 只收 16 个小写领域码——大写码设计上就没有事实源。
- 存量扫描设施（REQ-261006201814-ac4f）已保证「src 的码 ⊆ inventory 清单」与产生点抗漂移，
  但 inventory 是测试 fixture，代码侧不可 import，也不承载中文语义与「prompt 列码」校验。
- 3 对双拼字段（dep_reasons/depReasons、skip_integration_reason/skipIntegrationReason、
  granularity_exempt/granularityExempt）归一读取分散 4 处，其中 plan-granularity.ts:73
  绕开 protocol 归一结果独立再读原始对象。

## 目标结构

- 注册表：src 侧新常量文件（如 `src/shared/error-codes.ts` 或 `src/domain/error-code-registry.ts`，
  设计阶段定名），条目 = 码 + 中文语义（种子自 client/toolviews/shared.ts 映射表）+ 分层标签；
  大写码全量收录，模板拼码与占位码按 D-1 口径剔除。
- 硬门：在既有 error-code-scan 口径与 inventory 守卫之上**生长**（D-2 收敛裁定）——
  新增「扫描结果 ↔ 注册表」双向一致用例，不另写第二套扫描正则。
- prompt 校验：扫 `*prompt*.ts` 与工具 description 中的大写码字面量，断言 ⊆ 注册表。
- 归一函数：一个双拼取值函数（如 `dualField(o, 'skip_integration_reason', 'skipIntegrationReason')`，
  设计阶段定签名），4 处读取点改为调用；dep_reasons 的「两拼取并集」语义逐字保留。

## 行为不变式

- 错误码取值、触发条件、回执形状一律不变：本批只加事实源与门禁，不改任何 throw/reject 现场。
- 123 个字面量产生点不迁移为常量引用（避免 123 文件大改）；注册表是「登记层」，不是「替换层」。
- 双拼兼容语义不变：snake 主拼、camel 兼容；dep_reasons 两拼并集、skipIntegrationReason
  的「两键皆缺 = 空」判定、granularity_exempt 的 trim+≤300 截断逐字保持。
- client 端零行为变化：toolviews/shared.ts 映射表只作种子被读取；若设计决定让它改为
  「从注册表派生」，也仅限数据同源，无视觉/交互变化（sides 声明 [backend] 依据，见 D-5）。

## 失败与并发路径

- **失败路径①（新码未注册）**：某窗口新增 throw 新码 → 硬门红并点名 + 给自助命令
  （沿用既有「报红必须给路」纪律：刷新钻 + 注册表补条目两步）。绝不静默放行。
- **失败路径②（注册表与清单漂移）**：注册表条目被删/改而 src 仍在抛 → 双向一致用例红；
  反向（注册了不存在的码）同样红——防「注册表比事实乐观」。
- **失败路径③（prompt 校验口径）**：prompt 文案举例码（如「如 REQBOARD_XXX」）是占位不是清单——
  占位 REQBOARD_XXX 在 NOISE_TOKENS 内不计；其余 prompt 出现的码必须在注册表。
- **并发重复**：多窗口并发加码是本仓常态（inventory 测试头注释记载过实测漂移）——
  硬门把「发现漂移」从「人想起来」提前到「下一次 pnpm test」，无需新增锁。
- **状态机非法迁移**：不适用——本批不触碰需求/任务状态机、台账 schema、HTTP 面与运行时行为。
- **中途回滚**：注册表/门禁/归一/盘点各自独立 commit，git revert 单步回滚；无数据迁移。

## 边界

- 本批只动：新增注册表常量文件、tests 守卫扩展（error-code-scan 生态内）、prompt 校验用例、
  protocol.ts / plan-granularity.ts 的 4 处归一读取点、体检报告或本需求目录的收官对照表、
  以及 G5 裁定的 prompt 文案（补码或改定性表述）。
- 不越界到：错误码取值与触发条件、字面量产生点迁移、tasks[] 命名法统一（G10 长期半句）、
  工具行为语义、client UI、台账/状态机/HTTP 面。
- 与设计的矛盾处理：拆分或实施中发现与本节冲突的诉求（如要迁移字面量、要动 client 行为），
  退回 design 阶段改设计，不在实施中夹带。

## 非目标

- N1：123 个文件的字面量 → 常量引用迁移（工程量大、风险面宽，且对「可机械检查」目标无增量）。
- N2：tasks[] 命名法 snake/camel 二选一 + 别名兼容期（G10 长期半句，另立需求）。
- N3：小写领域码注册表化（已有 REQBOARD_ERROR_CODES / TRANSPORT_CODE_BY_INTERNAL 两张登记表
  且在 inventory 口径内，无缺口）。
- N4：体检报告 §4.3 之外的新治理项（本批是收官，不是新开坑）。

## 验收方式（摘要）

1. FR-1~FR-5 各条判据逐条跑（守卫用例 / grep 计数 / 对照表核对）。
2. 全量测试：`pnpm test` 绿 + `pnpm typecheck` 0 错。
3. 收官确认：体检报告 §4.3 十项 G 逐行有去向，人对照表签字（验收单）。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|------|---------|------|---------|------|
| D-1 | 「注意剔除模板拼码 REQBOARD_${…} 13 处与占位 REQBOARD_XXX」（session-a6e1875f 交接底稿） | 注册表与校验口径剔除这两类：REQBOARD_XXX 已在 NOISE_TOKENS；模板拼码是运行时拼接、非字面量码，扫描口径本就不计，注册表不收 | FR-1、FR-2、FR-3 | 注册表与校验用例中 REQBOARD_XXX 零收录；负例（把占位码塞进注册表）红 |
| D-2 | 「注意仓内已有 tests/helpers/error-code-scan.ts、tests/error-code-inventory.test.ts、tests/fixtures/error-code-inventory.json 等存量设施，先盘点复用再决定新建还是收敛」（同上） | **收敛**：error-code-scan.ts 保持口径唯一实现，硬门在既有守卫生态上生长（新增注册表一致性与 prompt 校验用例），不另建第二套扫描/清单 | FR-1、FR-2、FR-3 | `grep -rn "REQBOARD_[A-Z0-9_]" tests/helpers --include="*.ts" -l` 扫描正则仍只此一处；新用例 import 既有 scanErrorCodes |
| D-3 | 「代码抛的码必须已注册；prompt 列的码可选校验」（同上） | 代码侧 = 硬门（FR-2）；prompt 侧做成机械校验用例但定位**从属于 G5 裁定**——G5 若选「改定性表述、不列码」，prompt 校验自然空集通过；若选「补全清单」，校验即刻生效 | FR-3、FR-5 | prompt 校验用例绿；两种 G5 走向下用例语义都成立（子集断言不预设清单非空） |
| D-4 | 「G5 错误码 prompt 清单补全或改定性表述」（同上） | 推荐**补全**：FR-1 注册表落地后补全四处漏码（OpenWindow/SkillInstall/Create/RunStatus）成本极低，且 FR-3 校验有事实源可守；若设计阶段发现补全与「description 瘦身」（第三批 G3 方向）冲突，再改定性表述并在设计文档记录理由 | FR-3、FR-5 | 四处工具 prompt 漏码清零（FR-3 校验绿），或 prompt 改定性表述后校验空集通过——二选一，验收单核对 |
| D-5 | 本窗口盘点裁定（参照 REQ-261007220012-bd29 N5 先例） | sides 声明 [backend]，不触发原型门禁：本批无视觉/交互/布局变化；toolviews/shared.ts 映射表最多被改为「从注册表派生」的数据同源，非 UI 行为 | FR-1 | `git diff` 中 src/client 下改动（若有）仅限 shared.ts 映射表数据源，无渲染/样式/交互变更 |

## 回滚

四项内容（注册表+硬门 / prompt 校验 / 归一单源 / 收官盘点）各自独立 commit，
`git revert` 单步回滚；无数据迁移、无台账格式变化、无配置项新增。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-6feb35、t-89aaec、t-fbcd87 |
| FR-2 | ✅ 已接收 | t-5e8f8e、t-fbcd87 |
| FR-3 | ✅ 已接收 | t-dff2c4、t-cd208f、t-fbcd87 |
| FR-4 | ✅ 已接收 | t-b483e0、t-fbcd87 |
| FR-5 | ✅ 已接收 | t-cd208f、t-bf89ba、t-fbcd87 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
