# 选项 A 补丁（未应用）：修复 `reqboard_clear_pause` 的两处接线

> 状态：**已应用（2026-10-02）**。落地记录见文末；仍差一次**插件重载 / 宿主重启**才在运行时生效（插件 link 装载，宿主无文件监听）。
> 作用：解开 REQ-261002110908-81d0 当前死锁的唯一自服务入口（Dive armed → 禁止手动拆分 → 只能先解锁）。

## 一、为什么坏

| # | 缺陷 | 后果 | 位置 |
|---|---|---|---|
| 1 | 窗口身份取 `context.session?.id`，而本仓其它工具一律走 `deps.session.windowKey(exec)`（`agentIdFromExec` 的同一入口） | **病根是类型级的**：`ToolRunContext` 上根本没有 `session` 属性（基线 tsc 原文 TS2339）→ 该表达式恒为 undefined → windowKey 恒为 'unknown' → openRequirementsFor 永远找不到需求 → REQBOARD_NO_BOUND_REQ。**这个解锁口从来没有工作过**，不是某个通道取不到 | [ClearPauseTool.ts:42](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/tools/ClearPauseTool/ClearPauseTool.ts#L42) |
| 2 | 参数被声明成**嵌套 `schema` 对象** | 调用方只能传 `{schema:{requirement_id}}`，而用例读的是 `args.requirement_id` → `requirement_id` **永远传不进去** | [ClearPauseTool.ts:18](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/tools/ClearPauseTool/ClearPauseTool.ts#L18) |

已知留债（仓库里有明文）：*「例外是显式留债：clear_pause 仍是旧式写法，其修复属需求级工具治理」*（tests 内注释）。

## 二、提案补丁

```diff
--- a/src/tools/ClearPauseTool/ClearPauseTool.ts
+++ b/src/tools/ClearPauseTool/ClearPauseTool.ts
@@ -16,15 +16,10 @@ export function defineClearPauseTool(deps: UseCaseDeps) {
     description: CLEAR_PAUSE_PROMPT,
     parameters: {
-      schema: {
-        type: 'object',
-        additionalProperties: false,
-        properties: {
-          requirement_id: {
-            type: 'string',
-            description: '需求 id（REQ-xxxxxx）；不传则默认本窗口绑定的需求'
-          }
-        }
+      requirement_id: {
+        type: 'string',
+        description: '需求 id（REQ-xxxxxx）；不传则默认本窗口绑定的需求'
       }
     },
@@ execute
     async execute(input, context: ToolRunContext) {
-      const windowKey = context.session?.id ?? 'unknown'
+      // 与其它工具同源：窗口身份从 exec 上下文解析（deps.session.windowKey），
+      // 而不是 context.session?.id —— 后者在工具桥/PTC 通道为空，会退化成 'unknown'。
+      const windowKey = deps.session.windowKey(context)
       return await clearPause(deps, windowKey, input)
     }
```

**影响面**：`clearPause` 的调用方只有这一个工具壳（全仓 grep 确认）；`ClearPause.ts` 用例本体不改。
**验证**：

1. `npx vitest run` 失败数 ≤ 基线 98（见 [baseline-2026-10-02.md](baseline-2026-10-02.md)）；
2. `npx tsc --noEmit` 错误数 ≤ 197；
3. `pnpm build` 退出码 0（宿主侧插件产物）；
4. 端到端：`reqboard_clear_pause({requirement_id:"REQ-261002110908-81d0"})` → `dive.activation=disarmed` → `reqboard_decompose(tasks=[5 张])` 落库成功。

## 三、注意（别把它当成"顺手修"）

- 这是**范围外改动**：属"需求级工具治理"，与 REQ-261002110908-81d0 的三条 FR 无关；
  本次仅为解除死锁而动它，建议同时在独立 bug 需求里正式收口（含用例）。
- 另一处**产品缺陷不在本补丁范围**：看板「拆分」恢复入口走同一个 `executeDecompose`，
  在 Dive armed 时同样被拒（[requirements.ts:444](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/http/routers/requirements.ts#L444)）——
  「自动开跑失败」的恢复通道被自己的 Dive 门堵死，这才是本次死锁的结构性原因。
## 落地记录（2026-10-02，窗口 session-be1bdc3d）

| 项 | 内容 |
|---|---|
| 改了什么 | `src/tools/ClearPauseTool/ClearPauseTool.ts`：① parameters 从嵌套 `schema` 改回顶层 `requirement_id`；② `context.session?.id` → `deps.session.windowKey(context)`；③ 补 `as any` 与参数类型标注（与其它工具同款） |
| 连带清债 | `tests/tools-schema.test.ts`：把 `LEGACY_PARAM_SHAPE` 里的 `ClearPauseTool` 移出（该门禁原把它当"显式留债"并断言它保持旧形状）→ 标记集清空，门禁对**全部**工具生效 |
| 测试 | `npx vitest run tests/tools-schema.test.ts` → 42/42 通过；全量 `npx vitest run` → **49 文件 / 98 用例失败 = 基线**（零新增），通过 2991→3001 |
| 类型 | `npx tsc --noEmit` → **194（基线 197）**：零新增，且顺带修好基线里 ClearPauseTool 的 3 个错误（含 TS2339 `Property 'session' does not exist on type 'ToolRunContext'`） |
| 构建 | `pnpm build` exit 0；`dist/index.mjs` 已含 `windowKey(context)` |
| 仍未生效 | 插件是 link 装载且宿主**无文件监听** → 需**重载插件 / 重启 DSH** 才在运行时生效 |
| 生效后的用法 | `reqboard_clear_pause({ requirement_id: "REQ-261002110908-81d0" })` → `dive.activation=disarmed` → 随后 `reqboard_decompose(tasks=[5 张])` 落库 |
| 欠账 | 本修复**没有单测**（唯一用例是形状探针，已随构建删除）；按仓库约定，补用例归入「另立项治理」的 bug 需求 |