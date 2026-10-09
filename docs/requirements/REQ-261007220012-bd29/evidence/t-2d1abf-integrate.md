# S2 联调证据（t-2d1abf · REQ-261007220012-bd29 FR-2）

日期：2026-10-07 · 阶段：联调（integrate）

## 链路：挂起 → ticket → 取回执 → 台账事实

| 环节 | 请求样例 | 期望响应 | 实际 |
|------|----------|----------|------|
| 起门（非阻塞） | `ask_confirm({target:'artifact', kind:'requirement', inline_grace_ms:20})` | `pending=true` + `ticket=pc-…`，台账产物未落章 | ✓（ask-confirm-pending TC-7 起段） |
| 取回执（未作答） | `ask_confirm({ticket})` | `success=true / confirmed=false / advanced=false / note 含「尚未作答」` | ✓ |
| 取回执（已作答肯定） | 后台落章推进后 `ask_confirm({ticket})` | `confirmed=true / advanced=true / from=brainstorming / to=design` | ✓（TC-7） |
| 取回执（否定作答） | 后台选「暂停」后 `ask_confirm({ticket})` | `confirmed=false / advanced=false / user_choice='暂停'` | ✓ |
| 未知 ticket | `ask_confirm({ticket:'pc-无'})` | 抛 `REQBOARD_UNKNOWN_TICKET` | ✓（TC-8） |
| 跨窗口 ticket | 别的窗口注册的 ticket | 抛 `REQBOARD_UNKNOWN_TICKET` | ✓ |
| 被中止的挂起 | `markInterrupted` 后 `ask_confirm({ticket})` | 全键等于期望（含「本次等待已被中止」note） | ✓（pending-guard-integration 联调①） |
| 过期基准 | `(interruptedAt ?? createdAt) + ttl` | 越过才报 `REQBOARD_UNKNOWN_TICKET` | ✓（联调③） |

## 注册面/接线圈

```
registry 条数 = 25 / 磁盘工具目录 = 25 / src/index.ts register = 25   （I-1/I-2 一致）
ask_confirm parameters.properties 含 ticket（取回执模式）；target 由 required 改可选
```

命令与结果：

```
$ npx vitest run tests/pending-guard-integration.test.ts tests/ask-confirm-pending.test.ts \
      tests/ask-confirm-blocking.test.ts tests/apply-wiring.test.ts tests/registry-log.test.ts
→ Test Files 5 passed (5) / Tests 38 passed (38)，exit 0
```

## 结论

取回执链路的九个环节与旧独立工具逐项同效；注册面三处口径一致；
schema 放宽（target 可选）不影响发起确认路径的拒绝语义（用例层仍校验）。
