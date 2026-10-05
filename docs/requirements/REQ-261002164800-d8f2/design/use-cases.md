---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 用例：谁在什么场景下怎么走 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 五条主旅程 + 一组异常路径。每条都写"人看到什么"，不只写系统做什么。

## UC-1 计划获批即落库（会话弹框） serves: FR-1, FR-2

- **谁**：人（在弹框里点"确认，推进"）。
- **前**：需求在 decomposing，计划已提交（任务表带 `requirement_refs` 或文档覆盖表已写）。
- **走**：
  1. 人点确认 → 系统落章 decomposition 产物；
  2. 系统调 `landApprovedPlan(source='confirm')`：取 refs（显式 → 文档）→ 门禁（FR 覆盖）→ 建卡；
  3. 落库成功 → 推进到 implementing，`autoRun=true`，返回体带 `created_count` / `unrefed` / `warning`。
- **看到**：看板 DAG 出现全部卡片；RTM `serves` 与卡一致；无落点卡出现在警告里。
- **边界**：计划里有一张无 FR 的文档卡 → **照样落库**，只在 `unrefed` 点名（这是 277d 的病根）。

## UC-2 看板「批准计划」 serves: FR-1, FR-6

- **谁**：人在看板点按钮。
- **走**：`POST req/plan/approve` → 盖 `approvedAt` → **同一个** `landApprovedPlan(source='board')` → 推进 implementing。
- **看到**：与 UC-1 完全一致的结果（卡集合、refs、状态），返回体附 `landed` / `unrefed`。
- **边界**：重复点批准 → `alreadyLanded>0`，不造新卡、状态幂等；文案不再出现"与另一通道等价"这类失真表述。

## UC-3 手动补落库 serves: FR-3

- **谁**：窗口 agent（批准时自动落库失败的恢复路径）。
- **走**：`reqboard_decompose(requirement_id=…)` → 走同一取数（含文档兜底）与同一门禁。
- **看到**：卡的 refs 与 UC-1 落出的一致；返回体 `sources` 说明每条 refs 来自显式还是文档。
- **边界**：已有未取消任务 → 幂等跳过并如实说明（不再靠"撞守卫报错"表达）。

## UC-4 修一张已落库的卡 serves: FR-4

- **谁**：窗口 agent 或人（发现某卡 refs 为空/写错）。
- **走**：
  1. `reqboard_task_refs(task_id, requirement_refs, reason)`（或看板 `task/update` 带 `requirementRefs`+`reason`）；
  2. 系统全量替换该字段（经 `TaskStore`）→ 同步 `rtm-implementing/<id>.yml` → 写留痕。
- **看到**：卡上 refs 更新、RTM 同步、需求评论出现一条带 `reason` 的记录。
- **边界**：同值重复调用 → `changed:false` 且不写盘；卡属别的需求 → 拒绝。

## UC-5 存量回填 serves: FR-5

- **谁**：维护者（一次性）。
- **走**：`--dry-run` 看候选 → `--apply` 写回 → `--check` 复核；需要时 `--restore <report>` 还原。
- **看到**：逐需求报告（候选/无来源/跳过/实际写入）；`--check` 输出 `empty_with_doc_coverage: 0`。
- **边界**：归档需求只报告；已有非空 refs 不覆写；子卡随父卡（`skipped` 里说明）。

## UC-6 异常路径 serves: FR-6

| 场景 | 系统行为 | 人看到 |
|---|---|---|
| 计划未获批就调 `reqboard_decompose` | 拒（`REQBOARD_PLAN_NOT_APPROVED`） | 错误里给出"先提交计划并请人批准"的可执行下一步 |
| FR 无人接收（覆盖缺口） | 拒（`requirement_uncovered`，既有硬门，三入口一致） | 点名缺口 FR + 两条真实可用的恢复动作 |
| 卡无 FR 落点 | **不拒**，落库 + 警告 | 返回体 `unrefed` + 需求评论警告 |
| 落库成功但收尾失败 | 照常推进 + 留痕 | 评论写明"已落库 n 张，收尾报错：…" |
| 落库整体失败 | 不推进 + `advance.pausedReason` + 告警 | 看板可见失败原因与恢复入口 |
