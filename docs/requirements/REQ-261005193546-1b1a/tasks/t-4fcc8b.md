# t-4fcc8b 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）·研发

> 需求：REQ-261005193546-1b1a 看板 DAG 不再展示已取消卡：让视图与统计都不再算上退出赛道的卡片

## 在做什么
依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T16:49:03.475Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段完成：依赖判定四处收敛到一个判据域，V-5 同批同源；活卡不再被已取消卡永久卡死。

### 完成项

- 四处判定收敛：computeReady / protocol.readyTasks / queue-access.readyTasksOf / validateQueue V-5 全部改走 t1 单点
- V-5 与 computeReady 同批改（否则写路径被自己算出的 ready 判成假就绪）
- 顺手补 layerInputOf 泛型约束含 id: string（消除缺 id 时静默降级）
- computeLayers 与 V-4 一字未改（落盘分层判据、取消卡不豁免都保持）
- 新增 tests/live-tasks-ready-single-source.test.ts（8 例）

### 改动文件

- `src/domain/status/Predicates.ts`
- `src/domain/queue/topology.ts`
- `src/shared/protocol.ts`
- `src/application/use-cases/queue-access.ts`
- `src/domain/queue/validateQueue.ts`
- `tests/live-tasks-ready-single-source.test.ts`

### 下一步

进入联调段：队列相关集成套件零回归

---
