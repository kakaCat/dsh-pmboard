# REQ-261005143615-5ab1 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：详情页判「文档在不在」改按需求自己声明的工作区，命中哪个根就用哪个根的绝对路径；判不了时新增「未判定」态（不划线），文件真不在时才说缺失并划线。现场问题已修：归档需求 REQ-261005123641-3982 不带会话时 file-missing 从 25 降到 0，25/25 行绝对路径与磁盘逐条一致（0 分歧）；真丢文件的需求仍 37/37 缺失；读根全不可用时 25 行全部未判定且无绝对路径。台账零迁移，两口缺省即回旧行为（回滚=不注入两口）。门禁：tsc 0 错误、build 与 build:client 退出码 0、相关用例 67 例全绿、全量失败 68 ≤ 基线 80。改动面 6 个源文件 + 4 份测试 + 验收三件；23 张任务卡在测试文档里逐张 covers。已知边界：运行中的 GUI 需重启才生效。

## 1. 验收列表

### v1-1 · 定契约：未判定态与 absPath 加性字段 + 多根读取口

**验收内容**：【定契约：未判定态与 absPath 加性字段 + 多根读取口】验收

**操作步骤**：
1. npx vitest run tests/query-docs-contract.test.ts 全绿
2. pnpm typecheck 退出码 0 且错误数不高于基线 223
3. 既有 tests/query-docs*.test.ts 仍全绿（加性未破坏旧形状）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

### v1-2 · 服务端按需求自身工作区判存在，并给出绝对路径

**验收内容**：【服务端按需求自身工作区判存在，并给出绝对路径】验收

**操作步骤**：
1. npx vitest run tests/query-docs-roots.test.ts 全绿，四个用例分别钉住：TC-1 需求根命中（absPath 以需求根开头且 file-missing 计数 0）、TC-2 需求根缺、会话根命中（absPath 以会话根开头）、TC-3 根可用而文件不在→file-missing、TC-4 根全不可用→全 unknown 且无 absPath 键。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

### v1-3 · 详情页路径格显示绝对路径，未判定不划线

**验收内容**：【详情页路径格显示绝对路径，未判定不划线】验收

**操作步骤**：
1. npx vitest run tests/docs-panel-states.test.ts 全绿：unknown 行 HTML 不含 line-through 与 dsh-pm-doc-missing，file-missing 行仍含两者，有 absPath 的行 data-open-doc 等于该绝对路径
2. pnpm build:client 输出 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

### v1-4 · 兼容与回滚：两口缺省即回旧行为

**验收内容**：【兼容与回滚：两口缺省即回旧行为】验收

**操作步骤**：
1. npx vitest run tests/query-docs-compat.test.ts 全绿，且既有 tests/query-docs*.test.ts 集合全绿（零回归）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

### v1-5 · 真机对账与全量门禁回归

**验收内容**：【真机对账与全量门禁回归】验收

**操作步骤**：
1. 跑 `npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts`，四条输出逐条比对：① 段①（REQ-261005123641-3982，不带会话）打印 `file-missing 计数 = 0`
2. ② 段② 打印 `分歧 = 0` 且 `带 absPath 的行 = 25 / 25`
3. ③ 段③（REQ-260930094139-2d65）state 分布为 `{"file-missing":37}`
4. ④ 段④（强制候选根为空）state 分布为 `{"unknown":25}` 且 `带 absPath 的行 = 0`。门禁四条：`npx tsc --noEmit` 输出 0 个 `error TS`（退出码 0）
5. `pnpm build` 退出码 0 且 `grep -c docRootsOf dist/index.mjs` ≥ 1
6. `pnpm build:client` 输出含 `[verify-client] OK`
7. `pnpm test` 的 `Tests <N> failed` 中 N ≤ 80（基线 = `/private/tmp/req-baseline` worktree 660973e 的 80 failed）。原始输出贴进 docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts → ① REQ-261005123641-3982 不带会话：25 份文档 {"confirmed":9,"pending":16}，file-missing = 0（改前 25）
- 同上 ② 候选根含会话根：带 absPath 25/25，state 与 os.path.exists 逐条比对分歧 = 0
- 同上 ③ REQ-260930094139-2d65（文件真丢）：{"file-missing":37}，未被 unknown 掩盖
- 同上 ④ 强制候选根为空：{"unknown":25}，带 absPath 的行 = 0
- npx vitest run tests/query-docs-contract.test.ts tests/query-docs-roots.test.ts tests/query-docs-compat.test.ts tests/query-docs.test.ts tests/docs-panel.test.ts tests/docs-panel-states.test.ts → 6 files / 67 passed
- npx tsc --noEmit → 0 error（HEAD worktree 660973e 基线同为 0）
- pnpm build → 退出码 0；grep -c docRootsOf dist/index.mjs = 7、docsAt = 6
- pnpm build:client → [verify-client] OK bundle=591550 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- pnpm test → 68 failed / 5375 passed；基线 worktree 660973e → 80 failed / 4541 passed（失败集合逐文件比对见证据附录）
- docs/requirements/REQ-261005143615-5ab1/tests/test-evidence.md（逐条 covers：T1…T5、E1…E4、G1…G4，含 23 张任务卡的 covers 标注与未覆盖缺口）
- docs/requirements/REQ-261005143615-5ab1/reviews/self-review.md（自评审：逐条对照设计 + 自挑四处问题）
- docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md（对账脚本、四组原始输出、门禁输出、差异他因）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定契约：未判定态与 absPath 加性字段 + 多根读取口 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
| v1-2 | 服务端按需求自身工作区判存在，并给出绝对路径 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
| v1-3 | 详情页路径格显示绝对路径，未判定不划线 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
| v1-4 | 兼容与回滚：两口缺省即回旧行为 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
| v1-5 | 真机对账与全量门禁回归 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2 | 2026-10-05 14:58 |
