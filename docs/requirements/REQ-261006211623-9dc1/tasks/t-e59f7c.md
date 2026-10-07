# t-e59f7c 复跑三条总门并把复核材料与实现对齐·复核

> 需求：REQ-261006211623-9dc1 需求/设计/拆分三面文档判据门禁加固

## 在做什么
复跑三条总门并把复核材料与实现对齐·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T14:18:03.142Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

链尾总门复跑完成：三条总门 exit 0、矩阵 8/8、集合差归因完毕、dist 同代核对并写明宿主重载要求

### 完成项

- 三条总门复跑：pnpm templates:check exit 0（模板 25 份 OK、需求模板 6 类双向一致、文档自检缺口 0）
- pnpm prompts:verify exit 0（generated/fragments.ts 与片段逐字节一致；heavy.md ↔ vendor 原文一致）
- npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1 → 判据 9 项（实判 6 / 未知 3）、缺口 0、exit 0
- npx tsx scripts/reverse-drill-matrix.mts --group hard → exit 0 · 8/8 ✅（每处改坏真变红、每处还原过 sha256 核对）
- pnpm build exit 0；dist/index.mjs 含本批新码（requirement_sides_invalid 命中 1、clause_criteria_warnings 与 DOC_QUALITY_RULES_SINCE 命中 5）；已写明宿主需重载插件后才在会话里生效
- 全量集合差已归因：失败 69 vs 基线 68、新增 9 条全部落在并发窗口在制面（client-view 3 / error-code-inventory 2 / live-tasks-single-source 2 / artifact-openable 1 / typecheck 1），本需求引入 0 条；tsc 错误 1 条同为并发面
- 读数与归属写进复核材料 §2.3，并同步 design/test-cases.md §五 的实测读数（该节原就是留给实施阶段回填读数的位置）

### 改动文件

- `docs/reviews/doc-quality-gates-2026-10-06.md`
- `docs/requirements/REQ-261006211623-9dc1/design/test-cases.md`

### 下一步

t5 父卡汇总；之后提交验收材料（kind=verification）交棒 accepting

---
