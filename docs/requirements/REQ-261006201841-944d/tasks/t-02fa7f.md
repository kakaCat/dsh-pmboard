# t-02fa7f 反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
跑 npx tsx scripts/reverse-drill-matrix.mts --group archive 三组全过且退出码 0；逐条判据：① RV-1 输出「期望拒绝」为真且拒绝消息含被改路径，且演练后被改源码逐字节还原；② RV-2 删 K13 分支时指定用例确实变红（不是无覆盖），还原后复绿；③ RV-3 报告读数 2/22/14/3/15 逐条对得上且台账副本 sha256 未变；④ 改动前后失败用例集合差为空（逐条列出非本次引入的存量红项）；⑤ pnpm kb:check 的失败项集合与改动前快照一致（零新增红）。

## 实施方案（implementation）
① 改 scripts/reverse-drill-matrix.mts 增 --group archive：RV-1 用桩工作区跑归档提交并断言拒绝消息含路径，然后逐字节还原被改文件；RV-2 注释掉 kb-probe 的 K13 分支 → 断言指定用例失败 → 还原；RV-3 调 archive-ledger-audit 在副本上跑并比 sha256；② 采集改动前快照与改动后快照，比对失败用例集合差；③ 把三组读数与集合差写进 docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md 的对应小节；④ 跑 pnpm kb:check 与 req-doc-validate 并如实登记存量红项（K1 INDEX 超预算 / K3 / K7 / K9 等属别的窗口欠债，逐条标「非本次引入」）。

## 上游产出摘要（dependsSummary）
- 存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）
- 既有用例契约升级（7 个旧形态文件）与兼容回归

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:33:42.092Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

t12 全卡完成：交付物第一次可以自己证明自己（三条反向演练 + 集合差 + 读数归因）。

### 完成项

- 三条子卡全 done：研发/复核/测试各有汇报与读数
- RV-1 不存在的合并去向被拒并点名路径/生效根/判据来源，材料逐字节还原后同一次提交通过
- RV-2 删 K13 分支指定用例即时红、还原后复绿（kb-probe sha256 00187c55 前后一致）
- RV-3 副本上只读核对：七项读数 2/2/22/14/1/3/15 全对、两棵树 sha256 未变
- 集合差：本需求相关 16 文件 0 失败；唯一新增红（错误码清单）归因别窗口
- kb:check 本需求引入新红 0；K14 新红按设计保持可见不刷基线

### 改动文件

- `scripts/reverse-drill-matrix.mts`
- `scripts/archive-ledger-audit.mts`
- `docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md`
- `docs/requirements/REQ-261006201841-944d/notes/follow-up-findings.md`

### 下一步

implementing 阶段收尾：全部 12 张卡完成，需求进入 accepting 并提交验收材料

---
