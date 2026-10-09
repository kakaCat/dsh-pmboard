# 拆分（decomposing）· 完整档

> **本仓口径例外**：superpowers 14 份 vendor 原文里**没有**"拆分 / 任务 DAG / 卡质量"的对应
> skill（对照结论 §4.5），故本档为**自写完整档**，不做"与 vendor 原文逐字一致"断言。
> 可迁移要点三条（来自 writing-plans 的通用纪律）：文件结构先定、任务右尺寸、
> 每张卡独立可测。

## 1. 代码层面变更盘点（对照需求文档 + 设计一套）

- [ ] **新增**：哪些接口 / 功能 / 文件。
- [ ] **修改**：精确到模块 / 函数。
- [ ] **删除**：哪些旧符号 / 旧路径。
- [ ] 写进 docs/requirements/REQ-xxxxxx/decomposition.md。

## 2. 批次与依赖（depends_on）

- [ ] 按依赖安全序排批次：被依赖者先定义，**禁止前向引用**（引用后定义的任务会在提交时被打回）。
- [ ] depends_on 用批次内 key 引用同批任务；跨批用已落库任务 id。

## 3. 每卡必给 implementation 与 acceptance

- [ ] 做什么（title / description）＋ 怎么做（implementation：改哪些文件 / 步骤 / 验证方式）
      ＋ 怎么算完（可证伪 acceptance）＋ 依赖。
- [ ] **薄卡拒落**：缺 implementation、或 acceptance 是空话（"功能正常""优化体验"）
      会被代码级拒绝。

## 3.5 粒度纪律（接口级 / 组件级，REQ-261007125552-32cb）

- [ ] **功能卡 = 接口级**：一个功能要 N 个接口就拆 N 张接口卡、契约卡先行。
      一卡 `implementation` 声明 >1 个接口会被**接口数门禁**拒（plan_card_multi_interface）；
      契约卡 / 聚合组装卡确需多接口时，给该卡写 `granularity_exempt:"理由"` 显式豁免
      （豁免不静默：理由进返回体供批准人复核）。
- [ ] **页面卡 = 组件级**：按设计文档「组件树」的叶子组件拆，页面本身只留一张接线/组装卡。
- [ ] **UI 卡一卡一原型锚点**：一卡多锚点 = 太粗信号（软门点名）。
- [ ] **对照表必填**：decomposition.md 增「接口清单 ↔ 接收卡 key」对照表——设计文档
      「接口清单」节的每个条目都要有卡接（一对多合法：契约卡+实现卡同接一个接口）；
      缺行 / 右列 key 悬空会被对照表门拒（plan_interface_map_missing）。含 UI 时另加
      「组件树 ↔ 接收卡 key」段。**词法避让**：key 列必须叫「接收卡 key」——叫「计划 key」
      会被任务表判据（取第一张含「计划 key」的表当任务表）误认。
- [ ] **形态软上限**：footprint.files > 5 会进 granularity_warnings（不拒，但批准人会看到）——
      能按接口/组件切小的就先切。
- [ ] **每卡必带 `requirement_refs`**（2026-10-06 加固）：`tasks[]` 里逐卡写
      `requirement_refs:["FR-N"]`——条款覆盖门禁**只认**这一条通道（计划文档的覆盖对照表
      降级为人读汇总），卡上 refs 同时是 RTM `covers_frs`、结单证据锚定与条款接收状态的唯一读数。
      实测教训：门禁曾能被文档对照表单独满足，而落库的卡上有 refs 的只有 28%（静默缺口）。
- [ ] **伪依赖要一句语义理由**：某条 `depends_on` 两端 `implementation` 声明的文件零交集时，
      在 `dep_reasons` 里给它写理由（键=被依赖的计划 key）；不写只会进回执的建议清单
      （实测 78/107 条依赖边两端文件零交集——可并行的卡被串成链）。
- [ ] **跳联调要写理由**：`skipIntegration: true` 必须同时给 `skipIntegrationReason`（凭什么是
      "无接口可联调"），缺理由提交被拒（实测 20/99 张卡跳联调，只有 4 份计划写了理由）。
- [ ] **文档所见 = 批准所见**：decomposition.md 的任务表必须覆盖 `tasks[]` 的全部 key，
      且列齐「验收」「工作量」——表缺行/缺列会被硬拒（实测有需求文档 41 行无任务表，
      而 plan.json 有 10 张完整卡：批准时人看到的是空的）。

## 4. 容量纪律（一轮装多少：先算，再切）

- [ ] **口径**：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量缺省 16 DU
      （权重与容量只在 `src/domain/limits.ts` 定义一次，别在计划里另抄一套）。
- [ ] **每卡必声明 footprint**：`files` / `anchors` / `chars` 三个正整数，随任务表提交；
      `files` **不得小于** implementation 里点到的路径数——允许留余量，缩水会被
      `REQBOARD_BAD_FOOTPRINT` 拒。
- [ ] **超容量自己切**：某卡 `detailUnits > 容量` 时按目录 / 按接口切成更小的卡，
      不要把超容量卡原样交上去。
- [ ] **确需保留就标红**：在计划文档该卡行写 `⚠️超容量(建议N批)`，N = 算出的批数
      （写错会被 `plan_overcapacity_marker_missing` 拒）。
- [ ] **批准文本照抄清单**：超容量清单自带「超容量 N 张：…」标签
      （`overCapacitySummary`），别再拼一遍标签。

## 5. 边界校验（不超范围、卡可独立验收）

- [ ] 每张卡都能被独立验收：一个新窗口**零会话历史**、只凭任务卡就能开工。
- [ ] 本阶段不二次创作设计：与设计矛盾时**退回设计改计划**
      （重新 `reqboard_submit(kind=plan)` 并重新批准），不在拆分阶段私改设计。

## 6. 提交与批准门（2026-09-21：拆分计划在拆分阶段写）

- [ ] `reqboard_submit(kind=plan)` 提交拆分计划（path=decomposition.md、summary、tasks=任务表）。
- [ ] **批准门**：提交后先看回执——已写明「已有一道门在等 / 已自动触发批准弹框」时
      **不要重复发起**（同一道门只会复用，不会开第二个框）；只有回执说没弹框时才调一次
      `reqboard_ask_confirm(target=plan)`——**批准后自动落库任务卡并进入实施**
      （中途不再打断）；未获批准 reqboard_decompose 被代码级拒绝。
- [ ] 兜底：计划未含任务表时，`reqboard_decompose` **必须传 tasks**——本工具即任务卡创作口。

## 7. 交棒

- [ ] 下一步：implementing —— 用 reqboard_ask_confirm(target=plan) 交棒；未获批准不得进入。
      发起前先看回执：已写明「已有一道门在等 / 已自动触发批准弹框」时**不要再发起**
      （有门就取回执 reqboard_ask_confirm(ticket=…) 或到看板作答——同一道门只会复用，不会开第二个框）。
