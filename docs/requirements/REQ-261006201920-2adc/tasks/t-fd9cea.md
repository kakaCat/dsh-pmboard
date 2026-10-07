# t-fd9cea 子卡落库回填接线（懒展开）·测试

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
子卡落库回填接线（懒展开）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T12:51:42.097Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

测试段完成：本卡面零新增失败、零类型错误；相对 t1 只多 3 条失败且全在别的窗口域，已逐条给出归属。

### 完成项

- 全量 pnpm test 读数：74 failed / 6312 passed / 22 skipped（6408 用例）；文件 42 failed / 497 passed
- 与 t1 时读数对比：用例级失败 118 → 75（净减 43，别的窗口修好了不少），t2 相对 t1 只新增 3 条失败用例
- 新增的 3 条全部不在本卡改动面：header-progress-e2e（真实浏览器渲染）、prototype-geometry-evidence（原型几何探针）、reqboard/settings-init（设置装配）
- 落在本卡面的失败为 0：lazy-expand / subtask / acceptance-sheet / verdict / rework 相关文件全部绿
- 类型检查：本卡改动面（lazy-expand.ts）零错误；仓库 2 条错误全部在别的窗口的 tests/helpers/tool-deps.ts（Cannot find name resolveWorkspaceRoot，漏导入）
- 如实说明：仓库级失败计数受其它窗口在飞改动影响而波动，故判据用**集合差 + 逐条归属**，不用计数上限

### 下一步

关闭 t2 测试段与父卡；随后写 t3 的三个新增用例文件（rework-gate / verdict-result-anchor / system-item-disposition）

---
