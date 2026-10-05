# REQ-261002153446-c600 测试用例与任务覆盖映射

> 本文件的两个用途：① 人读的用例清单；② RTM 测试覆盖度的机器读入口
> （每个 `## TC-n` 下用 `covers: t-xxx` 标注本用例覆盖了哪张任务卡，`validates: FR-x` 标注验的是哪条功能点）。
> 实际执行命令与输出摘要见 [tests/test-evidence.md](tests/test-evidence.md)。

## TC-1: 已归档会话点击后先取消归档、再收面板开会话

- covers: t-30f65b, t-ccf428
- validates: FR-1, FR-4
- 怎么跑：`npx vitest run tests/session-jump.test.ts`
- 期望：返回 `opened`，时间线 `unarchive:s-arch → selectPanel:null → openSession:s-arch`

## TC-2: 取消归档抛错时不打开会话（不假装跳过去了）

- covers: t-30f65b, t-e5fd69
- validates: FR-2
- 怎么跑：同上
- 期望：返回 `restore-failed`，时间线不含 `openSession`

## TC-3: 客户端无取消归档能力时保留旧语义

- covers: t-ccf428, t-e5fd69
- validates: FR-2
- 怎么跑：同上
- 期望：返回 `archived`，时间线为空（不收面板、不开会话）

## TC-4: 未归档会话零副作用（不误调恢复能力）

- covers: t-30f65b, t-e5fd69
- validates: FR-4
- 怎么跑：同上
- 期望：时间线 `selectPanel:null → openSession:s-target`，不含 `unarchive`

## TC-5: 已归档 chip 的 title 写明点击会发生什么

- covers: t-54bec3, t-2c76c3, t-8e6f26
- validates: FR-3
- 怎么跑：`npx vitest run tests/board-info-fixes.test.ts`
- 期望：HTML 含 `data-archived="true"`、`is-archived`，title 含「点击取消归档并打开」

## TC-6: 跳转结果文案齐备（恢复失败/能力缺失/服务不可用）

- covers: t-54bec3, t-2c76c3, t-8e6f26
- validates: FR-2
- 怎么跑：同上
- 期望：`restore-failed` 含「取消归档失败」「未跳转」；`archived` 含「已归档」；`unavailable` 含「暂不可用」

## TC-7: 兼容与回归（客户端面全绿 + 类型 + 客户端构建）

- covers: t-b7b87a, t-3457a2
- validates: FR-5
- 怎么跑：`npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts tests/client-view.test.ts tests/archived-entry.test.ts`、`npx tsc --noEmit`、`npm run build:client`
- 期望：95 passed / 0 failed；改动文件零类型错误；`[verify-client] OK`
