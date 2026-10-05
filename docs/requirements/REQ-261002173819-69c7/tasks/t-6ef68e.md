# t-6ef68e 投递失败不把重试锁死：回收锁 + 可读留痕·研发

> 需求：REQ-261002173819-69c7 修复 reqboard 自动化断链：Dive 无法重新武装 + 自动实施链投递失败

## 在做什么
投递失败不把重试锁死：回收锁 + 可读留痕·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T10:06:30.942Z，窗口 session-c997b014-0c5c-4679-9439-98f6d0a3fc20）

投递失败不再把重试锁死：失败当场回收推进锁、留一条人能读懂的失败记录，并把回执从「需求不存在」改成「投递失败」——原先一次投递失败会让这个需求在 15 分钟内谁也推不动。

### 完成项

- 协议枚举新增 DISPATCH_FAILED：投递失败不再借用 PAUSE（那会让人误读成链已暂停）
- AdvanceStop 新增 dispatch_failed，失败分支不再返回 not_found（后者被工具映射成「需求不存在」，纯误导）
- 新增 releaseClaim：只清自己认领的那把锁，并写 history 与 comment 留痕
- 投递 catch 段改为「先回收锁、再返回失败」；锁回收本身失败也如实写进 reason，不静默
- owner 取不到时按无主 job 投递，并在同一次认领里留 owner_missing 痕（不额外多写一次盘）
- 新增 D-1/D-2/D-3/D-5/D-7 五例，本文件 7 例全绿

### 改动文件

- `src/shared/protocol.ts`
- `src/application/use-cases/AdvanceChain.ts`
- `tests/advance-dispatch-owner.test.ts`

### 下一步

联调子卡：核对失败路径与工具回执的映射（dispatch_failed → REQBOARD_DISPATCH_FAILED）

---
