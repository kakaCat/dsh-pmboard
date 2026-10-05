# t-526edb 漏登当场见：提交时对账，不处置就不让过

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
漏登当场见：提交时对账，不处置就不让过

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/archive-reconcile.test.ts 全绿（三分类集合不交、未列即拒、ack 覆盖不全拒、ack 非法项拒、声明齐通过、warn 不拒、既有归档回归）；断言拒绝后队列与台账写入序号不变；grep -c "unlisted_ack" src/tools/SubmitTool/SubmitTool.ts ≥ 2。

## 实施方案（implementation）
改 src/application/use-cases/SubmitArchive.ts：目录遍历对账前移到写台账之前，产出 listed/exempted/unlisted 三分类；未列未豁免且未被 unlisted_ack 覆盖 → 拒绝（码 REQBOARD_UNLISTED_ACK_REQUIRED，文案列出未列文件与两种处置）；warn 模式不拒；对账结果写入归档记录与需求评论；返回体给 reconcile 并保留 unlisted_files/warning。改 src/tools/SubmitTool/SubmitTool.ts 入参（unlisted_ack）与出参（reconcile）schema。新增 tests/archive-reconcile.test.ts。

## 上游产出摘要（dependsSummary）
- 先把规矩定死：哪些文件不用进清单、对账结果长什么样

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T10:43:05.155Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，归档时的「清单是否漏了东西」从一句事后提醒变成了提交前的一次硬核对：漏了又不说清楚，就过不去；想说清楚，就得写明为什么不收。这是本次需求最核心的一处行为改变，也配了一键回退。

### 完成项

- 对账前移 + 未列即拒 + 声明豁免 + warn 回退全部落地
- 对账结果落记录/评论/回执三处可见
- 工具 schema 同步（入参 unlisted_ack、出参 reconcile）
- 8 条新用例 + 44 条既有回归全绿
- 整卡四段子卡链完成

### 改动文件

- `src/application/use-cases/SubmitArchive.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/ports.ts`
- `tests/archive-reconcile.test.ts`
- `tests/helpers/tool-deps.ts`

### 下一步

t3：受控补录（工具 + 看板共用用例，只追加 + 留痕）。

---
