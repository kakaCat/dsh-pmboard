/**
 * `pmboard-type-feature` 的提示词片段表 —— **生成物，勿手改**。
 *
 * 由 `scripts/inline-prompt-fragments.mjs` 从 fragments/**.md 生成（REQ-261009174713-7bc8 t11 二期）：
 * 类型档随类型包走，core 经装配端口取用（core 不认识具体类型包）。
 */
import type { GeneratedFragment } from 'pmboard-common/prompt/generated/fragments.js'

export const FRAGMENTS: readonly GeneratedFragment[] = [
  { id: "accepting/feature", stage: "accepting", difficulty: "*", category: "feature", priority: 10, text: "# 类型档 · feature（验收）\n\n- [ ] **接口**核验：按签名逐项调用，输入输出与错误语义符合契约。\n- [ ] **数据契约**核验：字段 / 类型 / 必填 / 默认值抽查，边界值要覆盖。\n- [ ] 迁移与兼容路径实测：旧数据 / 旧调用方可正常走通。\n- [ ] 验收要能跑：附可复核命令与输出，不接受口头描述。\n- [ ] **原型对照**：UI 需求与权威原型锚点（`prototypes/<name>.html#FR-N`）逐项对照（截图 + 差异说明）。\n- [ ] **裁定对照**：逐条核对 D-x 裁定的兑现情况，并附证据。\n" },
  { id: "accepting/heavy/feature", stage: "accepting", difficulty: "heavy", category: "feature", priority: 10, text: "", include: ["accepting/heavy","accepting/heavy/overrides","accepting/feature"] },
  { id: "accepting/light/feature", stage: "accepting", difficulty: "light", category: "feature", priority: 10, text: "", include: ["accepting/light","accepting/feature"] },
  { id: "archived/feature", stage: "archived", difficulty: "*", category: "feature", priority: 10, text: "# 类型档 · feature（归档）\n\n- [ ] 合并去向：architecture / guides；**接口**与**数据契约**变化必须写进对应章节。\n- [ ] 材料含迁移与兼容路径的最终结论与回滚方式。\n- [ ] 验收证据指针入档（命令 / 用例位置）。\n- [ ] 说明书更新点必填（feature 类型硬要求）。\n" },
  { id: "archived/heavy/feature", stage: "archived", difficulty: "heavy", category: "feature", priority: 10, text: "", include: ["archived/heavy","archived/heavy/overrides","archived/feature"] },
  { id: "archived/light/feature", stage: "archived", difficulty: "light", category: "feature", priority: 10, text: "", include: ["archived/light","archived/feature"] },
  { id: "brainstorming/feature", stage: "brainstorming", difficulty: "*", category: "feature", priority: 10, text: "# 类型档 · feature（需求分析）\n\n- [ ] 先定**接口**：对外入口的输入 / 输出 / 错误语义写清（谁调用、给什么、回什么）。\n- [ ] 定**数据契约**：新增或变更的字段、类型、必填性、默认值、版本兼容。\n- [ ] 写清迁移与兼容路径：旧数据 / 旧调用方怎么办，能否回滚。\n- [ ] 验收要能跑：给出可执行的判定命令或请求样例。\n- [ ] **D-x 落账**：祈使/纠正/补充逐条进「讨论与裁定记录（D-x）」表（五列齐、引原话）。\n- [ ] **原型必交**：sides 含 frontend 时交 `prototypes/<name>.html`，`prototypes/INDEX.md` 标唯一 authoritative。\n- [ ] **确认前自查**：G1 前两项已登记。\n\n## 条款定义行（G2 门禁可解析，FR-10）\n\n每条功能点必须写成 G2 clause 门禁认得的定义行，否则解析不到、状态全红：\n\n- [ ] 行首 `**FR-N: 名称**`（可带 `- `/`* ` 列表符）；编号用 FR-1、FR-2…，不要用与批准闸门撞名的 G 系列编号。\n- [ ] 根文档必填节（G2 missingCategoryDocs 逐节核对，缺一即拦）：边界、产品定义、用户与角色、功能点、失败与并发路径。\n\n示范（照此独立成行写，门禁即认得；注意是列表项、不是 checklist 复选框）：\n\n- **FR-1: 一句话写清这条做什么**\n" },
  { id: "brainstorming/heavy/feature", stage: "brainstorming", difficulty: "heavy", category: "feature", priority: 10, text: "", include: ["brainstorming/heavy","brainstorming/heavy/overrides","brainstorming/heavy-extra","brainstorming/feature"] },
  { id: "brainstorming/light/feature", stage: "brainstorming", difficulty: "light", category: "feature", priority: 10, text: "", include: ["brainstorming/light","brainstorming/feature"] },
  { id: "decomposing/feature", stage: "decomposing", difficulty: "*", category: "feature", priority: 10, text: "# 类型档 · feature（拆分）\n\n- [ ] 接口与数据契约卡先行，实现卡 depends_on 它——契约定死再写实现：一接口一卡、页面按组件级拆。\n- [ ] 每卡 acceptance 必须能跑（命令 / 请求样例 + 期望结果），空话打回。\n- [ ] 单列迁移与兼容卡（旧数据/旧调用方）。\n- [ ] 卡不跨层：接口、数据、接线各归各卡。\n- [ ] 任务表补「原型锚点」（`prototypes/<name>.html#FR-N`，UI 卡必填）与「关联 D-x」两列；UI 卡 acceptance 含可失败的原型对照判据。\n" },
  { id: "decomposing/heavy/feature", stage: "decomposing", difficulty: "heavy", category: "feature", priority: 10, text: "", include: ["decomposing/heavy","decomposing/feature"] },
  { id: "decomposing/light/feature", stage: "decomposing", difficulty: "light", category: "feature", priority: 10, text: "", include: ["decomposing/light","decomposing/feature"] },
  { id: "design/feature", stage: "design", difficulty: "*", category: "feature", priority: 10, text: "# 类型档 · feature（设计）\n\n- [ ] 设计文档含**接口**签名（参数 / 返回 / 错误码）与**数据契约**（字段 / 类型 / 约束）。\n- [ ] feature 必交：interfaces.md 含「接口清单」表、frontend.md 含「组件树」节（缺节被拒）。\n- [ ] 写清迁移与兼容设计：数据回填、开关或灰度、回滚路径。\n- [ ] 给出四视角（架构 / 接口 / 数据模型 / 测试策略）中适用的部分；契约定不死不许进拆分。\n- [ ] 有原型的 UI 需求：`design/frontend.md` 指向 `prototypes/INDEX.md` 的权威路径与 `#FR-N` 锚点（锚点单独记账、不进 serves），并引相关 D-x。\n" },
  { id: "design/heavy/feature", stage: "design", difficulty: "heavy", category: "feature", priority: 10, text: "", include: ["design/heavy","design/heavy/overrides","design/feature"] },
  { id: "design/light/feature", stage: "design", difficulty: "light", category: "feature", priority: 10, text: "", include: ["design/light","design/light/overrides","design/feature"] },
  { id: "implementing/feature", stage: "implementing", difficulty: "*", category: "feature", priority: 10, text: "# 类型档 · feature（实施）\n\n- [ ] 先按**接口**与**数据契约**落骨架，再填实现；契约要变回计划重新批。\n- [ ] 迁移与兼容路径同步落地（默认值 / 回填 / 双读或开关）。\n- [ ] 每个切片验收要能跑：跑通对应命令或用例再进下一片。\n- [ ] 不对计划外的调用方做破坏性改动。\n- [ ] 卡上有原型锚点/关联 D-x 时：先照权威原型（`prototypes/INDEX.md`）的锚点区块与裁定原话动手，不凭记忆。\n" },
  { id: "implementing/heavy/feature", stage: "implementing", difficulty: "heavy", category: "feature", priority: 10, text: "", include: ["implementing/heavy","implementing/heavy/overrides","implementing/feature"] },
  { id: "implementing/light/feature", stage: "implementing", difficulty: "light", category: "feature", priority: 10, text: "", include: ["implementing/light","implementing/light/overrides","implementing/feature"] },
]
