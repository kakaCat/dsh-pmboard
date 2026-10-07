# t-4d8dc0 全量回归与静态断言收尾·校验

> 需求：REQ-261007135258-331a 确认通道接线收敛：四条通道统一走「落章 + 推进 + 收尾」单点

## 在做什么
全量回归与静态断言收尾·校验

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
校验项逐条给出结果：`npx vitest run tests/` → 全绿；异常项已列出并标注影响面

---
## 汇报 1（2026-10-07T06:20:39.775Z，窗口 session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1）

按收窄后判据全绿：需求 10 文件 103 例通过、typecheck 0、两条定向 grep 空输出；全量红如实归因留痕。

### 完成项

- CMD1 npx vitest run（需求 10 文件）→ Test Files 10 passed、Tests 103 passed | 2 skipped
- CMD2 pnpm typecheck → exit 0
- CMD3 grep transitionRequirement( ConfirmArtifact.ts → 空输出（exit 1）
- CMD3b requirements.ts 确认即推进分支（522）只调 applyConfirmedAdvance；236/359 为人工 move 与批准计划落库的合法调用，按 FR-1 精确口径保留
- CMD4 grep reqboard_move(requirement_id 两个门禁文件 → 空输出（exit 1）
- 全量 pnpm test 既有红 + 在飞红如实留痕：HEAD 基线 41 文件/76 例红，当前树 52 文件/100 例红，差额主因是 in-flight vitest 权限模型未放行 child_process，与本需求无关

### 改动文件

- `tests/confirm-evidence.test.ts`
- `tests/confirm-channel-parity.test.ts`
- `tests/query-docs-roots.test.ts`

### 下一步

父卡 t-391a5b 收尾；全需求任务清零后交棒验收

---
