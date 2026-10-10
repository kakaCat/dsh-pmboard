/**
 * `pmboard-type-doc` 的提示词片段表 —— **生成物，勿手改**。
 *
 * 由 `scripts/inline-prompt-fragments.mjs` 从 fragments/**.md 生成（REQ-261009174713-7bc8 t11 二期）：
 * 类型档随类型包走，core 经装配端口取用（core 不认识具体类型包）。
 */
import type { GeneratedFragment } from 'pmboard-common/prompt/generated/fragments.js'

export const FRAGMENTS: readonly GeneratedFragment[] = [
  { id: "accepting/doc", stage: "accepting", difficulty: "*", category: "doc", priority: 10, text: "# 类型档 · doc（验收）\n\n- [ ] 逐条核对事实可核：引用的命令 / 文件 / 链接真实存在。\n- [ ] **只改文档**抽查：diff 里若出现代码改动即退回。\n- [ ] **wiki 挂链**自检：无死链、无孤儿页，上层页能到达本页。\n- [ ] 说明书的对应章节确实获得了新认知（不是复述旧文）。\n" },
  { id: "accepting/heavy/doc", stage: "accepting", difficulty: "heavy", category: "doc", priority: 10, text: "", include: ["accepting/heavy","accepting/heavy/overrides","accepting/doc"] },
  { id: "accepting/light/doc", stage: "accepting", difficulty: "light", category: "doc", priority: 10, text: "", include: ["accepting/light","accepting/doc"] },
  { id: "archived/doc", stage: "archived", difficulty: "*", category: "doc", priority: 10, text: "# 类型档 · doc（归档）\n\n- [ ] 合并去向由文档类型定（guides / architecture / known-issues 等）。\n- [ ] 材料列清**只改文档**的清单与 **wiki 挂链**自检结果。\n- [ ] 归档目录的文档清单与实际文件一致（漏登即补）。\n- [ ] 无代码变更，manual_note 说明本次仅文档演进。\n" },
  { id: "archived/heavy/doc", stage: "archived", difficulty: "heavy", category: "doc", priority: 10, text: "", include: ["archived/heavy","archived/heavy/overrides","archived/doc"] },
  { id: "archived/light/doc", stage: "archived", difficulty: "light", category: "doc", priority: 10, text: "", include: ["archived/light","archived/doc"] },
  { id: "brainstorming/doc", stage: "brainstorming", difficulty: "*", category: "doc", priority: 10, text: "# 类型档 · doc（需求分析）\n\n- [ ] 明确**只改文档**：本次不产代码改动，范围就是文档路径与章节。\n- [ ] 写清结论要落进哪份文档的哪一节（项目说明书的对应章节）。\n- [ ] 注意 **wiki 挂链**：新页面要有 front-matter 并挂进首页或上层页。\n- [ ] 判定标准：读者只靠该章节就能答出目标问题。\n\n## 条款定义行（G2 门禁可解析，FR-10）\n\n需求文档里的每条功能点/条款必须写成 G2 clause 门禁认得的定义行，否则解析不到、条款接收状态全红：\n\n- [ ] 行首 `**DOC-N: 名称**`（可带 `- `/`* ` 列表符）；编号用 DOC-1、DOC-2…，不要用与批准闸门撞名的 G 系列编号。\n- [ ] 根文档必填节（G2 missingCategoryDocs 逐节核对，缺一即拦）：边界、目标读者、大纲。\n\n示范（照此独立成行写，门禁即认得；注意是列表项、不是 checklist 复选框）：\n\n- **DOC-1: 一句话写清这条做什么**\n" },
  { id: "brainstorming/heavy/doc", stage: "brainstorming", difficulty: "heavy", category: "doc", priority: 10, text: "", include: ["brainstorming/heavy","brainstorming/heavy/overrides","brainstorming/heavy-extra","brainstorming/doc"] },
  { id: "brainstorming/light/doc", stage: "brainstorming", difficulty: "light", category: "doc", priority: 10, text: "", include: ["brainstorming/light","brainstorming/doc"] },
  { id: "decomposing/doc", stage: "decomposing", difficulty: "*", category: "doc", priority: 10, text: "# 类型档 · doc（拆分）\n\n- [ ] 每张卡 = 一个文档路径 + 目标章节，验收 = 章节可读且事实可核。\n- [ ] **只改文档**：卡里不出现代码改动项。\n- [ ] 单列一张卡做 **wiki 挂链**（front-matter / 首页 / 上层页 / 待写页）。\n- [ ] 引用外部事实要给来源与时点，不写无法复核的断言。\n" },
  { id: "decomposing/heavy/doc", stage: "decomposing", difficulty: "heavy", category: "doc", priority: 10, text: "", include: ["decomposing/heavy","decomposing/doc"] },
  { id: "decomposing/light/doc", stage: "decomposing", difficulty: "light", category: "doc", priority: 10, text: "", include: ["decomposing/light","decomposing/doc"] },
  { id: "design/doc", stage: "design", difficulty: "*", category: "doc", priority: 10, text: "# 类型档 · doc（设计）\n\n- [ ] 设计 = 文档改动清单（哪份、哪节、改成什么），**只改文档**。\n- [ ] 结论落点写死：项目说明书的对应章节，不散落成孤页。\n- [ ] **wiki 挂链**设计：受影响的上层页 / 索引页一并列出。\n- [ ] 不规划代码改动；需要代码另立项。\n" },
  { id: "design/heavy/doc", stage: "design", difficulty: "heavy", category: "doc", priority: 10, text: "", include: ["design/heavy","design/heavy/overrides","design/doc"] },
  { id: "design/light/doc", stage: "design", difficulty: "light", category: "doc", priority: 10, text: "", include: ["design/light","design/light/overrides","design/doc"] },
  { id: "implementing/doc", stage: "implementing", difficulty: "*", category: "doc", priority: 10, text: "# 类型档 · doc（实施）\n\n- [ ] **只改文档**：不动代码、不改配置。\n- [ ] 结论进项目说明书的对应**章节**，不新建无入口的孤页。\n- [ ] **wiki 挂链**：新页面补 front-matter 并挂进首页 / 上层页，收工跑一次死链自检。\n- [ ] 引用的数据与命令要标来源与时点，保证可复核。\n" },
  { id: "implementing/heavy/doc", stage: "implementing", difficulty: "heavy", category: "doc", priority: 10, text: "", include: ["implementing/heavy","implementing/heavy/overrides","implementing/doc"] },
  { id: "implementing/light/doc", stage: "implementing", difficulty: "light", category: "doc", priority: 10, text: "", include: ["implementing/light","implementing/light/overrides","implementing/doc"] },
]
