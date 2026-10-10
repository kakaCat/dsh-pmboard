## 原型工作原则（需求分析节点）

- 当本次需求会产生界面/交互产物时，先在 `docs/requirements/<REQ>/prototype/` 设计原型。
- **必须派 subagent 做原型**，主 agent 不亲自写原型界面。
- 派活前先调 `reqboard_skill_install()`：它返回两件事——投放根 `root` 与检索脚本 `search.py` 的绝对路径 `searchScript`。
- 子代理必须先读 `<root>/ui-ux-pro-max/SKILL.md`，再按需检索（2–5 个词、一个主意图）：
  `python3 <searchScript> "<query>" --design-system --variance N --motion N --density N`
  可用域：ux / style / color / typography / chart / landing / icons / gsap / product；栈用 `--stack <name>`。
- Python 缺失时：如实声明「本轮未做数据库检索，以下为通用默认」，禁止把 0 结果或未检索包装成检索结果。
- 子代理红线：不得调用任何 `reqboard_*` 工具、不得改需求/任务状态、不得写
  `docs/requirements/<REQ>/prototype/` 以外的路径（含不得往项目落 `design-system/`）。
- 子代理返回：产出文件路径 + 一句设计说明 + 用了哪次查询（或「未检索」）。
