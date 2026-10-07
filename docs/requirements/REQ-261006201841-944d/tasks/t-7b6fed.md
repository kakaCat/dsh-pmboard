# t-7b6fed 反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3）·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:33:33.759Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

研发段完成：archive 反向演练组落地（RV-1/2/3），退出码 0。

### 完成项

- reverse-drill-matrix.mts 新增 --group archive 三条：RV-1 不存在的合并去向必被拒并点名路径/根/来源
- RV-2 注释掉 K13 分支 → 指定用例变红（退出码 1、红例 1），还原后复跑复绿
- RV-3 真台账副本上跑只读核对：七项读数对上、两棵树 sha256 未变、副本外零新增
- 新增可选「还原后复跑」判据与两个定制执行器；既有三组 Drill 必填字段未放宽
- 报告落盘：archive-reconcile-report.md 增反向演练、集合差、kb:check 三节

### 改动文件

- `scripts/reverse-drill-matrix.mts`
- `scripts/archive-ledger-audit.mts`
- `docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md`
- `docs/requirements/REQ-261006201841-944d/notes/follow-up-findings.md`

### 下一步

复核段：核对三条演练的因果与还原纪律

---
