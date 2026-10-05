# t-8da10a 探针改判据：可见集重写 + 三条新断言 + 红态自证

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
探针改判据：可见集重写 + 三条新断言 + 红态自证

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
./node_modules/.bin/tsx scripts/header-progress-probe.mts 退出码 0，6 档 problems=NONE 且可见集与设计 test-cases.md TC-1 期望表逐档一致（1232/976/852：7名+2数+6线+无徽章；720：1名+1数+0线+无徽章；592/452：0名+0数+0线+徽章可见）；--fallback 模式 PASS（全明细可见+徽章隐藏）。红态自证：把 FLOW_TIERS.token 改回 1000 → 720 档变「1 名 0 数」→ 退出码 1；把徽章改回常显 → 宽档报 TOTAL_DUPLICATED → 退出码 1；红/绿两份 stdout 存入 evidence/。

## 实施方案（implementation）
改 scripts/header-progress-probe.mts：① 档位期望表按新规则重写（标本=实施中、当前节点 implementing 有快照）；② 新增三条断言并入 problems：visLabels>0 且 visTokens<1 → TOKENS_HIDDEN_BESIDE_LABELS；visLabels===0 且 visBadges<1 → TOTAL_MISSING；visLabels>0 且 visBadges>0 → TOTAL_DUPLICATED；③ DIAG 行沿用 tokens=<节点级>+<徽章> 两段读数。证据：红态与绿态 stdout 各一份存入 docs/requirements/REQ-261004151652-d535/evidence/。

## 上游产出摘要（dependsSummary）
- 流程图节点改上下两行，且让「有名字就有该节点的数」

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T07:33:27.752Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，谁再让「有名字没数」或「明细与总数重复」回来，回归会当场报出具体档位与原因。

### 完成项

- 探针两档模型与三条新断言落地（有名字没数 / 明细隐却无总数 / 明细在却显总数）
- 红绿自证齐备：两条红态各自可复现，绿态两模式退出码 0
- 顺带修掉分片顺序导致的真缺陷并加单测守卫（实测去掉前缀必红）
- 全量回归回到基线，过渡态闭环

### 改动文件

- `scripts/header-progress-probe.mts`
- `docs/requirements/REQ-261004151652-d535/evidence/t2-evidence.md`

---
