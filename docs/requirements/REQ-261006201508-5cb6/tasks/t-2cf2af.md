# t-2cf2af 按登记面重写 README 工具表并校准计数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
按登记面重写 README 工具表并校准计数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
① README 表内 reqboard_ 行数 = 27（grep -c 计数）；② README 全文名字集合与 TOOL_REGISTRY 的 toolName 集合双向差集为空（comm -13 两条命令均无输出）；③ grep -c reqboard_advance README.md 输出 0；④ README.md 与 package.json 中「13 个」「21 个」命中数均为 0，且「27 个」在 README 出现 ≥3 次、在 package.json description 出现 ≥1 次；⑤ 表内可见 archive_amend / handoff / skill_install / task_refs 四个工具名。

## 实施方案（implementation）
改 README.md：把「提供的工具」一节重写为 27 行、按 6 组分类（立项与自查 / 阶段推进与人工门 / 拆分与任务 / 自动实施链 / 归档 / 协作与环境）的表；补 archive_amend、handoff、skill_install、task_refs 四行；删幽灵行 reqboard_advance；reqboard_task_execute 描述改为「已弃用别名：等价 reqboard_task_run」；reqboard_submit 描述补 design / prototype 两种 kind；reqboard_capture 行的描述不写提问数（口径三套并存，见 design/architecture.md 第 13 节遗留问题）；第 13 行与第 107 行的计数、第 42 行表头计数改为与登记面一致。另改 package.json 的 description 计数。格式契约逐字见 design/interfaces.md 第 2 节：节标题形态「## 提供的工具（N 个）」，每行首列为反引号包裹的工具名，分组用 ### 标题且不参与断言。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T12:33:47.756Z，窗口 session-be51186a-1e9c-49ba-8c20-144c14c224aa）

按登记面重写 README 的「提供的工具」一节为 27 条、六组分类的表，并把 README 三处计数与 package.json 描述校准到 27；五条验收命令全部通过。

### 完成项

- README 工具表重写为 27 行，按 6 组分类（立项与自查 / 阶段推进与人工门 / 拆分与任务 / 自动实施链 / 归档 / 协作与环境）
- 补齐四个此前漏列的工具：reqboard_archive_amend / reqboard_handoff / reqboard_skill_install / reqboard_task_refs
- 删除幽灵条目 reqboard_advance（源码无此工具，真入口是 reqboard_task_run）
- reqboard_task_execute 行描述改为「已弃用别名：等价 reqboard_task_run」
- reqboard_submit 行描述补齐六种 kind（含设计文档与原型）；reqboard_capture 行不写提问数
- README 第 13 行、目录树注释与表头三处计数由 13 / 21 校准为 27
- package.json 描述的工具计数由 13 校准为 27
- 验收①表内行数 27；②与登记面双向差集均为空；③reqboard_advance 命中 0；④旧计数命中 0 且「27 个」出现 README 3 次 / package.json 1 次；⑤四个补入工具各命中 1 次

### 改动文件

- `README.md`
- `package.json`

### 下一步

开工 t2（t-185fe6）：让注册日志从登记面派生（工具面出口再导出 TOOL_REGISTRY + 文件头注释 + index.ts 日志表达式）

---
