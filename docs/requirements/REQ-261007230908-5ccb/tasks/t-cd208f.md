# t-cd208f G5 补全四工具 prompt 错误码清单

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
G5 补全四工具 prompt 错误码清单

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
T4 校验绿；四工具逐格 grep 比对表进卡汇报（prompt 列码 = 实现所抛，含包装码）

## 实施方案（implementation）
改 src/tools/OpenWindowTool/prompt.ts、SkillInstallTool/prompt.ts、CreateTool/prompt.ts、StatusTool/prompt.ts 的「错误码」行；grep 比对实现所抛

## 上游产出摘要（dependsSummary）
- 建错误码注册表常量模块 error-code-registry.ts

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T15:57:22.130Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t6 完成：G5 四工具漏码补全并逐格对齐实现，三判据全过

### 完成项

- G5 补全：OpenWindow +OPEN_WINDOW_FAILED；SkillInstall +INSTALL_FAILED/CONFIG_INVALID/NOT_BOUND_TO_WINDOW；Create +WINDOW_BOUND/INVALID_INPUT/INVALID_WORKSPACE；Status +REQUIREMENT_NOT_FOUND/STORE_INCONSISTENT/CONFIRM_PENDING
- 逐格 grep 比对表：四工具 prompt 列码 = 实现所抛（完全一致）
- 判据：T4 校验 3/3 绿 + 工具/注入契约 6 套件 70/70 绿 + typecheck 0
- 四张子卡（研发/联调/复核/测试）全部完成

### 改动文件

- `src/tools/OpenWindowTool/prompt.ts`
- `src/tools/SkillInstallTool/prompt.ts`
- `src/tools/CreateTool/prompt.ts`
- `src/tools/StatusTool/prompt.ts`

### 下一步

t7 收官对照表 closure-audit.md

---
