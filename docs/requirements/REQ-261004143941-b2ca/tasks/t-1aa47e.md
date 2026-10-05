# t-1aa47e 渲染层回归锚点：探针各档可见 token ≥ 1

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
渲染层回归锚点：探针各档可见 token ≥ 1

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
./node_modules/.bin/tsx scripts/header-progress-probe.mts 退出码 0：6 行 DIAG 均 problems=NONE、每档 n+m ≥ 1、末行 PROBE PASS。红态自证（必须留据）：临时移除 conversation-progress.ts 的 tokenTotal 渲染分支 → B/C/D 档 m=0 且 n=0 → 退出码 1；红态与恢复后的绿态两份 stdout 一起存入 docs/requirements/REQ-261004143941-b2ca/evidence/。

## 实施方案（implementation）
scripts/header-progress-probe.mts：标本模型加 tokenTotal: 24800000；页内量布脚本统计 .dsh-pm-cprog-token-total 并用 getClientRects().length > 0 判可见（不看 display，沿用仓库既有踩坑口径），把「节点级可见 tokens + 总数徽章可见数 < 1」写入 problems（新码 TOKENS_HIDDEN），DIAG 行输出 tokens=<n>+<m>。同时确认 D 档下 .dsh-pm-cprog-token-ico 不可见但徽章文本仍可见。

## 上游产出摘要（dependsSummary）
- 流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T07:04:41.540Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，回归有了会红的哨兵：任何一档只要一个 token 读数都看不到，探针立刻失败——正是这次修的病的反证。

### 完成项

- 探针新增「各档可见 token 至少 1」硬断言，改造前 B/C/D 档必红（红态已存档）
- 诊断行改为两段读数，能分清节点级明细与累计徽章谁在场
- 档位期望表与既有不变量全部保持（行不溢出、零内部滚动、面板不越界）
- 两条与计划措辞的偏差、一条降级态假红均如实留档
- 探针两模式 PASS、相关测试 28 条全绿

### 改动文件

- `scripts/header-progress-probe.mts`
- `docs/requirements/REQ-261004143941-b2ca/evidence/t3-evidence.md`

---
