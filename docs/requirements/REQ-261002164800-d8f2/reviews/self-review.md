# 自评报告 · REQ-261002164800-d8f2（计划落库 refs 断链修复）

> 作者：实施窗口 session-fcfe356b ｜ 日期：2026-10-02 ｜ 对应需求：docs/requirements/REQ-261002164800-d8f2/requirement.md
> 本报告只写**能被复核的事**：结论附命令或文件路径；偏离与未做项单列，不埋在正文里。

## 1. 一句话结论

「哪张卡接哪几条 FR」的**取数、门禁、写入**各收敛成一处，三条落库入口共用；落错/漏写的引用事后能补；
存量空引用有可试跑、可回滚的批量补法。实施链 8/8 卡 done，新增 8 个用例文件 / 56 条用例全绿。

## 2. 逐条对照需求条款（FR-1 ~ FR-7）

| 条款 | 交付物 | 可复核证据 |
|---|---|---|
| FR-1 三入口同取数同门禁 | `plan-refs.ts`（唯一组装点）、`approved-plan-landing.ts`（共用落库层）、看板 `req/plan/approve` 改走同一层 | `plan-refs.test.ts` 9 passed；`plan-landing-parity.test.ts` 7 passed；`board-plan-approve.test.ts` 5 passed；`grep refsForLanding src` 命中 = 定义 1 + 两处调用 |
| FR-2 计划通道打通 | `PlanTask.requirement_refs?`、`normalizePlanTasks` 保留并校验、`reqboard_submit(kind=plan)` 入参 schema 补字段 | `requirement-refs.test.ts` 16 passed（含"真工具编译后 schema 含该字段"断言） |
| FR-3 文档兜底三入口一致 | `refsForLanding` 内 显式 → 文档覆盖表 → 空（点名为止，不拒批） | `plan-refs.test.ts`（显式优先 / doc 兜底 / sources=none）；`landing-failure-loud.test.ts` 4 passed（警告两处可见） |
| FR-4 补写入口 | `AmendTaskRefs.ts` + 工具 `reqboard_task_refs` + 看板 `task/update` 收 `requirementRefs` | `task-refs-repair.test.ts` 6 passed（改成功 / 幂等 / 跨需求拒 / 非法值拒 / 空数组清空 / RTM serves 同步） |
| FR-5 存量回填 | `backfill-task-refs.ts`（核心）+ `scripts/backfill-task-refs.ts`（CLI：dry-run/apply/check/restore） | `backfill-task-refs.test.ts` 4 passed；真库只读试跑 候选 10 / 无来源 1 / 跳过 618 |
| FR-6 失败响亮 | `confirm-settle.ts` 三条失败/降级路径 + 文案审计 | `landing-failure-loud.test.ts` 4 passed（不推进 + pausedReason + 评论含可执行入口 + 告警 + 收尾失败仍推进） |
| FR-7 读数可信 | `plan-landing.ts` 的 RTM 入参改用按 `createdIds` 过滤的真实记录 | `plan-landing-parity.test.ts` 中 `covers_frs` 非空且等于卡上 refs（修前恒空） |

## 3. 偏离与未做项（如实登记）

1. **三入口"共用 landApprovedPlan"只对两条人工入口成立**：`reqboard_decompose` 的创作路径仍直接调 `landPlanTasks`
   （它要落的 draft 不在批准计划里）；共用的是取数点与落库函数。已在 t3 复核报告中登记。
2. **RTM 触发点复用 `task:status` / `confirm:plan`**：vendor 的 `RTMTrigger` 枚举里没有 `task:refs`，
   不为一个触发名去改 vendor 类型。
3. **真实库未执行 `--apply`**：那会改活数据（预计改 277d 的 10 张卡）。按纪律留给人在验收时拍板；
   apply/check/restore 三步已在夹具上验证。
4. **一项真实数据勘误**：需求里写的「590 卡 531 张空引用」中，554 张属归档/取消需求、50 张是子卡、
   14 张已有引用——**真正可回填的是 10 张**（全在 REQ-261002161439-277d）。回填器的 dry-run 读数即此。
5. **未纳入范围**：「拆分到实施中断」（投递后残留锁 + 投递结果不留痕）是另一族缺陷，已单独上报，不在本次改动内。

## 4. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 误改既有引用 | 回填器**只补不覆写**；补写入口是"全量替换"但值同不写盘、且必填 `reason` |
| 引用被写错无法退回 | 回填报告含 `before`，`--restore <报告>` 一键还原（用例覆盖） |
| 新字段破坏旧数据读取 | 字段全部可选、不升 schema；`legacy-refs-compat.test.ts` 5 passed 锁定旧读法 |
| 卡级判断过松（不拒批） | 硬门仍在：每个 FR 必须有落点（覆盖门禁三入口同一道），用例专测 FR 无人接时整批不落 |

## 5. 复核与评审记录

- 每张卡四段子卡（研发 / 联调 / 复核 / 测试，无联调者跳过）逐段汇报，记录见 `docs/requirements/REQ-261002164800-d8f2/tasks/`。
- 复核段逐条对照 `design/` 三份契约（interfaces / data-model / architecture），偏离当场登记（见各卡复核段）。
- 两处自查自纠：t3 遗漏的输出 schema 声明（被 `output-contract` 门禁抓到，t5 内补齐）；
  t4/t6 夹具一度把 RTM 落盘写进真实仓库（已清理并把 `workspaceRoot` 指向临时目录）。
