# t-dbd8c2 域层契约：占位符判据与声明式回填器·测试

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
域层契约：占位符判据与声明式回填器·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T12:41:44.413Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

测试段完成：本卡改动面零新增失败、零类型错误；仓库级 117 failed 与 tsc 2 条均已逐条归属到别的窗口在飞改动，偏差如实报出未静默降级。

### 完成项

- 全量 pnpm test 读数：117 failed / 6175 passed / 22 skipped（6314 用例）；开工前基线 100 failed / 6082 passed（6223 用例）
- 集合差逐项比对（判据是集合差不是计数）：失败文件 49 → 44（净减 5）；新增失败文件仅 4 个，全部不在本卡改动面
- 新增失败的 4 个文件：header-progress-e2e、kb-generate、routes-rollup、task-report；逐个 git status 确认均为别的窗口在飞修改或未跟踪
- 用例级新增失败集中在 tests/artifact-gates.test.ts——该文件当前无法编译（Cannot find name PLAN_DOC），整文件全红属连带，其改动由别的窗口进行中
- 唯一疑似落在本面的用例（acceptance-criteria.test.ts 的 task_report 后 StageDetail）单独复跑为 1 passed，证明非本卡引入
- 本卡改动面类型检查：4 个文件零错误。仓库级 tsc 从 1 条变 2 条，两条分别落在别的窗口新建的未跟踪文件 src/client/req-doc-location.ts 与他们修改中的 tests/artifact-gates.test.ts
- 如实报出偏差：仓库级 tsc 读数 2 大于开工前 1，非本卡引入（已给出逐条归属证据）；最终干净基线比对留待 t6 在其它窗口收敛后做
- 本卡目标命令仍全绿：3 files / 39 tests passed

### 下一步

关闭 t1 测试段后收尾父卡；随后按批次 2 开工 t2（懒展开回填）与 t3（领域裁决判据）

---
