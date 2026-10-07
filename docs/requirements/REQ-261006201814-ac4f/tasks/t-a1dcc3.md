# t-a1dcc3 越权、并发、空输入三张矩阵：每一格都钉死·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
越权、并发、空输入三张矩阵：每一格都钉死·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/authorization-matrix.test.ts tests/concurrency-matrix.test.ts tests/empty-input-matrix.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T07:23:16.371Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

三张矩阵落地：越权 24 格、并发 4 格、空输入 8 格，每格三件套 + 计数断言，19 用例全绿

### 完成项

- 新增 tests/helpers/ledger-probe.ts：把「零写入」读成同一形状（台账 revision + 队列写入序号 + 状态字段快照），并给三件套一体断言 expectRejectedWithNoWrite
- 新增 tests/authorization-matrix.test.ts：纯函数层 4 条件 × 6 动作 = 24 格逐格钉死，工具层再核 observer / 无席位各 2 个动作的码 + 零写入 + 状态不变
- 越权矩阵另加一格反向证明：owner 的同一动作拿不到席位类拒绝码，说明上面的拒绝真来自席位
- 新增 tests/concurrency-matrix.test.ts：四格（单飞锁 / 重复拆分 / 并行父卡上限 / 批量关闭节流）逐格给码与零写入；另有同配置连跑三次结论一致的稳定性用例
- 新增 tests/empty-input-matrix.test.ts：四种空形态（空串 / 仅空白 / 缺字段 / 空集合）× 2 格 = 8 格，每格断码 + 零写入 + 状态不变
- 三张矩阵各带末尾计数断言（24 格 / 4 格 / 8 格），改枚举不补格必红
- 如实记下一处两层口径差异：无席位在纯函数层是 REQBOARD_NO_SEAT，在工具层落到 REQBOARD_NO_BOUND_REQ（绑定读先挡），写进文件头而不是强行统一
- 验收：三张矩阵 npx vitest run 退出码 0，共 19 用例全绿
- 反向演练：给空输入矩阵的枚举加一项而不补格 → 计数断言必红（1 failed / 8 passed），sha256 还原后复跑 19/19 绿

### 改动文件

- `tests/helpers/ledger-probe.ts`
- `tests/authorization-matrix.test.ts`
- `tests/concurrency-matrix.test.ts`
- `tests/empty-input-matrix.test.ts`

### 下一步

复核子卡核对三张矩阵的格数与三件套是否真的逐格生效；u7 把三张矩阵纳入反向演练组

---
