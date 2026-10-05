# t-b875fa depends_on 端到端复现+构建指纹·研发

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
depends_on 端到端复现+构建指纹·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T16:18:04.650Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t3 研发段完成：「depends_on 丢失」有了确定性结论——链路本身正确（端到端用例证成），真坑是 agent 漏传，现在提交侧会点名警告；构建指纹进 status 回执，陈旧构建从此可查

### 完成项

- 端到端成链：tests/plan-depends-e2e.test.ts ①——带 depends_on 批准落库，三父卡 dependsOn 逐环引用前一张真实 id（t- 前缀），与「漏传」形态对照明确
- 漏传防线：plan-deps-check.ts——docDependencyRefs 表格提取 + planDependencyWarnings 点名；SubmitArtifact kind=plan 回执新增 dependency_warnings（不拒，读不到文档不误报）；SubmitTool schema 已先声明
- 构建指纹：shared/build-stamp.ts（set/get，application 层零 fs）；apply() 启动时 sha256(自身产物)[0:12] 盖章 + diag/logger 双通道；queryState 回执带 plugin_build（未盖章整体省略键）；StatusTool schema 已声明
- 四用例全绿：成链/警告命中/警告不误报/指纹回执+schema 同源
- 回归：plan-landing-parity/plan-refs/tools-schema/arg-guidance 绿；output-contract 3 红与 decompose-tools 5 红均为既有基线（20:52/23:12 在案）；index.ts:225 tsc 是他窗 23:55 事件桥（非本卡行）
- git diff --stat：新增 plan-deps-check.ts / build-stamp.ts / plan-depends-e2e.test.ts；SubmitArtifact +14；QueryState +6；StatusTool +5；index.ts +18

### 改动文件

- `src/application/internal/plan-deps-check.ts`
- `src/application/use-cases/SubmitArtifact.ts`
- `src/shared/build-stamp.ts`
- `src/application/query/QueryState.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `src/index.ts`
- `tests/plan-depends-e2e.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-b875fa.md`

### 下一步

复核段（t-dff3c4）：对照设计逐条核对

---
