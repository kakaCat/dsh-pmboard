# t-36dca3 回归收尾：知识层条目 + 反向演练 + 全量门禁

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回归收尾：知识层条目 + 反向演练 + 全量门禁

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：doc

## 得到什么结果
① pnpm kb:check 退出码 0；② npx tsc --noEmit 新增错误 0；③ npx vitest run tests/reqboard tests/application tests/http 失败数 ≤ 开工基线；④ notes/ 下两份演练记录在盘，各含「删掉断言 → 用例必红」的记录。

## 实施方案（implementation）
新增 docs/knowledge/entries/kb-00xx.md（决策：资产收录 + 投放主路径 + 只给引用），跑 pnpm kb:build 更新 INDEX.md；把两处反向演练结论（t1 的 --check 必红、t4 的非 floor 必红）写进 notes/；跑全量回归并与开工基线比对。

## 上游产出摘要（dependsSummary）
- 实现投放工具 reqboard_skill_install
- brainstorming 注入「原型工作原则」节

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T05:13:03.012Z，窗口 session-6caf9382-cd78-46cf-a397-d723c7103292）

这张卡整体做完，这次交付的经验与判据都沉淀下来了：一条决策进知识层、一条规范 C-22、架构篇补上「资产在包里是源、子代理只能读工作区」这一节；两处护栏做了真反演证明它们不是空转。四项验收里三项达成，唯一没绿的知识层自检已查明是另一个窗口在同一个仓库里并发改源码所致。

### 完成项

- 三段子卡全部完成：研发 → 复核 → 测试，逐段有汇报与证据
- 知识层新增条目 kb-0043；规范页新增 C-22 并把收录脚本登记进白名单
- 架构篇新增第八节：资产在包里是源、子代理只能读工作区、投放根与回滚约定
- 两处反向演练**实跑**并逐字节还原：拿掉指纹断言则篡改被放过；本节改成不可裁则用例变红
- 验收②达成：npx tsc --noEmit 0 条错误（开工基线 1，新增 0）
- 验收③达成：指定回归 1 failed / 577 passed，失败数与开工基线（1）持平
- 验收④达成：notes/ 下两份演练记录在盘，各含反演与还原记录
- 验收①**未达成且非本需求所致**：pnpm kb:check 仍红——他人在飞的 3 个未归类脚本 + code-map 是全仓源码派生物而对方仍在改源码（详见 notes/verification-summary.md）

### 改动文件

- `docs/knowledge/entries/kb-0043.md`
- `docs/knowledge/conventions.md`
- `docs/knowledge/operations.tsv`
- `src/domain/knowledge/operations.ts`
- `docs/architecture/plugin-runtime-prerequisites.md`
- `docs/requirements/REQ-261005122347-e07a/notes/vendor-drift-drill.md`
- `docs/requirements/REQ-261005122347-e07a/notes/nonfloor-drill.md`
- `docs/requirements/REQ-261005122347-e07a/notes/verification-summary.md`

### 下一步

提交验收材料：reqboard_submit(kind=verification)

---
