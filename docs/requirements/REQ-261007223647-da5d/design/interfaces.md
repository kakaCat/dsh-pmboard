---
doc: design/interfaces
req: REQ-261007223647-da5d
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 接口设计（REQ-261007223647-da5d · 轻档）

## 接口清单 · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

| 接口 id | 形态 | 职责 | serves |
|---|---|---|---|
| IF-1 | 纯函数（capture-mapping） | 立项弹框题目构造：4 问、推荐首项 label 后缀、✖️ 末位、一键过选项 | FR-3, FR-4 |
| IF-2 | 纯函数（capture-mapping） | 答案映射：剥（推荐）后缀、location 合成答案拆分 workspace/docBasePath | FR-3 |
| IF-3 | 适配器方法（UserQuestionPort） | `askTimed`：透传宿主限时等待，超时返回 pending 结果 | FR-1 |
| IF-4 | 用例内部分支（gate-request） | reused + redispatch：同 ticket 重发弹框通知 | FR-1, FR-5 |
| IF-5 | HTTP GET /state（board） | 载荷增 `pending_confirms[]`（含派生 remaining_ms 所需字段） | FR-5 |
| IF-6 | 适配器（state 文件） | capture-interactions.json 读写（record/readAll/recentByKind） | FR-2 |
| IF-7 | 纯函数（open-doc） | absolutizeDocPath 根诊断（rootSource 读出）+ 面板红字标注 | FR-6 |

## IF-1 弹框题目构造 · serves: FR-3, FR-4

```ts
buildCaptureIntentQuestions(titleOptions: readonly string[], ctx: { reasonLine: string }): AskQuestion[]
buildCaptureDetailQuestions(ws: { sessionCwd: string; hostCwd: string }): AskQuestion[]  // 3 问
```

- 第一段 1 问（name）：question = `建议立项：《<titleOptions[0]>》——<reasonLine≤60字>`；
  options 顺序 = [候选A`（推荐）`, 候选B, 候选C, ⚡全部按推荐值立项, ✖️不需要立项(末位, description 写「本次不创建；30 分钟内本窗口不再弹立项框」)]；
- 第二段 3 问：category（选项 label 枚举原值 + 首个 description 标推荐）、difficulty（算力档位四档，说明算力代价）、location（label = 拼好的绝对路径预览，见 IF-2 逆运算）；
- 错误语义：titleOptions 空 → question 退化为「需求名称（自定义输入）」，无推荐项（现状兼容）。

## IF-2 答案映射 · serves: FR-3

```ts
mapCaptureAnswers(answers: readonly AskAnswer[]): CaptureMapping  // 增 acceptAllRecommended: boolean
stripRecommendSuffix(label: string): string  // /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i
```

- 所有选项值先 `stripRecommendSuffix` 再严格相等校验（防静默回落默认）；
- 命中「⚡ 全部按推荐值立项」→ category/difficulty/location 全走 CAPTURE_DEFAULTS 并全记 defaultsUsed；
- location 拆分规则：作答为绝对路径且以 sessionCwd/hostCwd 为前缀 → workspaceRoot=前缀, docBasePath=余下相对段；
  作答为相对段 → workspaceRoot=sessionCwd（哨兵语义内化）；自定义绝对路径不含已知根 → workspaceRoot=该路径,
  docBasePath=缺省（回执 defaults_used 如实说明）；绝对路径不存在 → REQBOARD_INVALID_WORKSPACE（沿用）。

## IF-3 askTimed · serves: FR-1

```ts
UserQuestionPort.askTimed(questions, opts: { agent?; signal?; gate?; timeoutMs: number }):
  Promise<{ kind: 'answered'; answers: readonly AskAnswer[] } | { kind: 'pending' }>
```

- 宿主 `askTimed(request, callId, timeoutMs)` 的透传；timeoutMs ∈ (0, 2^31) 整数，越界 → BAD_TIMEOUT 上抛为 REQBOARD_INVALID_INPUT；
- 上层约定 `timeoutMs = min(配置宽限, 工具预算 − 2000)`；pending 结果 ≠ 错误（不抛、不记 cancel）。

## IF-4 redispatch · serves: FR-1, FR-5

`requestGate` reused 分支增入参 `redispatch?: boolean`：true → 对既有 open ticket 重发弹框通知
（零台账写入、不续期、不新建门）；HTTP 路由 `POST /confirms/:ticket/repost`（窗口内 ticket 才受理，
404 用 REQBOARD_UNKNOWN_TICKET 同码）。

## IF-5 看板 pending 载荷 · serves: FR-5

`/state` 响应增 `pending_confirms: [{ ticket, requirement_id, target, kind?, created_at, interrupted }]`；
remaining_ms = TTL − (now − (interrupted_at ?? created_at)) 由 client 推导；无 pending → 空数组（不省略键）。

## IF-6 取消留痕 · serves: FR-2

```ts
interface CaptureInteractionPort {
  record(entry: { windowKey: string; kind: 'reject' | 'cancel' | 'timeout'; at: number }): void
  readAll(): Promise<readonly CaptureInteraction[]>
}
```

- 文件 `state/capture-interactions.json`（ring buffer 200 条，原子写，与 capture-rejections 同款）；
- 读时合并旧 `capture-rejections.json`（kind 缺省视为 reject）——旧留痕不丢；
- `recentCancels(windowKey, now, 30min) >= 3` → 不再弹框 + 回执提议看板。

## IF-7 根诊断 · serves: FR-6

```ts
absolutizeDocPath(path: string): string            // 签名不变（兼容）
peekLastRootSource(): 'req-root' | 'session-root' | 'server-root' | 'none'  // 新增只读诊断
docLocationHtml(view, reqId): string               // rootSource ≠ req-root → 红字「地址可能不准（根来源：X）」
```

错误语义：诊断只读不抛；红字是展示层增强，不改变打开行为（打开仍走现状三级回落）。
