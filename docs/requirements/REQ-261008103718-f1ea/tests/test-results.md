# 测试证据

> **TL;DR**：3 组测试证据覆盖全部 3 张任务卡；每组给出**可复核命令 + 实测结果**。
> 覆盖标注用 `covers: t-xxx`（RTM 覆盖度门禁据此计算，验收阶段要求 ≥80%）。

## TC-1 代码修复：移除 askTimed 透传 + 无损清洗 serves: FR-1
covers: t-c5da35

**执行时间**：2026-10-08
**结果**：✅ 通过

```bash
$ pnpm typecheck
# 通过（无错误）
```

**关键改动**（详见 [solution.md](../design/solution.md)）：
- `UserQuestionsAdapter.askTimed`：不再透传宿主 `svc.askTimed`（其 callId 参数传 undefined 会让 remote 请求被网关判 `not lossless JSON data` 并**拒收整条弹框请求**），一律走本地竞速 `ask()`——与官方 `tool-ask-user` 同款路径
- `capture-mapping.ts:137`：`description: i===0 ? '…' : undefined` → `...(i===0 ? { description: '…' } : {})`（源头不再产生 undefined 键）
- 新增 `lossless-json.ts`：`stripUndefinedDeep` 通道边界清洗（剔 undefined 键/项，保留 null，不碰类实例）

## TC-2 构建验证 serves: FR-1
covers: t-04b737

**执行时间**：2026-10-08
**结果**：✅ 通过

```bash
$ pnpm build
✔ Build complete in 918ms
wrapped dsh-pmboard -> lib/client.js 683035 bytes
[verify-client] OK  bundle=785060 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

$ node -e "const d=require('fs').readFileSync('dist/index.mjs','utf8');console.log('透传已移除:',!d.includes('svc.askTimed(request'))"
透传已移除: true
```

**关键判据**：client.js = 785060 bytes（与事故前一致，**不会**触发"禁用所有插件"安全模式恢复）；host 产物含 `stripUndefinedDeep` 与 `[UI-0..5]` 诊断。

## TC-3 端到端验证：弹框实测（先复现失败 → 修复后通过）serves: FR-1
covers: t-57b07b

**执行时间**：2026-10-08
**结果**：✅ 通过（修复前复现失败 → 修复后原样重跑通过）

**复现步骤（修复前，两次调用均失败）**：
1. 调用 `reqboard_capture`
2. 观察：弹框不出现，返回"用户未作答（取消 / 暂离）"
3. 诊断日志（`~/.dsh/state/reqboard-capture-diag.log`）：

```
[UI-1]: available() svc=true ask=function → true
[UI-5]: askWithBudget 抛错 code=<none> message=api gateway: Remote event request is not lossless JSON data
```

**修复后重跑（原样步骤）**：
1. `pnpm build` 后重启 DSH（加载新 host 产物）
2. 调用 `reqboard_capture`
3. 结果：**弹框在会话中渲染**，逐问作答，成功立项 REQ-261008112551-dd87（feature/expert），answers 完整、defaults_used=[]

```
[UI-4]: askTimed() 走本地竞速（宿主 askTimed=function，不透传…）
[UI-2]: ask() 调用 questions=1 → [UI-3]: svc.ask() 返回 answers=1
[UI-2]: ask() 调用 questions=3 gate=G0 → [UI-3]: svc.ask() 返回 answers=3
```

完整证据见 [diag-evidence.log](../diag-evidence.log)。

**回归测试**：

```bash
$ npx vitest run tests/ask-timed.test.ts tests/gate-aware-questions.test.ts tests/lossless-json-questions.test.ts tests/dialog-payload-lossless-guard.test.ts
Test Files  4 passed (4)
Tests  29 passed (29)
```
