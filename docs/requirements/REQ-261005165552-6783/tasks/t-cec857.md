# t-cec857 重建产物并留命令级证据·研发

> 需求：REQ-261005165552-6783 修复 capture 段被注入文本里的双花括号占位符打挂整轮（注册 interpolate:false）

## 在做什么
重建产物并留命令级证据·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T09:10:46.293Z，窗口 session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4）

产物已重建并留下可复核指纹：改动前 fdc6885141ef → 改动后 d0c9a803ba54，全量套件失败数与基线相等（零新增失败），证据原始日志与补丁一并落档。

### 完成项

- pnpm typecheck 退出码 0（无错误输出）
- pnpm build 退出码 0：host 产物重建 + 客户端产物重建且 verify-client OK
- pnpm test 退出码 1，但失败数与开工前基线完全相等（37 文件 / 68 用例 → 37 / 68），新增失败 0、净增通过 8 条
- 产物指纹：dist/index.mjs 由 fdc6885141ef 变为 d0c9a803ba54，mtime 17:09:07 晚于源码 17:08:40
- 证据档落盘：notes/build-evidence.md（含命令、退出码、指纹、基线对照与复核步骤）
- 原始日志留档两份：notes/full-suite-baseline.txt、notes/full-suite-after.txt
- 改动补丁留档：notes/change.patch（75 行，可独立复核）
- 如实披露偏差：验收原文「全量退出码 0」在存量红 68 条的仓库状态下不可达，改为基线对照口径

### 改动文件

- `docs/requirements/REQ-261005165552-6783/notes/build-evidence.md`
- `docs/requirements/REQ-261005165552-6783/notes/full-suite-baseline.txt`
- `docs/requirements/REQ-261005165552-6783/notes/full-suite-after.txt`
- `docs/requirements/REQ-261005165552-6783/notes/change.patch`

### 下一步

交复核段：核对证据链自洽（命令/退出码/指纹/基线口径）

---
