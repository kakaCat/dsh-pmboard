# 评审报告：reqboard 体检第三批工具面精简（REQ-261007220012-bd29）

> 评审方式：本窗口自评审（无第二人）。纪律：每条结论附可复核命令/读数；不利证据如实列出。
> 评审对象：requirement.md 七条 FR、design/ 五份文档、decomposition.md 七张卡、7 张父卡 27 张子卡的实施留痕。

## 评审范围 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

七张父卡（t1~t7）全部 done；t1~t6 各带「研发 + 联调 + 复核 + 测试」四段子卡链，
t7 为「研发 + 复核」两段（doc 类卡）。本报告按 FR 归并，逐条给出「现场 / 动作 / 反证 / 结论」。

## 逐条结论 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| FR | 现场（开工前） | 动作 | 反证（判据非空转） | 结论 |
|----|---------------|------|--------------------|------|
| FR-1 | `reqboard_task_execute` 占一个常驻 schema 槽位，与 `task_run` 同 factory 真委托 | 物理删除目录 + 18 处同步面（index/registry/render-summaries/StageActions/白名单/测试/README） | `grep -rl 三模式 src tests README.md`（除冻结夹具）零命中；DELEGATING_ALIASES 清零后 render 覆盖门禁仍绿 | 通过 |
| FR-2 | `reqboard_confirm_receipt` 单入参取件口 | 并入 `ask_confirm(ticket)`；三分派；全仓指路文案改口径 | TC-8 未知 ticket 抛 `REQBOARD_UNKNOWN_TICKET`；被中止挂起可凭 ticket 查；拦截面文案不含「重新发起」 | 通过 |
| FR-3 | 查询面四个（status/task_tree/run_status/task_status）字段级重叠 30~50% | run_status → `status.run` 节；task_status → `task_tree(task_id)`；删两目录 | 无 active run 时 `run.runId` **整键省略**且过自身 schema（2026-09-27 null 事故的直接回归）；互斥与 `not_found` 判别位保留 | 通过 |
| FR-4 | 三个同语义修缮工具（refs/adopt/regenerate）是 agent 选错面最大的一簇 | 三合一 `task_amend(op=…)`；用例判定零改动 | 新增壳层 6 例（必填集点名）+ adopt 10 例 + chain/refs 原用例全绿；旧三工具名 src 零命中 | 通过 |
| FR-5 | `AdvanceTool` 目录名与工具名 `reqboard_task_run` 不一致 | `git mv` 改名 + 工厂/常量/registry/index 同步 | 目录集合 == 登记面 == 注册名三处 21；错误码清单 6 条 site.file 随动刷新后三件套 36 例绿 | 通过 |
| FR-6 | handoff 与 open_window 的 mode 枚举、inheritance 子 schema 逐字重复两处 | 抽 `WINDOW_MODES` + `windowInheritanceSchema()` 到 shared.ts | 两处读数各为 1（定义）/ 2（引用）；open-window 与 inherit 用例全绿 | 通过 |
| FR-7 | README 表 27 行、package.json 描述 27；三处手写计数 | 五处口径收敛到 21；README 描述与新能力对齐 | 五处读数 21/21/21/21/1；`readme-tool-face` 派生校验绿；契约矩阵 9 files/150 tests | 通过 |

## 不利证据与残余风险（如实列出） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

1. **存量调用方硬断**：按旧名调用 7 个被删工具会得到宿主 unknown tool。
   本批已获用户明确授权（「不用的工具可以删除」，含跳过淘汰期），且 README/prompt/description
   均不再指引旧名——这是**有意行为变化**，不是回归。
2. **`target` 由 required 放宽为可选**（FR-2 的必要条件）：发起确认路径的校验改由用例承担，
   已有 `error-code-matrix` 与 ask-confirm 用例覆盖；但「绑定层不再拦缺 target」这一层确实变松了。
3. **全量套件仍有 38 个失败文件**：全部为既存红（其它在飞需求）与 2 例既存 flaky。
   本需求逐批差分新增红 0，但**「pnpm test 全绿」在共享工作树上不可达**——验收请以差分口径为准。
4. **`handoff.test.ts` 2 例红**为 S1 基线既有（`REQBOARD_DEPENDENCY_GATE`），与 FR-6 零交集；
   未在本批修复（属别的需求/别的病）。
5. **渲染收敛**（FR-2）：取回执模式与弹框模式共用 `askConfirmSummary`，不再有独立回执渲染；
   信息不丢（键集是子集），但图标语言从 🎫 统一为 🔔——这是有意的实现收敛，已在 S2 复核登记。

## 评审结论 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

七条 FR 判据全部达成，交付物与设计一致（5 条不阻断偏离均已在各卡复核证据中登记）；
工具面 27 → 21 的目标值达成，语义零损失。
**建议验收通过**；残余风险 1~5 均为已授权/已登记的取舍，不构成返工理由。

## 自查纠正（验收阶段发现，2026-10-07） <!-- serves: FR-2, FR-3, FR-4 -->

**被纠正的表述**：本报告与 `verification.md` 的交付结论曾写「六个被复用用例判定逻辑一行未改」。
按验收阶段的重跑 diff（`git diff --stat` + 逐行核对），准确口径是：

| 用例 | 实测 diff | 判定 |
|------|-----------|------|
| `ConfirmReceipt.ts` | 3 insertions / 3 deletions —— **全是错误消息字符串** | 判定逻辑零改动 ✓ |
| `QueryRunStatus.ts` | **无 diff** | 零改动 ✓ |
| `AmendTaskRefs.ts` | 6/6 —— 全是错误消息字符串 | 判定逻辑零改动 ✓ |
| `AdoptTask.ts` | 19/19 —— 全是错误消息字符串 + 卡片评论动作标注 | 判定逻辑零改动 ✓ |
| `RegenerateChain.ts` | 7/7 —— 全是错误消息字符串 | 判定逻辑零改动 ✓ |
| `TaskTree.ts` | **119 insertions / 2 deletions** —— 新增单卡展开分支（原单卡查询逻辑平移）+ 分派重载；2 处删除是文档行与旧签名行 | **有实质新增**：原有父子结构逻辑逐字保留（移入 `executeTree`），但本文件**不是**「一行未改」 |

**影响评估**：不影响 FR-3 的交付结论（单卡展开本来就是**新增**能力，设计 §接口契约明写
「task_status 并入 task_tree」；新增分支有 4 文件 20 例定向测试 + 6 例壳层契约覆盖），
但「语义零损失」的举证方式应表述为：**五个用例消息面/零改动 + TaskTree 新增分支、原逻辑保留**。
`tests/evidence.md` §E-4 的定向复跑读数即为该口径的证据。

