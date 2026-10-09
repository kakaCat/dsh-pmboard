---
requirement_id: REQ-261008011118-defe
title: "第五批中危 bug 修复 · 复盘"
status: archived
owner: "session-9574f815"
category: bug
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5]
---

# 复盘（REQ-261008011118-defe）

> 目标：体检报告 §2.2 剩余四条中危项各自在**一个收敛点**上收口，各带先红→后绿读数、各自独立可回滚。
> 结论：**四条全部交付**，验收单 7/7 通过（5 张卡 + 需求级 + 孤儿用例告警项），需求已归档。

## 一、交付结果（可复核读数） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

| 条款 | 收敛点 | 先红 → 后绿 | 邻域回归 |
|---|---|---|---|
| BUG-1 删 run 进度死字段 | `QueryRunStatus`（runId 直读台账）+ 删 2 个死文件 | `2 failed | 5 passed → 7 passed` | 19 文件 / 227 用例 |
| BUG-2 批内非子卡 done 上限 N=3 | `MoveTask.gateOne`（`MOVE_BATCH_DONE_MAX`） | `2 failed | 9 passed → 11 passed` | 10 文件 / 147 用例 |
| BUG-3 回退两段写补偿 + 事件/version | `internal/rollback-compensation.ts`（新增单点） | `5 failed | 38 passed → 全绿` | 8 文件 / 160 用例 |
| BUG-4 子卡先认领后执行 | `ExecuteTask.claimSubtask` + `releaseFailedClaim` | `4 failed | 33 passed → 全绿` | 16 文件 / 142 用例 |
| BUG-5 契约/基线齐步 | 知识层重生成 + 错误码清单 + 文案核对 | — | 契约与提示词 7 文件 / 73 用例 |

- 四卡验收命令同批复跑：**13 文件 / 190 用例全绿**；`npx tsc --noEmit` → exit 0。
- 全量集合差：本次失败 23 条 · 基线 68 条；**新增 7 / 不再失败 52**（新增 7 条为 `tests/kb-ensure.test.ts`
  的顺序相关用例，与本需求零交集，未代刷基线；不再失败里含本需求带掉的 `tests/failure-handling.test.ts`）。
- 阶段遥测（本窗口交付节奏）：repro 4 次 / fix 4 次 / review 5 次 / regress 4 次 / test 1 次 / dev 1 次；
  fix 段累计 343s、regress 段 169s、test 段 356s。

## 二、做对的地方（值得复用） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

1. **先红后绿用"临时还原 HEAD"取红**：BUG-3/BUG-4 的实现与用例同批完成，故把生产文件 `cp` 备份 →
   `git checkout --` 还原到 HEAD → 跑新增断言取红 → `cp` 回备份（恢复后 `git diff --stat` 逐字一致）。
   这条做法让"先红"在今天的工作方式下依然可核，且不动工作树里别窗的在飞改动（比 `git stash` 安全）。
2. **夹具自种自读的识别**：BUG-1 能长期躲过测试，是因为测试自己把 `stepIndex` 种进 `advance` 再读回来；
   修法是把断言落在**字段集**上（种了也必须不出现）。同类发现还有 `query-run-status` 与 `migration-v8`
   两个文件——设计外但同源，一并清掉，避免"死字段的假绿"。
3. **每条修复都带"不改的东西"清单**：`DoneEvidenceSpec` 判据、I-11 写序、撤销半边、凭证门基准、
   孤儿阈值——写进设计并逐条复核，四条才敢说"独立可回滚"。
4. **接上既有单点而不是新造**：BUG-4 的归还复用 `failure-handling.rollbackSubtask`（顺带消掉前批点名的
   另案：ExecuteTask 的内联第二实现）；BUG-3 的补偿抽成 `internal/rollback-compensation.ts` 单点。

## 三、代价与教训 <!-- serves: BUG-3, BUG-4, BUG-5 -->

1. **抽件的触发来自两条契约门**：BUG-3 第一版把补偿写在 `MoveRequirement.ts` 内，立刻吃到两处红——
   `output-contract` 的静态扫描把补偿 helper 的**内部 return 字面量**（`{ok, detail}`）当成响应字段；
   该文件同时涨到 408 行 > 尺寸门禁 400。处置 = 抽成独立内部模块：两处红同时消失
   （357 行 / 扫描器干净）。**教训**：在"响应源文件"里写内部形状函数会撞静态扫描；
   尺寸门禁也会在同一批把"顺手加逻辑"拦下来——两条门都在正确的位置响了。
2. **认领前置是有对价的**：子卡 `in_progress` 现在覆盖整个 run，进程崩溃会留下 `in_progress` 卡，
   直到 3min 孤儿回收接管。这是"双跑"的对价（设计 §风险 R2 已记档）。
3. **批内上限 N=3 会带来等待摩擦**："一次关 8 张"的合法窗口现在要拆批并等 60s；
   拒绝文案给确定等待毫秒 + 自动链这条零摩擦合规路径（设计 §风险 R1）。
4. **他窗在飞的识别成本**：工作树 194+ 改动文件（含未跟踪 260），`support.ts` / `limits.ts` /
   `DoneEvidenceSpec.ts` / `knowledge/INDEX.md` 的 diff 均**不是本需求**的；靠 mtime + diff 内容逐一定性，
   否则很容易把别窗的红算到自己账上。

## 四、偏离与归属（未掩盖） <!-- serves: BUG-5 -->

| 编号 | 偏离 | 归属与处置 |
|---|---|---|
| D-1 | `pnpm kb:check` 未达退出码 0（余 K1 INDEX 超限 / K3 conventions 222 行 / K14 两条待刷基线） | 均 HEAD 既存或他窗改动（附 HEAD 字节数/行数证据）；按边界不代改不代刷 |
| D-2 | 本需求曾引入一条契约红（内部 return 被扫描 + 文件超 400 行） | 当场修掉（抽件），已写入 `design/test-cases.md` 偏离记录 |
| D-3 | 全量集合差新增 7 条全在 `tests/kb-ensure.test.ts` | 顺序相关（单跑/家族同跑/与本需求同跑均绿）；不代刷基线 |
| D-4 | 验收材料首次提交时工具调用在确认门上超时截断 | 逐项证据未绑定到 sheet；已由人工逐项验收补上（7/7 通过），孤儿用例项的 serves 缺口已就地补齐（9 文件） |

## 五、遗留与跟进 <!-- serves: BUG-5 -->

- **L-1**：知识层三项维护债（INDEX 超限 / conventions 拆页 / kb-0064·0065 待刷基线）——由知识层维护方处置。
- **L-2**：`tests/kb-ensure.test.ts` 的顺序相关问题——由引入方定性后决定是否刷基线。
- **L-3**：本 profile 子卡执行引擎不可达，实施链的"复现/修复/复核/回归"只能由 owner 窗口自证闭环——
  若要让链真正自动跑，需先让 workflowEngine 在插件可见作用域可达。
- **L-4**：H1/H2/H3 与 L1–L7 仍未收（体检报告 §2.1 / §2.3），其中 H3（跨进程写无锁）依赖部署拓扑裁决。

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：交付结果 / 复用做法 / 代价教训 / 偏离归属 / 遗留 | session-9574f815 |
