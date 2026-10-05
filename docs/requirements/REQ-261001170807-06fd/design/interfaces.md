---
req: REQ-261001170807-06fd
doc: interfaces
serves: FR-1, FR-2
---

# 接口契约（serves: FR-1, FR-2）

| 项 | 契约 | 兼容性 |
|---|---|---|
| `TaskWithHistory.parentId?: string` | 新增可选字段；缺省 = 非子卡，行为不变 | 向后兼容 |
| `findRecentAgentDoneTask(tasks, taskId, reqId, now, throttleMs)` | 返回形状不变（`{id,title}\|undefined`）；仅判据多一条排除 | 调用方无感 |
| `doneThrottleRemainingMs(...)` | 同口径（也被文案 "还需等待约 N 秒" 复用） | 无感 |
| `STAGE_ACCEPTANCE: Record<StageKind,string>` | 值域不变，**内容**改为含 `npx`/`pnpm`/`docs/` 锚点 | 只影响新落库子卡 |

**排除规则**：候选任务满足 `candidate.parentId === taskId` 时**不计入节流**。
兄弟卡（不同 parentId）与跨卡关闭**照旧计入**。
