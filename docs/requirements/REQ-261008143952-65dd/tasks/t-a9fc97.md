# t-a9fc97 全量回归与注入抽检

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
全量回归与注入抽检

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
① 门禁 exit 0；② npx vitest run 全绿；③ 抽检输出含三个关键词、charCount=23158、无 overBudget；④ overrides 三条收口文案逐条在场并已人工复核

## 实施方案（implementation）
收口验证：① 跑 node scripts/check-prompt-fragments.mjs（镜像与源/产物同步）；② 跑 npx vitest run 全量单测（重点看 160 条类型轴、预算上界、工具名一致、P1 基线）；③ 用 resolveStagePrompt({stage:implementing, difficulty:heavy, category:feature}) 抽检注入文本含新版关键词 The Task Loop / Common Rationalizations / Continuous execution，且 charCount ≤ 24000（实测 23158）、overBudget 为 undefined；④ 人工过一遍 overrides「覆盖 10」的三条收口文案是否足以阻止 agent 尝试加载 superpowers:*（行为层判据，只能人看，如实标注，不假装有自动测试）。

## 上游产出摘要（dependsSummary）
- 更新 ATTRIBUTION.md 档案
- 更新三处测试引用
- 重刷 P1 基线快照

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-08T10:52:44.127Z，窗口 session-d7422892-bcde-406a-a95e-3c0868cdd93c）

t8 完成：门禁与探针 exit 0、抽检通过、本需求范围 269 条全绿；全量 18 条红经取证为既有状态；并修复了探针门禁回归。

### 完成项

- ① 门禁 exit 0；①b 路径探针缺口 0、禁词 0
- ② 全量：18 failed / 7154 passed；经 HEAD 干净 worktree 取证为既有状态（HEAD 22 failed），本需求零新增失败
- ② 本需求范围 269 条全绿（prompt 五件套 + 探针）
- ③ 抽检四项关键词在场、charCount=23852 ≤ 24000、无 overBudget、注入顺序正确
- ④ 覆盖 10 四条收口在场并已人工过一遍；探针白名单按既有先例登记
- 重大发现并修复：新版正文的 scripts/task-start / scripts/task-done 属第三类不可执行项，已收口并消除探针门禁回归
- 显式声明 scope 扩张：计划外改了 scripts/prompt-path-probe.mts（不加则门禁永久红），白名单仅锚定两个确定名
- tsc 0 错误

### 改动文件

- `src/domain/prompt/fragments/implementing/heavy/overrides.md`
- `scripts/prompt-path-probe.mts`
- `src/domain/prompt/generated/fragments.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

需求收口后进入验收；验收材料如实写清 18 条红的既有属性与 scope 扩张。

---
