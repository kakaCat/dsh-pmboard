# t-1f9dff 样式物理分片 + 拼接出口（导出名与顺序不变）·研发

> 需求：REQ-261007133149-0716 详情页组件化改造：单文件单组件 + 契约显式化（面向 agent 可维护性）

## 在做什么
样式物理分片 + 拼接出口（导出名与顺序不变）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T08:04:39.859Z，窗口 session-d8796de1-a883-44b9-84a7-f13bba6f92fc）

研发段完成：2387 行 report.ts 切成 12 个分片文件、出口仍导出 REPORT_CSS；切前与拼回 sha256 一致（逐字节相同），构建与判据一均绿。

### 完成项

- src/client/styles/report.ts 由「单一大模板字面量」改为拼接出口：仍是同一路径、仍导出 REPORT_CSS，用单行模板字面量插值（不引入任何分隔符）
- 新增分片：styles/report/{base,tokens,head,band,tabs,shared}.ts 与 styles/report/panels/{trunk,docs,dialogue,token,prompts,dag}.ts（共 12 个文件，13 段）
- 切分纪律：只做物理搬家、跨分片不重排；段落边界取原文件确认过的 13 个章节起点行（44/73/173/412/534/592/732/835/896/1033/1108/1194/1249），每个边界都断言命中期望的圈码标记
- 逐字节证明（切分时断言）：CSS 体 151316 字符、切前 sha256=1e316258514b8f9e… 与拼回 sha256 一致，不一致则不写盘
- 独立复算（从落盘文件重新拼回，不信内存断言）：出口顺序 BASE→TOKENS→HEAD→BAND→TABS→SHARED_PUBLIC→TRUNK→DOCS→DIALOGUE→TOKEN→PROMPTS→DAG→SHARED_CROSS，拼回 sha256=1e316258514b8f9e769817fb1e6da96674b1b9d407bc9ee0c23e8ba77f2d58a4 与改造前一致（197553 字节 / 151316 字符）
- 证据落盘：evidence/report-css-before.sha256 记录改造前 CSS 体的字节数与 sha256
- 构建：pnpm build:client 退出码 0，输出含 [verify-client] OK bundle=761334 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- 判据一（零外观变更）：npx tsx scripts/report-style-snapshot.mts --check 退出码 0，28 个采样条件、逐组件不同键数全 0
- 页面用例：report-shell / report-tabs / report-content / report-degrade / probe-hard-criteria 共 125 例全绿
- shared.ts 本轮收公共件（⑤）与跨组件收口层（⑫–⑱+㉑ 等）两段，按段内原序保留；按 D-4 裁定，覆盖层归位留给下一张卡 t-d2d7d2

### 改动文件

- `src/client/styles/report.ts`
- `src/client/styles/report/base.ts`
- `src/client/styles/report/tokens.ts`
- `src/client/styles/report/head.ts`
- `src/client/styles/report/band.ts`
- `src/client/styles/report/tabs.ts`
- `src/client/styles/report/shared.ts`
- `src/client/styles/report/panels/trunk.ts`
- `src/client/styles/report/panels/docs.ts`
- `src/client/styles/report/panels/dialogue.ts`
- `src/client/styles/report/panels/token.ts`
- `src/client/styles/report/panels/prompts.ts`
- `src/client/styles/report/panels/dag.ts`
- `docs/requirements/REQ-261007133149-0716/evidence/report-css-before.sha256`

### 下一步

交复核段：核对分片边界与出口顺序、复核逐字节证据（含独立复算），并要求覆盖层归位卡 t-d2d7d2 在此之上施工

---
