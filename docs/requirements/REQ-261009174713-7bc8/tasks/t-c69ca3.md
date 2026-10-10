# t-c69ca3 core 包落位与 import 重写·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
core 包落位与 import 重写·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-09T12:16:16.540Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

第一块（domain 整树搬进 core）完成并自验通过：50 文件 git mv + 584 处说明符重写 + 20 余处「判据跟着代码走」的测试收口；typecheck 0、分层门禁 0、全量失败集不新增。

### 完成项

- git mv src/domain → packages/pmboard-core/src/domain（50 文件，保留 git 历史）
- codemod 重写说明符：domain 引用 565 处（含 ./domain/… 形态）+ core 内改指 protocol-domain 8 处；残留 0
- 意外收获：t5 留下的 16 条「core 指向根 src/domain」临时逃逸边一并收口（现在都是包内相对路径）
- 判据跟着代码走（20 余文件）：字符串路径改写（fixtures 与 tests 与 scripts）、错误码清单重生成、prompt 面落点（片段与生成链与探针）、dive 扫描面扩到 core、错误码扫描器 isPromptFile 口径
- 踩到并修掉的三类坑：①测试里的**合成数据/期望字符串**不该改（plan-footprint 与 write-set 与 prompts-panel 与 execute-task，共 4 文件）；②双重前缀（dsh-pmboard/packages/pmboard-core/…）；③ledger 样本 fixture 里的路径是**记录数据**，改了就是篡改历史（已还原 2 份）
- 读数：typecheck 0、分层门禁 exit 0、全量 7250 例失败 18/失败文件 12（搬迁前 19/13，无新增失败）
- 剩余块（本卡未完成）：application 与 repositories 与 stage-overview 与 plugin-config 与 dive-core 三件套（dive 驱动面 9 文件留给 t13）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/domain`
- `.worktrees/req-261009174713-7bc8/tests/dive-convergence.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/helpers/error-code-scan.ts`
- `.worktrees/req-261009174713-7bc8/tests/template-clause-gate.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/accept-result-question-wording.test.ts`
- `.worktrees/req-261009174713-7bc8/scripts/inline-prompt-fragments.mjs`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/error-code-inventory.json`
- `.worktrees/req-261009174713-7bc8/package.json`

### 下一步

第二块：application（扣 dive 驱动面 9）与 repositories 与 stage-overview 与 plugin-config 搬入 core，round-state/applyDiveTransition/stage-configs 归 dive-core/；codemod 可复用 /tmp/codemod-core-domain.mjs 的形状（改映射表）。

---
## 汇报 2（2026-10-09T12:58:14.186Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

第二块（application/repositories/stage-overview/plugin-config 搬入 core + dive 三件套改名进 dive-core）已落地：typecheck 0、分层门禁 0、t14 判据 0；但 13 个测试文件的判据收口未完成，本步**未绿**，不得收口或合并。

### 完成项

