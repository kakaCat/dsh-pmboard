/**
 * `pmboard-type-chore` 的提示词片段表 —— **生成物，勿手改**。
 *
 * 由 `scripts/inline-prompt-fragments.mjs` 从 fragments/**.md 生成（REQ-261009174713-7bc8 t11 二期）：
 * 类型档随类型包走，core 经装配端口取用（core 不认识具体类型包）。
 */
import type { GeneratedFragment } from 'pmboard-common/prompt/generated/fragments.js'

export const FRAGMENTS: readonly GeneratedFragment[] = [
  { id: "accepting/chore", stage: "accepting", difficulty: "*", category: "chore", priority: 10, text: "# 类型档 · chore（验收）\n\n- [ ] 证据 = diff 只涉及该**最小改动**面（逐文件核对）。\n- [ ] 确认不夹带业务逻辑变更：无行为变化、无新分支。\n- [ ] 目标动作实测生效（命令 / 页面 / 日志）。\n- [ ] 不接受\"顺便优化了\"的夹带。\n" },
  { id: "accepting/heavy/chore", stage: "accepting", difficulty: "heavy", category: "chore", priority: 10, text: "", include: ["accepting/heavy","accepting/heavy/overrides","accepting/chore"] },
  { id: "accepting/light/chore", stage: "accepting", difficulty: "light", category: "chore", priority: 10, text: "", include: ["accepting/light","accepting/chore"] },
  { id: "archived/chore", stage: "archived", difficulty: "*", category: "chore", priority: 10, text: "# 类型档 · chore（归档）\n\n- [ ] 合并去向：work-logs；一般不需更新架构章节。\n- [ ] 材料注明**最小改动**的范围与\"不夹带业务逻辑变更\"的核对结论。\n- [ ] manual_note 说明本次为维护性改动、无认知增量。\n- [ ] 无说明书更新点。\n" },
  { id: "archived/heavy/chore", stage: "archived", difficulty: "heavy", category: "chore", priority: 10, text: "", include: ["archived/heavy","archived/heavy/overrides","archived/chore"] },
  { id: "archived/light/chore", stage: "archived", difficulty: "light", category: "chore", priority: 10, text: "", include: ["archived/light","archived/chore"] },
  { id: "brainstorming/chore", stage: "brainstorming", difficulty: "*", category: "chore", priority: 10, text: "# 类型档 · chore（需求分析）\n\n- [ ] 圈定**最小改动**面：只改必须改的那一处，其余一律不碰。\n- [ ] 明确\"顺手能做的事\"不纳入（另立项），不夹带业务逻辑变更。\n- [ ] 判定标准可证伪：跑什么、看到什么算完成。\n- [ ] 范围限于维护性动作（版本 / 常量 / 清理 / 接线），不新增能力。\n\n## 条款定义行（G2 门禁可解析，FR-10）\n\n需求文档里的每条功能点/条款必须写成 G2 clause 门禁认得的定义行，否则解析不到、条款接收状态全红：\n\n- [ ] 行首 `**CH-N: 名称**`（可带 `- `/`* ` 列表符）；编号用 CH-1、CH-2…，不要用与批准闸门撞名的 G 系列编号。\n- [ ] 根文档必填节（G2 missingCategoryDocs 逐节核对，缺一即拦）：边界、完成判据。\n\n示范（照此独立成行写，门禁即认得；注意是列表项、不是 checklist 复选框）：\n\n- **CH-1: 一句话写清这条做什么**\n" },
  { id: "brainstorming/heavy/chore", stage: "brainstorming", difficulty: "heavy", category: "chore", priority: 10, text: "", include: ["brainstorming/heavy","brainstorming/heavy/overrides","brainstorming/heavy-extra","brainstorming/chore"] },
  { id: "brainstorming/light/chore", stage: "brainstorming", difficulty: "light", category: "chore", priority: 10, text: "", include: ["brainstorming/light","brainstorming/chore"] },
  { id: "decomposing/chore", stage: "decomposing", difficulty: "*", category: "chore", priority: 10, text: "# 类型档 · chore（拆分）\n\n- [ ] 一张卡 = 一个**最小改动**，卡太胖就打回重拆。\n- [ ] 每卡验收：只改该面、不夹带业务逻辑变更。\n- [ ] 依赖尽量少：chore 不制造新依赖。\n- [ ] 不借机重构邻近代码。\n" },
  { id: "decomposing/heavy/chore", stage: "decomposing", difficulty: "heavy", category: "chore", priority: 10, text: "", include: ["decomposing/heavy","decomposing/chore"] },
  { id: "decomposing/light/chore", stage: "decomposing", difficulty: "light", category: "chore", priority: 10, text: "", include: ["decomposing/light","decomposing/chore"] },
  { id: "design/chore", stage: "design", difficulty: "*", category: "chore", priority: 10, text: "# 类型档 · chore（设计）\n\n- [ ] 设计只列必要步骤，追求**最小改动**；多一步都要说明必要性。\n- [ ] 不夹带业务逻辑变更：出现行为变化即改走 feature / bug。\n- [ ] 写清回滚方式（改了什么、怎么退回去）。\n- [ ] 验收口径 = 原行为不变 + 目标动作生效。\n" },
  { id: "design/heavy/chore", stage: "design", difficulty: "heavy", category: "chore", priority: 10, text: "", include: ["design/heavy","design/heavy/overrides","design/chore"] },
  { id: "design/light/chore", stage: "design", difficulty: "light", category: "chore", priority: 10, text: "", include: ["design/light","design/light/overrides","design/chore"] },
  { id: "implementing/chore", stage: "implementing", difficulty: "*", category: "chore", priority: 10, text: "# 类型档 · chore（实施）\n\n- [ ] 按**最小改动**下手：只碰计划内的文件与行。\n- [ ] 不夹带业务逻辑变更、不重构、不整文件格式化。\n- [ ] 改完跑既有测试，证明行为不变。\n- [ ] diff 超出计划范围即停手回计划确认。\n" },
  { id: "implementing/heavy/chore", stage: "implementing", difficulty: "heavy", category: "chore", priority: 10, text: "", include: ["implementing/heavy","implementing/heavy/overrides","implementing/chore"] },
  { id: "implementing/light/chore", stage: "implementing", difficulty: "light", category: "chore", priority: 10, text: "", include: ["implementing/light","implementing/light/overrides","implementing/chore"] },
]
