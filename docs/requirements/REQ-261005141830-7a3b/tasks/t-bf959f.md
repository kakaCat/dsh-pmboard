# t-bf959f 立项定身份：写入 projectId 与未归属标注

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
立项定身份：写入 projectId 与未归属标注

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/project-identity.test.ts -t T-08 → 绿；-t T-09（无归属窗口不写 id 且评论含「未归属」）→ 绿；-t T-11（同项目另一窗口立项不被「本项目已有需求」拒）→ 绿；-t T-12（推进 1 条不动另 2 条）→ 绿。

## 实施方案（implementation）
src/application/use-cases/CreateRequirement.ts 与 src/application/use-cases/CaptureRequirement.ts 取窗口 projectId 写入记录；未命中则不写该键并在立项评论里标注「未归属项目（按路径兜底）」；回执加 projectId / projectSource。

## 上游产出摘要（dependsSummary）
- 立项目身份底座：注册表端口 + 三个纯函数
- 数据契约：projectId 字段、摘要投影、落库列与查询过滤

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T07:02:29.755Z，窗口 session-5ae0ddcc-04c0-4c3e-8ef0-86661f9234aa）

这一步做完，新需求出生就带身份、没身份会被明写出来；但要说清**当前还没真正生效**：生产装配（组合根）还没注入项目表端口，所以现在立项会走到"未归属"这一支——行为不劣于改造前，真正的收益在下一张卡（t5 装配）之后才上线。

### 完成项

- 两条立项入口（手工 create / 弹框 capture）按本窗口解析项目身份并写入记录；回执带上身份与判据来源
- 解析不到时**不写该键**并在立项评论里明写「未归属项目（按路径兜底）」——不猜、不拿当前项目当默认值
- 入口级用例走真实立项用例与真实临时工作区（不是替身），回执与台账两面一致
- 验收：T-08 / T-09 / T-11 / T-12 四组全绿；整文件 37 条全绿；类型检查 0 错误；相关回归 3 处失败与改动前基线同名
- 已知边界（如实登记）：项目条目指向的目录不可用时写侧硬拒（设计内，见复核留痕）；RTM 同步侧遇同类失败是「记一句就跳过」的存量 fail-open 面，本次不扩范围

### 改动文件

- `src/application/internal/support.ts`
- `src/application/use-cases/CreateRequirement.ts`
- `src/application/use-cases/CaptureRequirement.ts`
- `tests/project-identity.test.ts`

### 下一步

t5 组合根装配：把项目表端口接到生产装配上，并让看板 / 扫描 / 知识层 / 子代理根都按项目走（在此之前，新需求会如实标"未归属"，行为不劣于改造前）。

---
