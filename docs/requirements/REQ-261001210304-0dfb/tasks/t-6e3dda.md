# t-6e3dda 挂载接缝按记忆回填并同步工具条与滚动·测试

> 需求：REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

## 在做什么
挂载接缝按记忆回填并同步工具条与滚动·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-01T13:44:20.635Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

t2 测试阶段通过：本卡涉及的 41 条用例全绿；全量测试与类型检查的失败数均与开工前基线相同（98 failed / 195 tsc 错误，全部为仓库存量问题），未引入新失败。

### 完成项

- npx vitest run tests/dag-view-state.test.ts tests/dag-view.test.ts → 41 passed（12 + 29），本卡改动的两套用例全绿
- 全量基线（pnpm test 等价命令 npx vitest run --reporter=dot）：Test Files 49 failed | 246 passed | 3 skipped；Tests 98 failed | 2924 passed | 20 skipped——全部为仓库存量失败（例如 RandomIdFactory 期望 REQ-[0-9a-f]{6}、failure-alert 适配器），与本卡改动无关；本卡未新增任何失败文件
- npx tsc --noEmit -p tsconfig.json：改动文件（dag-view.ts / dag-mount.ts / dag-view-state.test.ts）零新增错误，仓库既有 195 条历史错误不变
- 兼容承诺验证：不传 opts 的挂载路径行为与改造前一致（既有 29 条 dag-view 用例逐条通过，含实例表隔离/释放时机/事件委托）

### 改动文件

- `src/client/views/dag-view.ts`
- `src/client/dag-mount.ts`
- `tests/dag-view-state.test.ts`

---
