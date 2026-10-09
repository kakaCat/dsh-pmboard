# 弹框不出现（`reqboard_capture` / `reqboard_ask_confirm` / 验收单）排查

> 面向**下一个看到"立项弹框点了没反应 / 返回用户未作答"的人**。先给结论：弹框请求是
> host→client 的 **remote 事件**，**必须可无损 JSON 往返**——任何值为 `undefined` 的键都会让
> 宿主网关**整条拒收**（浏览器侧收不到请求，弹框当然不出现，且酷似"UI 坏了"）。
> 机制性根因见 [弹框通道与无损 JSON 约束](../architecture/project-manual.md)。

## 症状

- 调用 `reqboard_capture` / `reqboard_ask_confirm` / 验收单弹框，弹框**不出现**
- 返回"用户未作答（取消 / 暂离）"或 `fallback=board`
- `available()` 为真、服务在场，却"什么都没发生"

## 判据

读诊断日志 `~/.dsh/state/reqboard-capture-diag.log`（pm 适配器的 `[UI-0..5]` 诊断都落在这里）：

| 日志形态 | 结论 |
|---|---|
| `[UI-5] … not lossless JSON data` | 弹框请求被网关**拒收**（本条目覆盖） |
| `[UI-5] code=REQBOARD_NO_UI` | 服务未注入（另一类问题，查 host 端 `ctx.inject`） |
| `[UI-3] svc.ask() 返回 answers=N` | 请求已**送达客户端**——问题在渲染（客户端侧） |
| 只有 `[UI-1]`、没有 `[UI-2]`/`[UI-4]` | 适配器 `ask`/`askTimed` 没被调用（上游用例问题） |

## 机制

- 弹框走 host→client remote 事件；宿主 `projectRemoteEventRequest` 把 `agent`/`signal` 之外的所有 own key **原样复制**，交 `isRemoteJsonValue` 校验。
- 判据（DSH `packages/typert/protocol/src/json-value.ts` 的 `visitJsonValue`）：**`undefined` / `NaN` / `Infinity` / `-0` / 循环引用 / 类实例全非法；`null` 合法**。
- 历史事故（REQ-261008103718-f1ea，2026-10-08 修复）：DSH 升级在 `UserQuestionService` 上新增 `askTimed(request, callId, timeoutMs)`，激活了适配器"宿主有 `askTimed` 就透传"的既有分支；透传固定传 `callId=undefined` → 整条请求被拒收。
- 同类隐患：`questions` 选项里 `description: cond ? '…' : undefined`（键存在、值为 undefined）在 `ask()` 路径上同样致命。

## 处置

1. 读诊断日志定位（见「判据」表）。
2. `not lossless JSON data` → 检查发给 `svc.ask` / `svc.askTimed` 的请求体：所有键值必须无损（无 `undefined` / `NaN` / `Infinity` / `-0`）。适配器出口已有 `stripUndefinedDeep` 兜底，但**上游写对才是正解**（条件展开，别用 `键: cond ? v : undefined`）。
3. 修复后 `pnpm build` + **重启 DSH**（host 端代码要重载），再原样重跑复现步骤。

## 非目标

| 你看到的情形 | 说明 | 去哪查 |
|---|---|---|
| `[UI-5] code=REQBOARD_NO_UI` | 服务未注入，不是请求被拒 | host 端 `ctx.inject(['userQuestions'], …)` |
| 有 `[UI-3]` 但弹框不渲染 | 请求已送达，问题在客户端 | `ui-user-questions` 包的 `PendingQuestion` / `QuestionComposer` |
| 弹框出现但**立即消失** / 之后 30 分钟不再弹 | 取消粘滞（3 次 cancel → 30 分钟不弹） | 等粘滞过期，或查为何被记 cancel（通道故障不该记 cancel） |
| 弹框出现但**选项点不动** | 交互问题，不是通道问题 | 客户端渲染 / 事件绑定 |
