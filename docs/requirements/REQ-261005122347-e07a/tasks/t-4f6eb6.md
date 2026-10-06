# t-4f6eb6 实现投放工具 reqboard_skill_install·研发

> 需求：REQ-261005122347-e07a 需求分析阶段：收录 UI 提示词（MIT）并按引用交付原型 subagent

## 在做什么
实现投放工具 reqboard_skill_install·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:00:43.779Z，窗口 session-6caf9382-cd78-46cf-a397-d723c7103292）

这一步做完，主 agent 有了一个「把设计资产铺到工作区」的动作：调一次就拿到投放根与检索脚本的绝对路径，可以直接写进派给原型子代理的任务里。重复调不会反复写盘，写坏了会整体回滚不留半份，机器上没有 Python 也会如实说「没检索」而不是假装查过。

### 完成项

- 投放用例落地：逐文件全等就跳过不写盘，否则建待写清单交给写盘端口
- 写盘适配器做成事务：先写临时目录、逐文件校验、再整体改名；失败清干净（曾写错一次被用例逮住）
- 解释器探测：python3 → python → py -3 顺序找，拿到版本；全缺不算失败（回执如实说找不到）
- 缺资产检测：自带说明里登记过、盘上没有 → 报缺失并附具体路径（装机漏打包会被拦）
- 工具壳注册进插件，工具清单字符串同步；参数 schema 与错误码映射齐备
- 自测：npx vitest run tests/skills-materialize.test.ts tests/skills-assets.test.ts → 18 passed
- 自测：连跑两次投放 → 第二次 reused=true 且 mtime 未变（实测）
- 自测：npx tsc --noEmit 本卡改动文件 0 错误

### 改动文件

- `src/application/use-cases/InstallSkills.ts`
- `src/adapters/SkillAssets.ts`
- `src/adapters/SkillWriter.ts`
- `src/adapters/PythonProbe.ts`
- `src/tools/SkillInstallTool/SkillInstallTool.ts`
- `src/tools/SkillInstallTool/prompt.ts`
- `src/tools/SkillInstallTool/index.ts`
- `src/tools/index.ts`
- `src/index.ts`
- `src/application/ports.ts`
- `tests/skills-materialize.test.ts`
- `tests/skills-assets.test.ts`

### 下一步

联调：与注入节配合，确认主 agent 拿到路径后子代理能跑通检索

---
