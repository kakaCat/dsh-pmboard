/**
 * `pmboard-type-refactor` 的提示词片段表 —— **生成物，勿手改**。
 *
 * 由 `scripts/inline-prompt-fragments.mjs` 从 fragments/**.md 生成（REQ-261009174713-7bc8 t11 二期）：
 * 类型档随类型包走，core 经装配端口取用（core 不认识具体类型包）。
 */
import type { GeneratedFragment } from 'pm-common/prompt/generated/fragments.js'

export const FRAGMENTS: readonly GeneratedFragment[] = [
  { id: "accepting/heavy/refactor", stage: "accepting", difficulty: "heavy", category: "refactor", priority: 10, text: "", include: ["accepting/heavy","accepting/heavy/overrides","accepting/refactor"] },
  { id: "accepting/light/refactor", stage: "accepting", difficulty: "light", category: "refactor", priority: 10, text: "", include: ["accepting/light","accepting/refactor"] },
  { id: "accepting/refactor", stage: "accepting", difficulty: "*", category: "refactor", priority: 10, text: "# 类型档 · refactor（验收）\n\n- [ ] 证据 = **行为等价**的可复核对比：改动前后跑同一组测试或用例，结果一致。\n- [ ] 核查**一次只改一类东西**：diff 出现多类改动即退回。\n- [ ] 抽查**依赖与调用方**是否都覆盖到（漏改调用方 = 未完成）。\n- [ ] 不接受\"顺手优化了性能\"这类无证据的行为变化。\n" },
  { id: "archived/heavy/refactor", stage: "archived", difficulty: "heavy", category: "refactor", priority: 10, text: "", include: ["archived/heavy","archived/heavy/overrides","archived/refactor"] },
  { id: "archived/light/refactor", stage: "archived", difficulty: "light", category: "refactor", priority: 10, text: "", include: ["archived/light","archived/refactor"] },
  { id: "archived/refactor", stage: "archived", difficulty: "*", category: "refactor", priority: 10, text: "# 类型档 · refactor（归档）\n\n- [ ] 合并去向：architecture / work-logs（结构变了就更新架构说明）。\n- [ ] 材料附**行为等价**证据指针与**依赖与调用方**覆盖清单。\n- [ ] 记录**一次只改一类东西**的批次划分，便于复盘。\n- [ ] 无新功能 / 修 bug 记录——若有过，说明为何另立项。\n" },
  { id: "brainstorming/heavy/refactor", stage: "brainstorming", difficulty: "heavy", category: "refactor", priority: 10, text: "", include: ["brainstorming/heavy","brainstorming/heavy/overrides","brainstorming/heavy-extra","brainstorming/refactor"] },
  { id: "brainstorming/light/refactor", stage: "brainstorming", difficulty: "light", category: "refactor", priority: 10, text: "", include: ["brainstorming/light","brainstorming/refactor"] },
  { id: "brainstorming/refactor", stage: "brainstorming", difficulty: "*", category: "refactor", priority: 10, text: "# 类型档 · refactor（需求分析）\n\n- [ ] 先盘**依赖与调用方**：列出谁会受影响、对外可观察行为有哪些。\n- [ ] 写明不变量：哪些行为必须**行为等价**（输入输出 / 错误 / 副作用 / 时序）。\n- [ ] 边界：**一次只改一类东西**（不同时改接口与实现、不同时动多处结构）。\n- [ ] 本节点不修 bug、不加功能——顺手发现的问题另立项。\n\n## 条款定义行（G2 门禁可解析，FR-10）\n\n需求文档里的每条功能点/条款必须写成 G2 clause 门禁认得的定义行，否则解析不到、条款接收状态全红：\n\n- [ ] 行首 `**RF-N: 名称**`（可带 `- `/`* ` 列表符）；编号用 RF-1、RF-2…，不要用与批准闸门撞名的 G 系列编号。\n- [ ] 根文档必填节（G2 missingCategoryDocs 逐节核对，缺一即拦）：边界、现状、目标结构、行为不变式、失败与并发路径。\n\n示范（照此独立成行写，门禁即认得；注意是列表项、不是 checklist 复选框）：\n\n- **RF-1: 一句话写清这条做什么**\n" },
  { id: "decomposing/heavy/refactor", stage: "decomposing", difficulty: "heavy", category: "refactor", priority: 10, text: "", include: ["decomposing/heavy","decomposing/refactor"] },
  { id: "decomposing/light/refactor", stage: "decomposing", difficulty: "light", category: "refactor", priority: 10, text: "", include: ["decomposing/light","decomposing/refactor"] },
  { id: "decomposing/refactor", stage: "decomposing", difficulty: "*", category: "refactor", priority: 10, text: "# 类型档 · refactor（拆分）\n\n- [ ] 每张卡 = **一次只改一类东西**，卡间用 depends_on 串起来。\n- [ ] 每卡验收 = **行为等价**证据（跑什么、看到什么算过），不接受\"看起来没变\"。\n- [ ] 先盘**依赖与调用方**的卡排最前，其后才是结构改动卡。\n- [ ] 不落新功能 / 修 bug 的卡。\n" },
  { id: "design/heavy/refactor", stage: "design", difficulty: "heavy", category: "refactor", priority: 10, text: "", include: ["design/heavy","design/heavy/overrides","design/refactor"] },
  { id: "design/light/refactor", stage: "design", difficulty: "light", category: "refactor", priority: 10, text: "", include: ["design/light","design/light/overrides","design/refactor"] },
  { id: "design/refactor", stage: "design", difficulty: "*", category: "refactor", priority: 10, text: "# 类型档 · refactor（设计）\n\n- [ ] 设计先给**依赖与调用方**清单（谁调用、谁被调用、怎么验证没漏）。\n- [ ] 给出**行为等价**的验证设计：跑哪些测试、对比哪些输入输出。\n- [ ] **一次只改一类东西**：设计按\"一类改动\"分批，批间可独立验证。\n- [ ] 禁止夹带新功能 / 修 bug；发现即另开需求。\n" },
  { id: "implementing/heavy/refactor", stage: "implementing", difficulty: "heavy", category: "refactor", priority: 10, text: "", include: ["implementing/heavy","implementing/heavy/overrides","implementing/refactor"] },
  { id: "implementing/light/refactor", stage: "implementing", difficulty: "light", category: "refactor", priority: 10, text: "", include: ["implementing/light","implementing/light/overrides","implementing/refactor"] },
  { id: "implementing/refactor", stage: "implementing", difficulty: "*", category: "refactor", priority: 10, text: "# 类型档 · refactor（实施）\n\n- [ ] 动手前先盘**依赖与调用方**（搜引用点），把改动面写清。\n- [ ] **一次只改一类东西**，小步提交；每步跑既有测试给出**行为等价**证据。\n- [ ] 不改对外行为；如发现必须改行为，停手回计划重新确认。\n- [ ] 不夹带新功能 / 修 bug / 全文件格式化噪声。\n" },
]
