# t-31abfb 路径抽取口径扩根（唯一取数口改一处）·研发

> 需求：REQ-261007095750-9f48 拆分依赖判据的 src/ 盲区修复（PATH_RE 扩根）

## 在做什么
路径抽取口径扩根（唯一取数口改一处）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T02:04:22.644Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

研发段完成：口径扩根落盘、7 例边界用例全绿、证伪可复现，并纠正了设计里「唯一取数口」的不准确说法

### 完成项

- 改 src/application/internal/conflict-check.ts:28 的 PATH_RE：根补 src、扩展名补 mts（只改这一处，declaredFiles 与 findWorkSurfaceConflicts 签名与语义未动）
- 新建 tests/path-extraction-scope.test.ts（7 例）：src 命中（含深层目录）/ .mts 命中 / 目录名不命中 / 空输入与无扩展名不命中 / 既有四根与 agent-dh 前缀不回归 / 去重 / 抽取器不查盘
- npx vitest run tests/path-extraction-scope.test.ts → 7 passed（改前这些用例必红）
- 证伪成立：把根改回四根重跑 → 4 例失败（TC-1 / TC-2 / 去重 / 证伪锚），改回后 7 例绿且文件与证伪前逐字节一致
- npx tsc --noEmit -p tsconfig.json → 本需求文件 0 错（存量仅 1 条：tests/query-docs-roots.test.ts，属并发窗口在制）
- git diff --stat：src/application/internal/conflict-check.ts 1 文件 +4/-1；tests/path-extraction-scope.test.ts 为新增未跟踪文件
- 如实报出发现问题：全仓另有一套 PATH_RE（src/domain/task/Footprint.ts:84，容量下限用；已含 src、但不含 packages 且不要求扩展名）——我设计里「唯一取数口」的说法不准确，已把 architecture.md 与 interfaces.md 改为「冲突族唯一取数口」并加口径澄清；该套的 packages 缺口登记为待办，不在本需求范围

### 改动文件

- `src/application/internal/conflict-check.ts`
- `tests/path-extraction-scope.test.ts`
- `docs/requirements/REQ-261007095750-9f48/design/architecture.md`
- `docs/requirements/REQ-261007095750-9f48/design/interfaces.md`

### 下一步

复核段按卡验收标准逐条复核（含证伪记录）

---
