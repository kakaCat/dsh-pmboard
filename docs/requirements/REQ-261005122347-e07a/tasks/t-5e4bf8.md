# t-5e4bf8 回归收尾：知识层条目 + 反向演练 + 全量门禁·研发

> 需求：REQ-261005122347-e07a 需求分析阶段：收录 UI 提示词（MIT）并按引用交付原型 subagent

## 在做什么
回归收尾：知识层条目 + 反向演练 + 全量门禁·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:09:54.054Z，窗口 session-6caf9382-cd78-46cf-a397-d723c7103292）

这一步做完，这次交付的经验进了知识层（新条目 + 新规范 C-22），架构篇也补上了「资产在包里是源、子代理只能读工作区」这一节。两处护栏都做了真反演：把指纹比对拿掉，篡改就查不出来；把这一节改成不可裁，用例立刻变红——证明它们不是空转的断言。另有一条外部阻塞如实记在案：知识层自检仍红，原因是另一个并发窗口留在 scripts/ 下的三个未归类文件，与本需求无关。

### 完成项

- 知识层条目 kb-0043 落库：资产走「包内是源 + 投放进工作区 + 注入只给引用」
- 架构篇新增第八节：投放根、幂等、事务、溯源、回滚、Python 前置与判据
- 规范页新增 C-22（收录/更新资产必须重算指纹），并把新脚本登记进白名单
- 两处反向演练**实跑**：指纹断言拿掉后篡改被放过；本节改成不可裁后 TC-13 变红
- 两处反转的脚本改动已逐字节还原（diff 与备份一致），还原后门禁恢复绿
- 自测：vendor --check exit 0；check-prompt-fragments exit 0；tsc 0 条错误
- 自测：本需求四份用例 45 passed；指定回归 1 failed / 577 passed（失败数与基线同为 1）

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

复核阶段：核对门禁与演练记录；pnpm kb:check 的外部阻塞需一并说明

---
