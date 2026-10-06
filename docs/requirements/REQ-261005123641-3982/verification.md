# REQ-261005123641-3982 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：写盘根守卫不再读进程共享单例的当前根，改为**按需求 id 取记录、以记录声明的 workspaceRoot 为唯一权威**；写前把共享仓储校正到声明根，只有「声明根不可用」或「校正失效」才拒绝；立项两条路径（capture / create）的守卫前置到**建档之前**——「记录已建却报立项失败」的半截失败从判定层面消失。
实测：并发用例 6 条全绿，同一批用例在旧实现下 4 条会红（判别力自证）；全量失败数 68 ≤ 基线 69，且「只因本次改动变红」的集合为空；tsc 1 = 基线 1；pnpm build 退出码 0，dist 命中新错误码与新文案。
契约变更记①（已获你在对话中裁决）：非绝对声明根由「拒绝」改为「不判」——内存仓储把根报成「.」是合法用法，相对根在生产路径不出现；该变更写进 design/interfaces.md 判定顺序表与变更记。
未做项如实报两项：跨工作区两窗口的**现场复演**只做到单元级等价覆盖（需另一项目窗口配合）；**知识层产物未重生成**（避免把并发窗口在建源码一并固化，建议树稳定后统一跑 kb:build）。

## 1. 验收列表

### v1-1 · 守卫改为按需求记录声明根判定，并在写前校正共享仓储根

**验收内容**：【守卫改为按需求记录声明根判定，并在写前校正共享仓储根】验收

**操作步骤**：
1. 1) npx vitest run tests/project-scope.test.ts -t "守卫" → 414/430/443/448 四条未修改即全绿
2. 2) npx tsc --noEmit → 错误数 ≤ 基线
3. 3) grep -n "export function ensureWritableProjectRoot" -A 6 src/application/internal/support.ts → 可见第 3 参 caller?
4. 4) 12 处守卫调用点数量与基线一致（本卡不动调用点）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）

**验收状态**：✓ 通过

---

### v1-2 · 立项两条路径（capture / create）守卫前置到建档之前

**验收内容**：【立项两条路径（capture / create）守卫前置到建档之前】验收

**操作步骤**：
1. 1) grep -c "ensureWritableProjectRoot" src/application/use-cases/CaptureRequirement.ts → ≥2（前置 + 护栏）
2. 2) grep -n "ensureWritableProjectRoot" src/application/use-cases/CreateRequirement.ts → 行号小于 createRequirementDirect 调用行
3. 3) npx vitest run tests/project-scope.test.ts tests/application → 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）

**验收状态**：✓ 通过

---

### v1-3 · 并发窗口回归 + 真错配/声明根不可用用例（含重写失效用例）

**验收内容**：【并发窗口回归 + 真错配/声明根不可用用例（含重写失效用例）】验收

**操作步骤**：
1. 1) npx vitest run tests/project-root-concurrency.test.ts tests/project-scope.test.ts → 全绿
2. 2) npx vitest run tests/project-scope.test.ts -t "写盘覆盖" → 绿（三份清单零改动）
3. 3) git diff --stat tests/project-scope.test.ts → 仅 1 个用例块变动
4. 4) pnpm test → 失败数 ≤ 开工前基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）

**验收状态**：✓ 通过

---

### v1-4 · 写侧口径落文档：记录声明根为唯一权威、共享单例仅缓存

**验收内容**：【写侧口径落文档：记录声明根为唯一权威、共享单例仅缓存】验收

