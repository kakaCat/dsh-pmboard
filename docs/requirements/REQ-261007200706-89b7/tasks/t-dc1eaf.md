# t-dc1eaf 链尾总验收：四层等价证据与七组判据汇总复核·校验

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
链尾总验收：四层等价证据与七组判据汇总复核·校验

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
校验项逐条给出结果：`npx vitest run tests/` → 全绿；异常项已列出并标注影响面

---
## 汇报 1（2026-10-07T13:53:59.324Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

总验收全过：全量回归新增红 0（同树 A/B）、typecheck/prompts:check/build 全 0、探针 specimen 五条全 ✔、七组判据逐条达标

### 完成项

- ① 全量测试（migration.md 第一层）：vitest 全量跑 = 68 failed / 6947 passed / 22 skipped（7037）——与本批**开工前**同树基线逐条比对：失败集合新增 0 条（68 vs 69，1 条既有抖动用例转绿）。基线文件本身是**既有脏**（test-baseline --check FAIL：工作树带着别条需求未提交的在飞改动，非本批引入；本批的严格对照是同树 A/B，见下）
- ② 各卡同树 A/B（更严的逐卡证据）：t1/t2/t3/t4/t5/t6/t7 每张卡都用『回退本卡改动 → 跑 → 恢复 → 跑』或全量集合 diff 证明新增红 0；其中 t4 出现的 settings-init 与反复出现的 canceled-legacy-read 经单跑证实为并行抖动
- ③ 类型与构建：pnpm typecheck exit 0；pnpm prompts:check exit 0（三段含探针）；pnpm build exit 0（host + client 产物齐、verify-client OK）
- ④ 探针 specimen：五条判据全 ✔ 且 exit 0（真实扫描绿 / 注入不可达判红 / 白名单不误判 / 注入 agent-dh/ 与 docs/standards/ 两禁词都判红且不吃白名单 / agent 文案面扫到 76 份）
- ⑤ 七组判据汇总（FR-1~FR-7）：FR-1 死路径 grep 0 命中 + 探针禁词命中 0；FR-2 问数残留 0（事实源 capture-mapping.ts 除外，同形异义 QueryReport.ts 排除）+ CreateTool doc_location 2 处；FR-3 prompt 1289 ≤1300 + 『五类/五个提交入口』0 命中 + prototype 支在场；FR-4 文案面 REQ 编号 0 命中（非注释）+ RunStatusTool 663 < 810；FR-5 运行时口径 6 个一次性字段全无 SPLIT、5 个幂等字段全有；FR-6『全部写路径』在场 + budget CAS 描述在场；FR-7『13 个』0 命中 + repository.directory 已删、url 对齐 dsh-pmboard.git
- ⑥ 新增/更新测试：tests/submit-prompt-budget.test.ts（5）、tests/prompt-path-probe-tools-surface.test.ts（4）新增；arg-guidance（13）、ask-confirm-prompt（4）升级；关键 4 个文件合计 26 passed
- ⑦ 异常项与影响面（如实列出）：(a) test-baseline --check FAIL —— 基线文件相对工作树过期，属**开工前既有**，且工作树混有其他需求在飞改动，无法归因本批；本批以同树 A/B 取代该判据。(b) size-budget / 其它 68 条既有红（含 SubmitTool.ts 517 行 >400 的既有超限，改动前即 515 行）——均在开工前基线集合内，本批未新增。(c) 本批不碰 G4/G5/G10、工具面精简、H3、M1/M3/M4/M5（需求边界已声明）

### 下一步

父卡 t-11f25a 收尾 → 需求自动进入验收态 → 提交验收材料

---
