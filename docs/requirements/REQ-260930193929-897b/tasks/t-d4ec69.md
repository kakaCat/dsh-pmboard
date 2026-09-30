# t-d4ec69 用正反两组测试锁住：该放行的放行、该拦的照拦·研发

> 需求：REQ-260930193929-897b G2 完整性闸门未按需求级 workspaceRoot 二次校正：文件在盘上却报 requirement.md 不存在

## 在做什么
用正反两组测试锁住：该放行的放行、该拦的照拦·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

怎么验（可执行）：① `node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts` → 期望 `Tests 13 passed (13)`；② `test -f tests/design-gate-workspace-root.test.ts && echo ok` → 期望输出 `ok`；③ 故障注入（判别力自证）：注释掉 `src/application/internal/confirm-settle.ts` 中 `applyRequirementWorkspaceRoot(deps, before)` 一行后重跑 ① → 期望「拆分内容硬门」用例变红，随后恢复。

## 汇报 1（2026-09-30T12:35:33.723Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

正反两组测试落地并通过，且已证明它们「在缺陷存在时会失败」——停用任一接线点都会有用例变红。这一步做完，什么变了：这个缺陷以后不可能悄悄回归，而「修成永久放行」这条歧路也会被反向用例当场判死。

### 完成项

- 新增 tests/design-gate-workspace-root.test.ts 共 10 例：正向（会话根 A ≠ 需求根 B、文档在 B → 放行并推进到 decomposing）、反向（同一错误根下 B 确实缺 requirement.md → 仍 design_doc_incomplete 且缺口含「requirement.md 不存在」）、补齐文件后缺口消失的对照、拆分内容硬门的 fail-open 复现与校正后拦截、存量 no-op 三例、防新增旁路静态断言两例
- 全部用真实 FileDocRepository 指向两个临时目录模拟「外来根 A」与「需求根 B」；并在用例内断言读盘前根确实等于需求根（uc.docs.workspaceRoot() === dirB），把替身空过变成可证伪断言
- 判别力验证（关键，不是只看全绿）：① 临时注释掉 confirm-settle :103 的校正 → 拆分内容硬门用例失败并复现 fail-open；② 临时注释 ConfirmArtifact 的校正 → 静态断言精确点名「ConfirmArtifact.ts:93 读盘前缺少根校正」。两次改动均已恢复，grep 确认无 TEMP 残留
- 修掉静态断言自身的一个真缺陷：原正则会把**被注释掉的调用**当成有效校正（自欺式通过）——这正是第①次判别实验暴露的，已改为排除注释行
- 结果：定向 10/10 通过；全量 vitest 103 失败（基线 103，无新增）/ 2638 通过（基线 2627）；tsc 全量 213 条与基线逐条一致

### 改动文件

- `tests/design-gate-workspace-root.test.ts`

---
