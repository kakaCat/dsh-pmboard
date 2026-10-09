# 需求分析（brainstorming）· 完整档

> 2026-10-08 用户裁定：本档为**自写完整档**——vendor 的 brainstorming skill 主流程
> （澄清 → 提方案 → **分段呈现设计** → 写 spec → writing-plans）与本仓阶段边界冲突：
> 架构 / 组件 / 接口 / 数据流的设计属 **design 节点**，需求阶段只做**需求定义**
> （要什么、为什么、边界、失败路径），不答"怎么实现"。vendor 原文留档
> `src/domain/prompt/vendor/superpowers/brainstorming/SKILL.md`（不再作为 heavy 主 skill 注入，
> 故本档不做"与 vendor 原文逐字一致"断言）；其协作纪律骨架（Three Paths / Red Flags /
> YAGNI / 批准闸门）在本档保留并接线到本仓节点链。
> 本阶段产物只有两样：**requirement.md**（需求定义）+ **原型**（UI 需求必交）；
> 设计文档、任务卡、实现代码一律不属本阶段。

## 1. 路径分类（Three Paths）

先分类、说出口，让人可以纠正（分类说错 = 后面全错）：

- [ ] **Spike**（可行性问题："能不能……"）：产出是答案不是代码。2-3 句说清要验证什么，
      点头即开工；结论落进 requirement.md（很短也行）——"spike 不写需求文档"在本仓
      不适用（产物不省）。
- [ ] **Bounded**（仓库已有流程内的小改）：改动面小、无新决策点；澄清后直接写简版
      requirement.md（短即是轻）。"太简单不用走流程"由代码级拦截
      （artifact_not_confirmed）拒绝，不由模型自裁。
- [ ] **Architectural**（新项目 / 新子系统 / 改接口）：走完整流程——
      探索 → 澄清 → 方向级方案 → 写需求文档 → 原型（UI）→ 确认交棒。
- [ ] 拿不准就走重的一档；中途发现隐藏复杂度 → 停手、声明、升级（升级单向，不降级）。

## 2. 探索与澄清（对话纪律）

- [ ] 先看项目现状（文件 / docs / 最近提交）再提问；范围大到要拆子项目时先指出，再逐个立。
- [ ] 一次只问一个问题，多选优先；问的是 purpose / constraints / success criteria。
- [ ] **YAGNI**：每个方案都砍掉不必要的功能；需求文档只写本期要做的。
- [ ] **人的祈使 / 纠正 / 补充逐条落账 D-x**（「讨论与裁定记录（D-x）」表，五列齐、
      引原话）——不记即拒（decision_log_missing）。

## 3. 方向级方案（不展开设计）

- [ ] 提 2-3 个**方向级**方案：做什么、边界、取舍 + 你的推荐与理由。
- [ ] **方向 ≠ 设计**：不写架构图、类结构、接口签名、数据模型、代码片段——
      这些回答"怎么实现"，属 design 节点；本阶段只回答"做什么、为什么、不做什么"。
      （实测：曾在本阶段连写数份类设计代码，被人打断——"这是需求分析阶段的工作吗"。）
- [ ] 方案敲定后把结论落进 D-x 表，再动笔写需求文档。

## 4. 写需求文档 requirement.md

- [ ] 落 `docs/requirements/REQ-xxxxxx/requirement.md`（头部带 REQ id）。
- [ ] **先读类型模板再动笔**（`templates/brainstorming/feature.md`，按需求类型选对应文件）：
      front-matter `sides`、必填节名（逐字命中，如「失败与并发路径」）、每条 FR 带可执行判据
      （跑什么命令 / 看什么读数 / 什么明确取值）——缺一项登记时被门禁拦，
      拦后整篇重写比先读模板贵得多。
- [ ] 人读三件套：TL;DR + ASCII 业务流程图 + 功能点总览表；业务语言，不写技术实现。
- [ ] 落盘后用 `reqboard_submit(kind=requirement)` 登记产物。

## 5. 原型（UI 需求必交）

- [ ] sides 含 frontend 时交 `prototypes/<name>.html` + `prototypes/INDEX.md`
      （标唯一 authoritative），用 `reqboard_submit(kind=prototype)` 登记；
      无豁免即拒（prototype_missing）。
- [ ] **必须派 subagent 做原型**，派发纪律见 heavy-extra 的原型派发一节；
      主 agent 不亲自写原型界面。

## 6. 自查 + 确认交棒

- [ ] 需求自查（写完用新眼光过一遍，就地修）：占位符（TBD / TODO / 空话判据）/
      前后矛盾 / 歧义（一条 FR 两种读法）/ 范围（是否大到要先拆）。
- [ ] 确认门（肯定答复自动落章并推进；未确认推进被代码级拒绝 artifact_not_confirmed）：
      下一步：design —— 用 reqboard_ask_confirm(target=artifact, kind=requirement) 交棒；未获批准不得进入。

## Red Flags（红旗：想这么干就停）

| 想法 | 现实 |
|------|------|
| "太简单，不用写需求文档" | 简单 = 文档短，不是没文档；闸门是批准，不是文档长度。 |
| "方案讲完了，顺手把类设计也写出来" | 设计属 design 节点；本阶段写设计 = 越界，会被打断返工。 |
| "用户答了 A/B/C，口头共识就够了" | 口头共识不落 D-x 表 = 没发生（decision_log_missing）。 |
| "需求文档凭经验写，模板待会再看" | 节名 / sides / 判据被门禁拦后整篇重写，先读模板便宜得多。 |
| "原型我自己顺手写了，不用派 subagent" | 原型必须派 subagent（派发纪律见 heavy-extra）。 |

- [ ] 判定标准挂可跑命令：先查 `reqboard_kb(kind='standard')`。
