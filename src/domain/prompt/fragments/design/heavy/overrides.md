## 本仓覆盖条目（覆盖上文与本仓冲突之处；priority=floor，永不被裁）

- [ ] **覆盖 1 · 节点归属、登记命令与触发者**：本仓设计产出一**套**文档（按主题分：架构 / 数据层 /
      选型 / UI / 测试用例；规模小可合一），落在 `docs/requirements/REQ-xxxxxx/design/*.md`；
      不是上文默认的 `docs/superpowers/plans/…`。**登记不是自动发生的**（上文「落盘后自动登记」
      在此不成立，也不是等人打开看板）：文档落盘后由**本窗口 agent 自己**调
      `reqboard_submit(kind=design)`——path 缺省扫 design/ 全目录（幂等，重复调不重计）。
      **不要猜 kind**：设计文档的登记种类只有 `design`，别试 `requirement` / `plan` /
      `verification` / `archive`（它们各对应别的阶段产物，传错会被工具枚举挡下），
      也别因为被拦就盲试别的 kind。登记齐后调
      `reqboard_ask_confirm(target=artifact, kind=design)` 请人确认；
      （若跑在没有该登记入口的旧版本上：落盘后打开看板需求详情页触发登记，再重试。）
- [ ] **覆盖 2 · 不含任何拆分内容（W7 边界）**：设计只管方向与"怎么做"，不写实现代码；
      **任务表 / 任务 DAG / 拆分计划章节一律归 decomposing（拆分）阶段创作**——拆分计划
      在那里提交并经人批准（批准即自动落卡开跑）。设计文档里出现任务表特征
      （depends_on 表头等）会被拆分内容门禁拒绝确认（design_contains_decomposition）。
- [ ] **覆盖 3 · 确认闸门（G2）**：调 `reqboard_ask_confirm(target=artifact, kind=design)`
      请人确认设计文档——一次确认 = 全部设计文档成组落章；文档集未交齐（feature 五份
      必交 + 端侧条件必交）或未全部确认时，design→decomposing 被代码级拒绝
      （design_doc_incomplete）。
- [ ] **覆盖 4 · 数据层与回滚**：本仓要求明确"是否改表 / 改 schema、迁移方式与回滚"——
      这是上文 "Global Constraints" 在代码层面的落点。
- [ ] **覆盖 5 · 交棒**：下一步：decomposing —— 确认设计文档后自动推进；未获确认不得进入。
- [ ] **覆盖 6 · 章节可追溯 + 语言强度按层**：设计文档的**每个二级章节**必须带
      «B»serves: FR-4«B» 标注（多值逗号分隔）——缺标注即**孤儿章节**，拆分阶段提交计划
      被门禁拒绝（design_orphan）。语言强度按层：**设计以技术语言为主，不必写成散文**，
      但每节要能回答"服务哪条功能点"；需求与验收用全业务语言；拆分用业务标题 + 技术细节下沉。
- [ ] **覆盖 7 · 原型锚点与裁定（UI 需求）**：需求交了原型时，设计文档引用原型必须指向
      `prototypes/INDEX.md` 里的**权威路径**（指向 superseded 会被拒，prototype_version_conflict），
      锚点形态 `prototypes/<name>.html#FR-N`；**锚点不计入 serves**（走 `protoRefs` 单独记账，
      假引用会让覆盖度虚高）。本节还要引用相关 D-x 裁定：每条裁定至少被一条 FR 明细或一个设计章节引用，否则覆盖度点名。
- [ ] **覆盖 8 · 接口清单/组件树必备节（REQ-261007125552-32cb FR-1）**：feature 需求的
      `interfaces.md` 必含「接口清单」节（节内要有表头含「接口 id」的清单表——散文列举不算；
      无对外接口面时在节内写「不适用：<理由>」保留节）；sides 含 frontend 时 `frontend.md`
      必含「组件树」节（页面 → 组件 → 叶子组件，叶子是拆卡粒度单位）。缺节在 design 提交时
      被内容校验门禁拒（REQBOARD_DESIGN_CONTENT_GATE）。这两份清单是拆分阶段的对照输入——
      清单里没有的东西不许凭空造卡，清单里有的不许漏接（拆分对照表逐条核对）。

