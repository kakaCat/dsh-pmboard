# t-c702ff 替换 8 处死路径引用并重建 client 产物·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
替换 8 处死路径引用并重建 client 产物·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:16:12.695Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

替换 8 处死路径引用（含 GUI 文案）并重建 client 产物；A/B 证明零新增红

### 完成项

- 8 处死路径引用替换：agent-dh/docs/architecture/requirement-archive.md → docs/architecture/archived-entry.md（SubmitTool/prompt.ts:35、capture-section.ts:161、client/views/verification.ts:253-254、protocol.ts:983、ArtifactSpec.ts:58,75）
- errors.ts:10 注释删「见 docs/standards/tool-development.md」路径引用，保留构造约定描述
- 同步更新 tests/client-view.test.ts:607 断言（旧死路径 → 新活路径）
- 证据：grep -rn "agent-dh/docs/architecture/requirement-archive|docs/standards/tool-development" src 命中 0
- 证据：pnpm build:client 退出码 0，verify-client OK（bundle=766863 bytes，关键符号齐全/CSS 分片完整）
- 证据：全量 vitest A/B（本卡 6 文件回退前后各跑一遍）失败集合完全相同（69=69，diff 为空），无新增红

### 改动文件

- `src/tools/SubmitTool/prompt.ts`
- `src/application/internal/capture-section.ts`
- `src/client/views/verification.ts`
- `src/shared/protocol.ts`
- `src/domain/artifact/ArtifactSpec.ts`
- `src/domain/errors.ts`
- `tests/client-view.test.ts`

### 下一步

继续 t2（探针扩面）——它依赖 t1 已修完的 src 面

---
