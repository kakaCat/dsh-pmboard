# t-59aabb 归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
跑 npx vitest run tests/archive-materials-shape.test.ts 全绿；用例逐条断言：① path='docs/architecture/project-manual.md#机制备忘-收尾门' 通过；② path='docs/architecture/project-manual.md'（无 #）抛出且消息含「路径#锚点」；③ path='a#b#c' 抛出；④ path='CLAUDE.md#某节' 抛出且消息含 docs/architecture/ 与 docs/guides/ 前缀清单；⑤ 既有 requiredDocs 缺项仍被拒（回归钉）。

## 实施方案（implementation）
改 src/shared/protocol.ts 的 assertArchiveMaterials（约 2060-2105 行）：① 逐条 manualUpdates 解析 path，split('#') 长度必须为 2 且两段 trim 后非空，否则 bad() 写清「必须是 路径#锚点 形态」+ 原值；② 用 rule.mergeTargets.some(p => beforeHash.startsWith(p)) 判白名单（复用同一份规则，不新增第二份白名单），未过则消息含白名单前缀清单 + 原值 + rule.note；③ 保留既有 dir/requiredDocs/mergedInto 前缀判定不动。新建 tests/archive-materials-shape.test.ts：从 tests/application/harness.ts 与 tests/helpers/tool-deps.ts 取夹具，直接调 assertArchiveMaterials 断言四种形态（合法 / 无 # / 多 # / 白名单外）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T12:53:53.591Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

t1 全卡完成：归档说明书更新点的形态判据从自由文本升级为可机器复核的 路径#锚点，并纳入既有白名单；四段子卡各带真实证据，判据命令 10/10 全绿。

### 完成项

- 契约面落地：manual_updates 收敛为 path#anchor（恰好一个分隔符、两侧非空）
- 白名单复用 ARCHIVE_DOC_RULES 的 mergeTargets，不新增第二份规则
- ManualUpdate.section 降为废弃可选字段，读侧渲染为 path（旧：section）
- 新增 tests/archive-materials-shape.test.ts（10 用例：四形态 + 三条回归钉）
- 对抗探针 7 例验证护栏可见；契约升级面实测 63 条已登记给 t11

### 改动文件

- `src/shared/protocol.ts`
- `src/application/use-cases/SubmitArchive.ts`
- `src/client/types.ts`
- `src/client/views/verification.ts`
- `tests/archive-materials-shape.test.ts`

### 下一步

t2 承接事实判定（存在 / 非空 / 锚点可达），t11 承接 63 条既有用例契约升级

---