- 搬迁：core/application 191（含 dive-core 3）· core/repositories 20 · core/stage-overview 1 · core/plugin-config.ts；根包 src/application/dive 保留 9 个驱动文件（留给 t13）
- client/types.ts 落 core（它的 ArtifactKind 与 StageArtifact 等依赖在协议域关联半，放 common 会成环）——顺带消掉 5 处 core→根包倒挂
- 依赖倒置（t14 提前）：QueryRunStatus 不再 import 根包 adapters/DshJobsAdapter、不再摸 globalThis，只认注入的 dshJobsAdapter；判据 grep 已归零
- 解析式 codemod：1843 处说明符 / 717 文件（含 dive 三件套改名后的相对路径）
- 字符串路径收口：85 处 src 相对写法（tests 与 src/tools/registry.ts 的 responseSources）+ 引用型 fixture 34 处 + 错误码清单重生成
- 读数：typecheck 0、分层门禁 exit 0、dive 驱动文件 9 个仍在根包、t14 判据 0
- **未绿**：全量 7250 例失败 37 / 失败文件 25（本步前 18/12）→ 约 13 个文件的判据收口待做：difficulty-inference 与 dive-convergence 与 execution-token-guard 与 injection-difficulty 与 kb-generate 与 live-tasks 与 prompt-path-probe-tools-surface 与 reqboard/degraded-startup 与 requirement-transition-guard 与 t11-decompose-queue-write 与 volatile-notice 等
- 关键坑：`git status -M` 的 rename 对**不可全信**——它把留在根包的 9 个驱动文件也配成了搬迁对，导致 4 处错指（靠 tsc 抓出并已修回）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/application`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/repositories`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/client-types.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/application/use-cases/QueryRunStatus.ts`
- `.worktrees/req-261009174713-7bc8/src/tools/registry.ts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/canceled-literal-baseline.json`

### 下一步

第三块前必须先收掉 13 个红文件（判据跟着代码走的同一套手法：src 相对 join、数据字符串、驱动面说明符、引用型 fixture）；收完再跑全量确认回到 18/12 以下，然后才做 bits barrel 的处置。

---
## 汇报 3（2026-10-09T13:03:11.183Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

第二块收口完成并跑绿：13 个红文件全部按「判据跟着代码走」收掉；typecheck 0、分层门禁 exit 0、全量 7250 例失败 18/失败文件 12 —— 与第一块后逐文件一致，新增失败 0。

### 完成项

- 收口 13 个文件，回归口径：失败 37→18、失败文件 25→12（与搬迁前逐文件一致）
- 修掉的错类：①留在根包的 9 个驱动文件被错指到 core（含 fixture 条目）；②content-type 这类非路径数据被误伤（application/json 18 处）；③仓库相对写法漏网（src/application 无尾斜杠的基常量）
- 扫描面跟包走：execution-token-guard 与 requirement-transition-guard 的扫描根补 core、kb-generate 的符号扫描面补 core、dive-convergence 的迁移模块过滤前缀改仓库相对
- 探针与判据：prompt-path-probe 的 round-state 指向 dive-core（不是 dive，改名搬迁）；difficulty-inference 的输入样例还原为 src 相对形态（它是数据不是引用）
- 读数：typecheck 0、分层门禁 exit 0、t14 判据 0、全量 7250 例失败 18/失败文件 12（新增失败 0）
- 本块净成果：core 收纳 application 191 与 repositories 20 与 stage-overview 1 与 plugin-config.ts 与 client-types.ts；根包只剩 9 个驱动文件与 client 与 tools 与 http 与 adapters 与 wiring

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/execution-token-guard.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/requirement-transition-guard.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/kb-generate.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/dive-convergence.test.ts`
- `.worktrees/req-261009174713-7bc8/scripts/prompt-path-probe.mts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/canceled-literal-baseline.json`

### 下一步

第三块（最后一块）：处置 src/shared/{protocol,board-summary}.ts 两条薄 barrel——core 已持有两半，根包若不再需要就直接删并改指 core；做完再跑全量确认仍为 18/12，然后本卡可以进复核。

---
## 汇报 4（2026-10-09T13:19:27.017Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

第三块完成，t12 全部三块跑绿：删掉 src/shared 两条 barrel、382 处说明符改指 core、src/shared 归零；typecheck 0、分层门禁 0、全量失败 18/12（与开工前逐文件一致）。

### 完成项

- barrel 处置：382 处说明符由 shared/protocol 与 shared/board-summary 改指 pmboard-core/protocol-domain 与 board-summary-domain；两条 barrel 删除（git rm），src/shared 目录归零
- 随之修掉路径字符串与夹具：drill 矩阵的 target 与 12 处测试里的文件路径、handoff 夹具的临时工作区路径（mkdir 与 write 必须同址）
- 结构收口读数：src 顶层只剩 adapters 与 application（仅 9 个驱动）与 client 与 http 与 tools 与 wiring 与 __integration_test__ 与两个根 ts 文件
- 三段合计：说明符重写 1843+382 处；core 收纳 domain 50 与 application 191 与 repositories 20 与 stage-overview 1 与 client-types 1 与 plugin-config 1
- 读数：typecheck 0、分层门禁 exit 0、t14 判据 0、全量 7250 例失败 18/失败文件 12（新增失败 0）
- 卡面验收里「npx vitest run packages/pmboard-core/tests 全绿」此刻不可满足：core 的测试还在根包 tests/ 下，测试随包迁移是 t20（t-7358fc）的活——这一步不可当成本卡缺项

### 改动文件

- `.worktrees/req-261009174713-7bc8/src/shared/protocol.ts`
- `.worktrees/req-261009174713-7bc8/src/shared/board-summary.ts`
- `.worktrees/req-261009174713-7bc8/scripts/reverse-drill-matrix.mts`
- `.worktrees/req-261009174713-7bc8/tests/handoff.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/canceled-reverse-drill-coverage.test.ts`

### 下一步

交复核子卡 t-4e36c3：独立复跑三块判据并核对与设计的分层表是否一致（core 只依赖 common 与 rtm 与 type-kit）。

---
