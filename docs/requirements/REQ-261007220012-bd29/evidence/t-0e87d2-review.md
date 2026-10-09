# S1 复核证据（t-0e87d2 · REQ-261007220012-bd29 FR-1）

日期：2026-10-07 · 阶段：复核（review）· 依据：`design/architecture.md` §文件结构 + requirement.md §行为不变式

## 逐条核对（设计/需求 → 实现）

| # | 设计/需求条目 | 结论 | 依据 |
|---|---------------|------|------|
| P-1 | 删除 `src/tools/TaskExecuteTool/` 整目录 | 无偏离 | `git status` 显示 `D src/tools/TaskExecuteTool/TaskExecuteTool.ts`；目录已不存在 |
| P-2 | `src/index.ts` import + register 同步摘除 | 无偏离（并多摘 1 处） | register 26 次 == 登记面 26 条；另有 `src/tools/index.ts` 再导出与头注计数一并摘除（设计栏只点名 src/index.ts，属同面补全而非偏离） |
| P-3 | `registry.ts` 条目摘除 + 头注计数 | 无偏离 | `grep -c "toolName: 'reqboard_"` = 26；头注已改「26 条」 |
| P-4 | `render-summaries.ts` 别名摘要行摘除 | 无偏离 | `taskExecuteSummary` 导出与注释已删；`tests/render-summaries.test.ts` 同步删别名用例 |
| P-5 | `StageActions.ts` 条目摘除 | 无偏离 | 该文件 26 个工具名条目不重不漏 |
| P-6 | prompt 指路文案改写 | 无偏离 | AdvanceTool/prompt.ts 首句改为「旧的已弃用别名已删除」；**不改任何行为**（仅字符串） |
| P-7 | 用例层零改动（行为不变式） | 无偏离 | `git status src/application/use-cases` 本卡零改动；task_run 的 parameters/output/execute/timeoutMs 未动 |
| P-8 | 存量调用方硬断（设计已接受） | 无偏离 | 按旧名调用 → 宿主 unknown tool；README/prompt/description 均不再指引旧名 |

## 偏离登记（不阻断，逐条给理由）

- **D-1（有意提前）**：README/package.json 计数在**本卡**就 27 → 26，而拆分计划把计数定稿放在 t7。
  理由：`tests/readme-tool-face.test.ts` 是**派生校验**（README 表头/行数/计数三者必须等于登记面），
  不随本卡同步就必红——把已知红留在树上比提前改 3 行更糟。t7 仍负责把 26 → 21 终值定稿。
- **D-2（测试自身缺陷修正）**：`readme-tool-face.test.ts` 的「本文件不含字面量计数」自检用
  `self.includes(String(expectedCount))` 裸子串匹配——登记面变 26 后命中文件名里的 `REQ-261006201508`，
  且终值 21 会命中同文件旧计数守卫行 `13 个|21 个`（两处均假阳性）。
  改为匹配计数文案 `N 个` 并排除旧计数守卫行，**保留原意**（期望值必须派生，不得写死）。
- **D-3（冻结点豁免）**：`tests/fixtures/read-sites-v8-ledger.json` 含 1 处 `reqboard_task_execute`。
  该文件是带 `__provenance`（source/schemaVersion=8/revision/extractedAt）的**历史台账快照夹具**，
  不是活引用；改动它会伪造历史数据、破坏 read-sites-equivalence 的比对基线。**显式豁免，不改**。
  故 FR-1 判据的 grep 口径为「`src tests README.md` 内除该冻结夹具外零命中」。
- **D-4（范围补全）**：设计「调用方」列未点名的 3 处同步面被 grep 找出并摘除——
  `tests/tools-dispatch.test.ts`（THREE_PIECE_DEBT 留债表）、`tests/tools-schema.test.ts`（FACTORIES 名单与条数）、
  `src/domain/task/TaskStatus.ts`（注释里的死目录名）。属同面补全，不计为设计偏离。

## 复核复跑

```
$ npx vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts \
      tests/tools-render-coverage.test.ts tests/task-run-contract.test.ts \
      tests/tools-schema.test.ts tests/readme-tool-face.test.ts
→ 6 files passed / 75 tests passed，exit 0
```

## 结论

**无阻断性偏离、无需返工**；D-1~D-4 均为已登记的有意取舍或同面补全，且各有可复核依据。
