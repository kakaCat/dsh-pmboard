# t-2cd3c9 契约文档与排查手册收口·研发

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
契约文档与排查手册收口·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T10:50:07.318Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

三份契约/手册文档收口：清位先于落章推进、清位即驱动、分档过期与排查三步都写进去了。

### 完成项

- confirm-gate-advance.md §1 调用纪律补第 6/7 条：清位先于落章/推进 + 没推进成功补一次驱动
- confirm-gate-advance.md §2 自动链行补「清位即驱动」（回调 notifyDrivable → round 半）
- automation-chain-contract.md §六 补「弹框在途」一档及其三条解除条件
- project-manual.md 新增一节：停机位语义（台账 + 内存两半）/ 触发面（事件 + 清位回调）/ 排查三步
- 未动任何导出符号 ⇒ 无需 pnpm kb:build
- acceptance ①：三份文档 grep 关键句分别命中 2 / 2 / 3 处

### 改动文件

- `docs/architecture/confirm-gate-advance.md`
- `docs/architecture/automation-chain-contract.md`
- `docs/architecture/project-manual.md`

### 下一步

复核段：核关键句与口径一致

---
## 汇报 2（2026-10-06T10:50:18.902Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

补记研发段验收要求的改动读数（三份文档的增行规模，其中两份同时含别窗口 WIP）。

### 完成项

- git diff --stat 摘要：automation-chain-contract.md 与 project-manual.md 由本卡新增段落（两文件同时含别窗口 WIP）
- 新增文件（未跟踪）：docs/architecture/confirm-gate-advance.md 7 行增量（§1 两条纪律 + §2 自动链行）
- project-manual.md 追加新节约 50 行（停机位语义 / 触发面 / 排查三步）
- automation-chain-contract.md §六 追加「弹框在途」一档约 20 行
- 本卡不改任何 src，也不动导出符号

### 下一步

（补充读数，研发段已关单）

---
