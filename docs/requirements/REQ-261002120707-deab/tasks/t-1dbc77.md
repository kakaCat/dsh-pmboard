# t-1dbc77 建 eval-suite 骨架与执行 runbook·研发

> 需求：REQ-261002120707-deab PM 插件 Agent 测评套件编制

## 在做什么
建 eval-suite 骨架与执行 runbook·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T04:36:28.947Z，窗口 session-d89ef03b-e441-49b5-bd69-b463a93ad7bc）

建好 eval-suite 骨架（7 个子目录）并编写 README（套件总览+执行入口）与 runbook（六步执行规程），与设计 architecture.md 布局及需求文档执行规程一致。

### 完成项

- 创建 eval-suite/ 及 7 个子目录（scenarios/assertions/{ledger,trajectory}/rubrics/calibration/regression/reports）
- 编写 eval-suite/README.md：套件总览、三层断言说明、目录表、用例组总览（含红线标注）、执行入口指向 runbook
- 编写 eval-suite/runbook.md：六步规程展开为可勾选操作清单（备环境/放 agent/取断言材料/三层评分/出报告/回归）+ 角色纪律节

### 改动文件

- `eval-suite/README.md`
- `eval-suite/runbook.md`

### 下一步

复核子卡：对照验收标准核对目录布局与两份文档内容。

---