**操作步骤**：
1. 1) grep -n "唯一权威\|仅作缓存\|按需求 id" docs/architecture/gate-read-root.md → 命中
2. 2) grep -n "gate-read-root" docs/architecture/project-manual.md → 命中
3. 3) pnpm kb:probe → 无死链
4. 4) pnpm kb:check → 退出码 = 开工前基线（未新增漂移）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/project-root-concurrency.test.ts → 6 passed（TC-1 并发互踩不误拒 / TC-2 记录是权威 / TC-3 声明根不可用 / TC-4 相对根不判 / TC-5 存量回落 / TC-6 校正失效最后防线）
- npx vitest run tests/project-scope.test.ts → 守卫 5 条全绿（含重写后的旧契约用例）；唯一红为 HEAD 既存的 t8 写盘覆盖（EnsureKnowledgeLayer.ts:169），与本需求无关
- 判别力自证（隔离副本 + HEAD 旧守卫）：tests/project-root-concurrency.test.ts → 4 failed / 2 passed；重写用例 -t 声明根是权威 → 1 failed（修复后全绿）
- pnpm test → 68 failed / 5061 passed / 20 skipped（37 红文件）；去掉本需求改动的隔离副本 → 69 failed / 5054 passed（38 红文件）→ 68 ≤ 69
- 失败文件集 diff：只有现在红的集合为空；只有基线红的集合恰为复核阶段复制进副本的新用例文件（旧实现下本就该红）
- npx tsc --noEmit → 1 error = 基线 1（tests/receive-mark.test.ts 的 readonly sort，HEAD 即存在）
- pnpm build → 退出码 0；[verify-client] OK bundle=586829 bytes 关键符号齐全；dist/index.mjs 命中 REQBOARD_PROJECT_ROOT_MISMATCH×2 · REQBOARD_INVALID_WORKSPACE×7 · 新文案「记录声明的项目根不可用」×1（WriteRootCaller×0 = TS 接口编译期擦除，非失败）
- 代码锚点：src/application/internal/support.ts:343 起 ensureWritableProjectRoot（探针 → 非绝对不判 → 存在性校验 → applyWorkspaceRoot 校正 → 复核）；:403 assertWritableRequirementProject 同口径复用
- 守卫先于副作用：src/application/use-cases/CaptureRequirement.ts:280 守卫 < :283 建档 < :297 推进（:308 护栏）；src/application/use-cases/CreateRequirement.ts:54 守卫 < :55 建档
- 回归用例：tests/project-root-concurrency.test.ts 新增；tests/project-scope.test.ts 仅一个用例块变动（git diff 11 insertions / 13 deletions），414/430/443/448 与 t8 三份清单逐字未动
- 设计变更记①：docs/requirements/REQ-261005123641-3982/design/interfaces.md 判定顺序表 2a/2b 行 + 变更记（裁决人 / 日期 / 理由 / 影响面）
- 口径文档：docs/architecture/gate-read-root.md 新增「写入侧的根解析（现行）」节，旧节标注「已于 2026-10-05 被推翻」；docs/architecture/project-manual.md:15 挂接该页
- 评审报告：docs/requirements/REQ-261005123641-3982/reviews/implementation-review.md（8 条评审要点 + 处理过的问题 + 三条遗留观察）
- 测试证据：docs/requirements/REQ-261005123641-3982/tests/test-evidence.md（TC-1..TC-10 逐条带 covers/validates 标注 + 基线量法 + 判别力自证 + 构建核对 + 未做项）
- 原始事故证据（本次立项现场）：~/.dsh/reqboard/requirements/REQ-261005122915-9f90/history.jsonl（draft @1791174555304、brainstorming @1791174555326 已落，而该次 capture 回执是 Error）；窗口 session-2b5a64a9 的 tool 回执 @1791174555337 含两个绝对路径
- 第二现场（批准即落库）：窗口 session-4d4d23e8 批准回执 @1791174695611「已落章 + 自动拆分/开跑失败（同错配）」→ 计划已批准、任务卡未落库
- 未做的现场复演（如实报）：跨工作区两窗口的实时复演需另一项目窗口配合，本次只做到单元级等价覆盖（TC-1 显式模拟该步）
- 未做的知识层重生成（如实报）：pnpm kb:check 漂移仍为同一 2 处（code-map.md / code-map.symbols.tsv，含他需求在建改动），未跑 kb:build
- pnpm kb:probe → 4 项失败全部为 scripts/ 未归类（他需求新增脚本），本需求零新增脚本

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 守卫改为按需求记录声明根判定，并在写前校正共享仓储根 | ✓ 通过 | human/session-fe2396d0-cd4e-4724-89fd-16e436222a2f | 2026-10-05 13:47 |
| v1-2 | 立项两条路径（capture / create）守卫前置到建档之前 | ✓ 通过 | human/session-fe2396d0-cd4e-4724-89fd-16e436222a2f | 2026-10-05 13:47 |
| v1-3 | 并发窗口回归 + 真错配/声明根不可用用例（含重写失效用例） | ✓ 通过 | human/session-fe2396d0-cd4e-4724-89fd-16e436222a2f | 2026-10-05 13:47 |
| v1-4 | 写侧口径落文档：记录声明根为唯一权威、共享单例仅缓存 | ✓ 通过 | human/session-fe2396d0-cd4e-4724-89fd-16e436222a2f | 2026-10-05 13:47 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-fe2396d0-cd4e-4724-89fd-16e436222a2f | 2026-10-05 13:47 |
| v1-6 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-fe2396d0-cd4e-4724-89fd-16e436222a2f | 2026-10-05 13:47 |
