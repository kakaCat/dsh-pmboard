# 用例走查 · 子卡阶段模板补充

> **TL;DR**：七个端到端场景覆盖全部 FR；每个场景给「输入 → 预期落库/回执」，
> 均可转成集成用例。

## UC-1 计划引用模板键（主路径） · serves: FR-4, FR-5

计划任务表：`{ key: 't1', title: '改工具描述文案', template: 'change-only', phase: 'implement' }`
→ 提交通过 → `reqboard_decompose` 落库：`TaskRecord{ template: 'change-only', stages: ['dev','review'] }`
→ 开工懒展开：**两张**子卡（研发、复核），不落联调/测试段。
判据：`queue.json` 里 t1.stages = `["dev","review"]`，子卡链长度 2。

## UC-2 拒绝非法模板键（响亮失败） · serves: FR-4

`{ template: 'chnage-only' }`（拼错）→ 计划提交被拒：`REQBOARD_TEMPLATE_CONFLICT/INVALID`
文案列出全部合法键；**不落任何卡**。反向：`stages` 与 `template` 同给 → 同样被拒并点名卡 key。

## UC-3 e2e 段执行 · serves: FR-1

父卡 `stages: ['dev','integrate','review','test','e2e']` → 链尾出 e2e 子卡 → 子代理按边界规则
只做场景断言（提示词含「不要改实现」「不要重复父卡终态命令」）→ 产出 `{verdict, evidence, summary}`
→ verdict 族凭证门放行。判据：脚本 schema 与 test 段同族；提示词含 e2e 边界规则文本。

## UC-4 manual 段停链等人（本需求核心新行为） · serves: FR-2

父卡 `stages: ['dev','manual']` → dev done → 链选中 manual 子卡 → **不派 run**：清单骨架落盘
`docs/requirements/<REQ>/manual/<taskId>.md`（含时间戳）→ 子卡 in_progress →
`stopped='awaiting-manual'`，autoRun 仍 true、noopStreak 不变 → 工具回执指引人工核对。
人核对后：agent 更新清单 + `reqboard_task_report(filesChanged=[清单,截图])` →
file 族凭证门（mtime > 骨架）→ done → `reqboard_task_run` → 链续跑/rollup。
反向：只生成骨架不更新 → mtime 不新鲜 → 凭证门拒（**伪造核对过不了门**）。

## UC-5 release 段执行 · serves: FR-3

父卡 `stages: ['dev','review','release']` → release 子卡跑构建/发版命令，产出
filesChanged（版本/变更文件）+ evidence（构建戳断言输出）+ 回滚方式声明 →
file 族凭证门放行。判据：验收模板含「回滚方式显式写明」锚点，review 段复核时逐条核对。

## UC-6 capture 段执行 · serves: FR-6

父卡 `stages: ['capture','review']`（探针/截图卡）→ capture 子卡把产物落
`docs/requirements/<REQ>/evidence/` → filesChanged 列出产物 + 每项摘要 + 可复核命令 →
file 族凭证门放行。判据：不再借用 dev 段的「vitest 全绿 + git diff」验收模板。

## UC-7 新段登记完整性（反向演练） · serves: FR-7

摘除任一新段的 `STAGE_SCOPE_RULE` 项 → `npx tsc --noEmit` 报错（改造前是静默 `?? ''`）；
摘除 `STAGE_TO_PHASE_COLOR` 任一项 → 编译报错。判据：两处反向演练的 tsc 输出入验收证据。

## 既有行为不变（回归面） · serves: FR-4, FR-5

- 不给 `template` 的旧计划：提交、落库、展开行为逐字节不变（既有用例全绿即证）。
- `skipIntegration` 单独使用：语义不变；与 `template` 叠加 = 先取链再裁 integrate。
- solo 卡（`stages: []`）：不受任何新逻辑影响（显式 stages 优先级最高，短路在前）。
