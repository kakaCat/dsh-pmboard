# t-22daf4 把 overrides 里描述本仓流程的补丁收编进正文

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把 overrides 里描述本仓流程的补丁收编进正文

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① `grep -c "覆盖 [0-9]" src/domain/prompt/fragments/implementing/heavy/overrides.md` 输出 2；② 该文件仍含 `覆盖上文`（`grep -c` ≥ 1）；③ `npx vitest run tests/prompt-tiers.test.ts` 的 ⑥ 注入顺序组全绿

## 实施方案（implementation）
改写 `src/domain/prompt/fragments/implementing/heavy/overrides.md`：按设计架构篇「overrides 收编映射」把 10 条收成 2 条 —— 保留并改写「上游附属 skill 在本仓只留档不注册、不得尝试加载」（原覆盖 4），保留「汇报自检（正文不用半角双引号、长文本拆多次调用）」（原覆盖 8）；其余 8 条并入 t2 正文；原覆盖 10（新版四类不可执行项）随对象消失而删除。编号重排为 1、2 连续，标题行与末行 kb 判据行保留。

## 上游产出摘要（dependsSummary）
- 把实施阶段的 heavy 主档改写成本仓自写完整档

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-08T11:27:36.690Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

overrides 卡收口：10 条收编为 2 条，注入体量降到 4658 字符，三条验收判据实测过

### 完成项

- 验收①：覆盖条目数 = 2（编号 1、2 连续）
- 验收②：覆盖上文 在场
- 验收③：prompt-tiers 37 passed（含 ⑥ 注入顺序组）
- 注入文本 6293 → 4658 字符；check-prompt-fragments 退出码 0
- 全量：20 失败 ≤ 基线 68、tsc 0 错；新增 1 条（覆盖 7 字面断言）已转交 t-83bb63

### 改动文件

- `src/domain/prompt/fragments/implementing/heavy/overrides.md`
- `src/domain/prompt/generated/fragments.ts`
- `src/domain/prompt/fragments/implementing/heavy.md`

### 下一步

t-83bb63 同步三处断言（kb-prompt-wiring、路径探针、task-card）

---
