# t-79cabc 存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
跑 npx vitest run tests/archive-ledger-audit.test.ts 全绿且 npx tsx scripts/archive-ledger-audit.mts --json 可跑；逐条断言：① 临时副本上真失效合并去向 = 2；② 说明书锚点漂移双读数 = 22（任意级标题归一化精确匹配）与 14（像章节引用），两者都出现在输出里；③ manual_updates.path 本身缺失 = 1；④ 归属未知 = 3；⑤ 按当前工作区直接比的对照读数 = 15；⑥ 跑完台账树文件 sha256 逐字节未变；⑦ DSH_HOME 指向不存在目录 → 退出码 2 且输出含原因（不是 0）；⑧ 脚本无 --out 时不对任何路径写盘。

## 实施方案（implementation）
① 新建 scripts/archive-ledger-audit.mts（argv: --json / --out <path.md> / --ledger-root <dir>）：逐条读 archive/<REQ>/record.json 与 archive.json，根取 record.workspaceRoot（脚本无项目注册表，走 path-fallback 并如实标注「项目表不可达」）；锚点集合复用 src/domain/knowledge/slug.ts 的 listHeadingAnchors（禁止手写口径）；② 改 src/domain/knowledge/operations.ts 的 EXCLUDED 增 { name: 'archive-ledger-audit.mts', reason: '专项只读核对脚本（存量归档对账），按需运行' }；③ 报告写明「不追溯、不改写」与两处口径定义；④ 新建 tests/archive-ledger-audit.test.ts：在临时台账副本上跑，断言读数与台账树 sha256 未变；⑤ 产物报告落 docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md。

## 上游产出摘要（dependsSummary）
- 闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:11:11.052Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

t10 全卡完成：存量 37 条归档有了可复跑的只读核对口径，如实报出真失效 2 条（且说明它们落在「归属未知」兜底档）与 22/14 漂移双读数，不追溯任何历史记录。

### 完成项

- 只读核对脚本 + 报告 + 用例齐备（判据 5/5 全绿）
- 六条读数实测与设计逐条一致：真失效 2（含兜底档 2）/ 漂移 22 与 14 / path 缺失 1 / 归属未知 3 / 误判对照 15
- 只读契约有用例钉住（台账树 sha256 未变、退出码 2 与 0 区分）
- 报告明确「不追溯、不改写」，符合 D-3

### 改动文件

- `scripts/archive-ledger-audit.mts`
- `src/domain/knowledge/operations.ts`
- `tests/archive-ledger-audit.test.ts`
- `docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md`

### 下一步

t12 反向演练组汇总；归档材料可引用本报告作 FR-8 证据

---
