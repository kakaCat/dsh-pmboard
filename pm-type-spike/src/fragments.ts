/**
 * `pmboard-type-spike` 的提示词片段表 —— **生成物，勿手改**。
 *
 * 由 `scripts/inline-prompt-fragments.mjs` 从 fragments/**.md 生成（REQ-261009174713-7bc8 t11 二期）：
 * 类型档随类型包走，core 经装配端口取用（core 不认识具体类型包）。
 */
import type { GeneratedFragment } from 'pm-common/prompt/generated/fragments.js'

export const FRAGMENTS: readonly GeneratedFragment[] = [
  { id: "accepting/heavy/spike", stage: "accepting", difficulty: "heavy", category: "spike", priority: 10, text: "", include: ["accepting/heavy","accepting/heavy/overrides","accepting/spike"] },
  { id: "accepting/light/spike", stage: "accepting", difficulty: "light", category: "spike", priority: 10, text: "", include: ["accepting/light","accepting/spike"] },
  { id: "accepting/spike", stage: "accepting", difficulty: "*", category: "spike", priority: 10, text: "# 类型档 · spike（验收）\n\n- [ ] 验收对象是**回答一个问题**：问题被答清了没有，答案有没有证据支撑。\n- [ ] 核对**时限**与产出边界：有没有超期、有没有偷偷做生产级实现。\n- [ ] 产出是结论不是代码：不按代码质量评审，按\"能否据此决策\"评审。\n- [ ] 未答清 → 退回补验证，不靠推测下结论。\n" },
  { id: "archived/heavy/spike", stage: "archived", difficulty: "heavy", category: "spike", priority: 10, text: "", include: ["archived/heavy","archived/heavy/overrides","archived/spike"] },
  { id: "archived/light/spike", stage: "archived", difficulty: "light", category: "spike", priority: 10, text: "", include: ["archived/light","archived/spike"] },
  { id: "archived/spike", stage: "archived", difficulty: "*", category: "spike", priority: 10, text: "# 类型档 · spike（归档）\n\n- [ ] 合并去向：research（研究笔记 / wiki），结论必须可被检索到。\n- [ ] 材料写清被**回答一个问题**的答案与证据（数据 / 命令 / 引用）。\n- [ ] 记录**时限**与未决项：没答完的部分显式列为待办。\n- [ ] 产出是结论不是代码：探针代码不入档，只留结论与复现方式。\n" },
  { id: "brainstorming/heavy/spike", stage: "brainstorming", difficulty: "heavy", category: "spike", priority: 10, text: "", include: ["brainstorming/heavy","brainstorming/heavy/overrides","brainstorming/heavy-extra","brainstorming/spike"] },
  { id: "brainstorming/light/spike", stage: "brainstorming", difficulty: "light", category: "spike", priority: 10, text: "", include: ["brainstorming/light","brainstorming/spike"] },
  { id: "brainstorming/spike", stage: "brainstorming", difficulty: "*", category: "spike", priority: 10, text: "# 类型档 · spike（需求分析）\n\n- [ ] 本次目标是**回答一个问题**：把问题写成一句话，并给出可判定的答案标准。\n- [ ] 定**时限**：到点必须交结论，不许无限试探。\n- [ ] 产出是结论不是代码：不评审实现质量、不承诺落生产。\n- [ ] 不写生产级实现：方案按\"能验证即可\"来写。\n\n## 条款定义行（G2 门禁可解析，FR-10）\n\n需求文档里的每条功能点/条款必须写成 G2 clause 门禁认得的定义行，否则解析不到、条款接收状态全红：\n\n- [ ] 行首 `**SP-N: 名称**`（可带 `- `/`* ` 列表符）；编号用 SP-1、SP-2…，不要用与批准闸门撞名的 G 系列编号。\n- [ ] 根文档必填节（G2 missingCategoryDocs 逐节核对，缺一即拦）：边界、待答问题、结论。\n\n示范（照此独立成行写，门禁即认得；注意是列表项、不是 checklist 复选框）：\n\n- **SP-1: 一句话写清这条做什么**\n" },
  { id: "decomposing/heavy/spike", stage: "decomposing", difficulty: "heavy", category: "spike", priority: 10, text: "", include: ["decomposing/heavy","decomposing/spike"] },
  { id: "decomposing/light/spike", stage: "decomposing", difficulty: "light", category: "spike", priority: 10, text: "", include: ["decomposing/light","decomposing/spike"] },
  { id: "decomposing/spike", stage: "decomposing", difficulty: "*", category: "spike", priority: 10, text: "# 类型档 · spike（拆分）\n\n- [ ] 只拆到\"够**回答一个问题**\"为止：验证步骤 + 汇总结论，不排交付卡。\n- [ ] 每步带**时限**；到点即停并产出结论。\n- [ ] 产出是结论不是代码：卡内验收是\"答案 + 证据\"，不是\"功能可用\"。\n- [ ] 不写生产级实现：代码是一次性探针，可随时丢弃。\n" },
  { id: "design/heavy/spike", stage: "design", difficulty: "heavy", category: "spike", priority: 10, text: "", include: ["design/heavy","design/heavy/overrides","design/spike"] },
  { id: "design/light/spike", stage: "design", difficulty: "light", category: "spike", priority: 10, text: "", include: ["design/light","design/light/overrides","design/spike"] },
  { id: "design/spike", stage: "design", difficulty: "*", category: "spike", priority: 10, text: "# 类型档 · spike（设计）\n\n- [ ] 设计 = 验证方法 + 判定标准 + **时限**，这三样齐了才进拆分。\n- [ ] 写明要**回答一个问题**（一句话），以及答成\"是 / 否 / 何种条件\"的依据。\n- [ ] 产出是结论不是代码：设计里不规划生产化实现。\n- [ ] 不写生产级实现：允许一次性脚本或临时探针。\n" },
  { id: "implementing/heavy/spike", stage: "implementing", difficulty: "heavy", category: "spike", priority: 10, text: "", include: ["implementing/heavy","implementing/heavy/overrides","implementing/spike"] },
  { id: "implementing/light/spike", stage: "implementing", difficulty: "light", category: "spike", priority: 10, text: "", include: ["implementing/light","implementing/light/overrides","implementing/spike"] },
  { id: "implementing/spike", stage: "implementing", difficulty: "*", category: "spike", priority: 10, text: "# 类型档 · spike（实施）\n\n- [ ] 只做验证所需的最小动作，不写生产级实现（脚本 / 探针可有，工程化免谈）。\n- [ ] 全程盯**时限**：到点收手，不\"再看看\"。\n- [ ] 产出是结论不是代码：结束时给出**回答一个问题**的答案与证据。\n- [ ] 不为探针写测试或文档，除非它要进正式代码。\n" },
]
