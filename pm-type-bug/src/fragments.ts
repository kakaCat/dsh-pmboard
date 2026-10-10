/**
 * `pmboard-type-bug` 的提示词片段表 —— **生成物，勿手改**。
 *
 * 由 `scripts/inline-prompt-fragments.mjs` 从 fragments/**.md 生成（REQ-261009174713-7bc8 t11 二期）：
 * 类型档随类型包走，core 经装配端口取用（core 不认识具体类型包）。
 */
import type { GeneratedFragment } from 'pm-common/prompt/generated/fragments.js'

export const FRAGMENTS: readonly GeneratedFragment[] = [
  { id: "accepting/bug", stage: "accepting", difficulty: "*", category: "bug", priority: 10, text: "# 类型档 · bug（验收）\n\n- [ ] 证据必须含**复现步骤**与**回归测试**的命令 + 输出（修好后按原样重跑一次复现步骤）。\n- [ ] 先复现再判定：不接受\"改完看起来好了\"，只认可复核的失败 → 通过对比。\n- [ ] 核对 diff 有无**顺手重构**夹带；有则退回。\n- [ ] 根因不清不许动手：验收材料要能对上根因与修复点。\n" },
  { id: "accepting/heavy/bug", stage: "accepting", difficulty: "heavy", category: "bug", priority: 10, text: "", include: ["accepting/heavy","accepting/heavy/overrides","accepting/bug"] },
  { id: "accepting/light/bug", stage: "accepting", difficulty: "light", category: "bug", priority: 10, text: "", include: ["accepting/light","accepting/bug"] },
  { id: "archived/bug", stage: "archived", difficulty: "*", category: "bug", priority: 10, text: "# 类型档 · bug（归档）\n\n- [ ] 合并去向按类型定：bug → known-issues（或对应排障文档）。\n- [ ] 材料写清**先复现** → 根因 → 修复的闭环与证据指针（**回归测试**文件 / 命令）。\n- [ ] **禁止顺手重构**的痕迹入档：归档只记录本次缺陷闭环。\n- [ ] 若根因是系统性问题，写明后续跟进项与责任人。\n" },
  { id: "archived/heavy/bug", stage: "archived", difficulty: "heavy", category: "bug", priority: 10, text: "", include: ["archived/heavy","archived/heavy/overrides","archived/bug"] },
  { id: "archived/light/bug", stage: "archived", difficulty: "light", category: "bug", priority: 10, text: "", include: ["archived/light","archived/bug"] },
  { id: "brainstorming/bug", stage: "brainstorming", difficulty: "*", category: "bug", priority: 10, text: "# 类型档 · bug（需求分析）\n\n先复现再改——**根因不清不许动手**：\n\n- [ ] 写清**复现步骤**与最小重现（环境 / 输入 / 预期 vs 实际），先确认这是缺陷而不是需求变更。\n- [ ] 给出**根因假设**与验证方法；本节点只定位与划界，不写修复代码。\n- [ ] **禁止顺手重构**：不把\"顺便清理\"\"顺便优化\"写进范围。\n- [ ] 明确\"将来怎么证明修好了\"——**回归测试**要覆盖这条复现路径。\n\n## 条款定义行（G2 门禁可解析，FR-10）\n\n需求文档里的每条功能点/条款必须写成 G2 clause 门禁认得的定义行，否则解析不到、条款接收状态全红：\n\n- [ ] 行首 `**BUG-N: 名称**`（可带 `- `/`* ` 列表符）；编号用 BUG-1、BUG-2…，不要用与批准闸门撞名的 G 系列编号。\n- [ ] 根文档必填节（G2 missingCategoryDocs 逐节核对，缺一即拦）：边界、复现步骤、根因、回归。\n\n示范（照此独立成行写，门禁即认得；注意是列表项、不是 checklist 复选框）：\n\n- **BUG-1: 一句话写清这条做什么**\n" },
  { id: "brainstorming/heavy/bug", stage: "brainstorming", difficulty: "heavy", category: "bug", priority: 10, text: "", include: ["brainstorming/heavy","brainstorming/heavy/overrides","brainstorming/heavy-extra","brainstorming/bug"] },
  { id: "brainstorming/light/bug", stage: "brainstorming", difficulty: "light", category: "bug", priority: 10, text: "", include: ["brainstorming/light","brainstorming/bug"] },
  { id: "decomposing/bug", stage: "decomposing", difficulty: "*", category: "bug", priority: 10, text: "# 类型档 · bug（拆分）\n\n- [ ] 拆成三张卡：**复现卡**（先复现，可证伪）→ **修复卡** → **回归测试卡**。\n- [ ] **回归测试**卡不得并入修复卡——它是\"修好了\"的独立证据，单独验收。\n- [ ] 根因不清不许动手：修复卡 depends_on 复现卡。\n- [ ] **禁止顺手重构**：任何\"顺便清理\"的卡不得落库。\n" },
  { id: "decomposing/heavy/bug", stage: "decomposing", difficulty: "heavy", category: "bug", priority: 10, text: "", include: ["decomposing/heavy","decomposing/bug"] },
  { id: "decomposing/light/bug", stage: "decomposing", difficulty: "light", category: "bug", priority: 10, text: "", include: ["decomposing/light","decomposing/bug"] },
  { id: "design/bug", stage: "design", difficulty: "*", category: "bug", priority: 10, text: "# 类型档 · bug（设计）\n\n- [ ] 设计按三步走：**先复现**（最小重现命令或用例）→ 根因定位步骤 → 修复方案。\n- [ ] 根因不清不许进拆分：写清定位步骤与判定依据，禁止\"先改了看\"。\n- [ ] 设计里指定**回归测试**落点（放哪个测试文件、断言什么）。\n- [ ] **禁止顺手重构**：重构不属本设计，另立项。\n" },
  { id: "design/heavy/bug", stage: "design", difficulty: "heavy", category: "bug", priority: 10, text: "", include: ["design/heavy","design/heavy/overrides","design/bug"] },
  { id: "design/light/bug", stage: "design", difficulty: "light", category: "bug", priority: 10, text: "", include: ["design/light","design/light/overrides","design/bug"] },
  { id: "implementing/bug", stage: "implementing", difficulty: "*", category: "bug", priority: 10, text: "# 类型档 · bug（实施）\n\n- [ ] 先复现：先写出会失败的**回归测试**（红），确认它确实复现了该缺陷，再动修复代码。\n- [ ] 改到测试变绿；根因不清不许动手——只改症状等于没修。\n- [ ] **禁止顺手重构**：本次 diff 只许包含根因修复与**回归测试**。\n- [ ] 跑一遍原有测试，确认没有引入新回归。\n" },
  { id: "implementing/heavy/bug", stage: "implementing", difficulty: "heavy", category: "bug", priority: 10, text: "", include: ["implementing/heavy","implementing/heavy/overrides","implementing/bug"] },
  { id: "implementing/light/bug", stage: "implementing", difficulty: "light", category: "bug", priority: 10, text: "", include: ["implementing/light","implementing/light/overrides","implementing/bug"] },
]
