# t-9f4f1d 文档模板加两节（关键决策与取舍、技术方案与亮点）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文档模板加两节（关键决策与取舍、技术方案与亮点）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
命令 grep -l "关键决策与取舍" templates/design/*.md templates/brainstorming/*.md | wc -l 返回不小于 2；命令 git diff --name-only 表明既有节名未被改名（仅新增行）。

## 实施方案（implementation）
在 templates/design/architecture.md 及适用的设计模板里加两节骨架（关键决策与取舍、技术方案与亮点）；在 templates/brainstorming/feature.md 及按类型的模板里加同名节或指向设计节的说明。不改既有节名，只新增。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T01:23:38.498Z，窗口 session-00af6c69-e55e-4878-8d4e-74056a439b01）

这一步做完，写新需求的人有地方落笔那两节了；页面主干里「关键决策与取舍」「技术方案与亮点」两条从此有据可抽，而设计侧标题的 serves 标注由抽取端容忍处理。

### 完成项

- 15 份模板新增「关键决策与取舍」「技术方案与亮点」两节，逐字节节名
- 两种 grep 锚点均命中 15 份（分母也是 15，无遗漏）
- 只有新增行：311 行新增、0 删除，既有节名零改名
- 设计侧完整占位、需求侧两档占位，新节不留空标题
- 上报并转交一处门禁冲突：抽取端须剥 serves 标注后按前缀匹配
- 自测：typecheck 零错误；模板地址测试的失败为开工前既有（干净 worktree 复跑同样失败）

### 改动文件

- `templates/design/architecture.md`
- `templates/design/backend.md`
- `templates/design/frontend.md`
- `templates/design/data-model.md`
- `templates/design/interfaces.md`
- `templates/design/migration.md`
- `templates/design/test-cases.md`
- `templates/design/use-cases.md`
- `templates/brainstorming/feature.md`
- `templates/brainstorming/refactor.md`
- `templates/brainstorming/bug.md`
- `templates/brainstorming/chore.md`
- `templates/brainstorming/doc.md`
- `templates/brainstorming/spike.md`
- `templates/brainstorming/feature-example.md`

### 下一步

t6 接线六条只读路由（等 t3/t4/t5 完成）

---
