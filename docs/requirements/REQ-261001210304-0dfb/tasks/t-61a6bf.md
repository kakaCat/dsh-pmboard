# t-61a6bf 探针翻转 + 全量回归与构建验证·校验

> 需求：REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

## 在做什么
探针翻转 + 全量回归与构建验证·校验

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
校验项逐条给出结果：`npx vitest run <校验用例>` → 全绿；异常项已列出并标注影响面

---
## 汇报 1（2026-10-01T13:51:19.137Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

t5 校验阶段通过：复现探针已从「复现缺陷」翻转成「证明已修」并跑通；六套用例 102 条全绿；全量失败数与基线持平；类型检查与客户端构建均通过——唯一未自动化的是真实浏览器的滚动/页签手工确认（已写成 5 步验证清单）。

### 完成项

- 探针翻转并跑通：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → A-2 状态保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（exit 0）；同步给探针加了 wrap 桩，把滚动还原也纳入断言
- 六套必跑用例：npx vitest run tests/dag-view-state.test.ts tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-refresh.test.ts → 6 passed / 102 passed
- 全量回归与基线对比：失败数 98 = 开工前基线 98（全部为仓库存量问题：RandomIdFactory 的 REQ-[0-9a-f]{6} 期望、failure-alert 适配器等）；本需求新增 24 条断言全部通过
- 类型检查：npx tsc --noEmit -p tsconfig.json → 本次 8 个改动/新增源文件零错误；仓库总量 191 条历史错误（工作区含其他窗口改动，非本次引入）
- 客户端构建：pnpm build:client → 退出码 0，[verify-client] OK bundle=333950 bytes，关键符号齐全、样式归属章在场、CSS 分片完整
- 运行日志落盘：docs/requirements/REQ-261001210304-0dfb/evidence/run-log.md（含修前/修后探针输出、基线表、构建摘要、以及唯一未自动化项 A4 的人工验证 5 步）

### 改动文件

- `docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts`
- `docs/requirements/REQ-261001210304-0dfb/evidence/run-log.md`

---
