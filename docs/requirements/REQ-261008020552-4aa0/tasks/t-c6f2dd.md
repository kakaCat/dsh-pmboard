# t-c6f2dd 同步面收尾与全量闸（U5：README/package.json/docs/知识层 21→19）·研发

> 需求：REQ-261008020552-4aa0 reqboard 体检第六批激进精简与结构减负（21→19 + task_move/submit 瘦身）

## 在做什么
同步面收尾与全量闸（U5：README/package.json/docs/知识层 21→19）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/apply-wiring.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T19:48:13.863Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U5 研发完成：同步面 19 口径全部落地，判据①②绿；③④⑤被三项非本批债卡住（另附取证），提请裁决

### 完成项

- tool-face-inventory.md：标题/TL;DR 改 27→19（补 2026-10-08 收编行）、19 个槽位 5 组、归档组摘除、task_amend 行标注 5 op
- project-manual.md：:145 补录入口改 reqboard_task_amend(op=archive)；:211 补记表 LONG_TEXT_STYLE_ONLY_FIELDS 5 条/5 工具 → 4 条/4 工具（note_interruption 出表留痕）
- knowledge/architecture.md:77 与 glossary.md:21：断点行工具名改 reqboard_task_amend(op=interruption)
- pnpm kb:build 重跑（code-map.symbols.tsv 消漂移；INDEX/tokens 零漂移）
- 判据① readme-tool-face/toolviews-contract/tools-render-coverage/apply-wiring 32 测试全绿（注册名单=19）；判据②「19 个」package.json×1 + README×3 命中
- README/package.json 计数在 U1/U2 已随门禁同步（21→20→19），本卡复核确认

### 改动文件

- `docs/architecture/tool-face-inventory.md`
- `docs/architecture/project-manual.md`
- `docs/knowledge/architecture.md`
- `docs/knowledge/glossary.md`
- `docs/knowledge/code-map.symbols.tsv（kb:build 生成物）`

### 下一步

判据③④⑤遇非本批债务（kb:check K1/K3/K14、15 条基线红、baseline 53 条未落账修复）——已取证非本批引入，提请人裁决

---
