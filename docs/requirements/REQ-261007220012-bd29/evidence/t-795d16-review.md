# S4 复核证据（t-795d16 · REQ-261007220012-bd29 FR-4）

日期：2026-10-07 · 阶段：复核（review）· 依据：`design/architecture.md` §接口契约：reqboard_task_amend

## 逐条核对（设计 → 实现）

| # | 设计条目 | 结论 | 依据 |
|---|----------|------|------|
| P-1 | 新壳 `src/tools/TaskAmendTool/`（4 文件） | 无偏离 | 四文件齐（TaskAmendTool / index / prompt / summary） |
| P-2 | 入参 `op` 必填，枚举 refs\|adopt\|chain | 无偏离 | 绑定层 `required:['op']`；`enum` 三值；壳层再兜一层 |
| P-3 | 其余入参为三原工具入参平移 | 无偏离 | `task_id/requirement_refs/reason/parent_id/stage_kind/force/requirement_id/dry_run` 原位 |
| P-4 | 三 op 复用三个用例、用例一行不改 | **有偏离（D-1，见下）** | 判定逻辑未动，但**错误消息字符串**改了（去掉旧工具名） |
| P-5 | 三 op 共用 `assertNoPendingConfirm` 前置 | 无偏离 | execute 首行调用，与三原壳一致 |
| P-6 | op 与必填项不匹配 → REQBOARD_INVALID_INPUT 点名必填集 | 无偏离 | task-amend-tool 三例断言消息含必填键名与必填集 |
| P-7 | 输出 = 三原工具键并集 + `op` 回显 | 无偏离 | schema 逐键列出（含 candidates 子对象）；回执实测带 op |
| P-8 | 渲染按 op 选对应 summary | 无偏离 | `taskAmendSummary` 分派；三段渲染逐字沿用原实现 |
| P-9 | 删三目录 + registry/index/StageActions/README/package.json 同步 | 无偏离 | 四处口径 21/21/21/21；旧名 src 零命中 |

## 偏离登记（不阻断）

- **D-1（消息面改名）**：设计写「用例一行不改」。实现中三个用例的**判定、拒绝条件、幂等、
  留痕格式全部未动**，但错误消息抬头从 `reqboard_task_refs/adopt/regenerate 未执行：…`
  改为 `reqboard_task_amend(op=…) 未执行：…`，卡片评论里的动作标注同步（`（reqboard_task_adopt）`
  → `（reqboard_task_amend op=adopt）`）。理由：FR-4 判据③要求 src 内旧工具名零命中，
  而 agent 可见的错误文案是主要残留面；消息是**给人/agent 读的路标**，改名属合并的必要面。
- **D-2（绑定层 + 壳层双保险）**：缺 `op` 由绑定层按 `required` 拒（INVALID_ARGS），
  壳层兜「未知 op」（REQBOARD_INVALID_INPUT）。设计只要求后者；多一层是防御，不是放宽。
- **D-3（长文本表条目合并）**：`LONG_TEXT_STYLE_ONLY_FIELDS` 里 adopt/regenerate 两条
  并为 `reqboard_task_amend` 一条（工具面合并的直接后果）；`arg-guidance` 用例随之去重。
- **D-4（旧计数守卫改口径）**：`readme-tool-face` 的「不残留旧计数」守卫原先含 `21 个`；
  本批 21 成为**当前正确计数**，故守卫保留 `13 个`，当前计数由派生断言（README 表头/行数/
  package.json 出现次数）背书。与 S2 的 D-2 同类（禁止把「历史值」与「当前值」混为一谈）。
- **D-5（无关 flaky 登记）**：全量跑中 `tests/reqboard/settings-init.test.ts` 单例失败
  （临时目录路径断言），隔离复跑 17 例全通过；与本卡零文件交集，判既存 flaky。

## 复核复跑

```
$ npx vitest run tests/task-amend-tool.test.ts tests/adopt-task.test.ts tests/regenerate-chain.test.ts \
      tests/reqboard/backfill-task-refs.test.ts tests/arg-guidance.test.ts tests/tools-schema.test.ts \
      tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts \
      tests/readme-tool-face.test.ts
→ 全绿
```

## 结论

**无阻断性偏离**；D-1 是合并的必要消息面改动（逻辑零改动），D-2~D-4 为可复核取舍，D-5 为既存 flaky。
