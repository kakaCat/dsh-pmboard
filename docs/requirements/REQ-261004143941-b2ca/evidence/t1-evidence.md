# t1 证据：进度接口补需求累计 token（REQ-261004143941-b2ca FR-1）

## 改了什么

| 文件 | 改动 |
|---|---|
| `src/http/routers/stages.ts` | `handleSessionProgress` 只装配一次 `const tokenView = assembleRequirementToken(target, { tasks })`；`nodeTokensOf(target, tasks)` → `nodeTokensOf(tokenView)`；`requirement` 增 `...(tokenTotal > 0 ? { tokenTotal } : {})`；导入 `type RequirementTokenView`，移除已不再使用的 `TaskRecord` |
| `tests/session-progress.test.ts` | 新增 TC-3a（快照 + 执行差值 → `tokenTotal === Σnodes === 104`）、TC-3b（无快照 → 键缺席） |
| `tests/progress-nodes-fallback.test.ts` | 新增 TC-3c（兜底夹具 → `tokenTotal === 39 === Σnodes`） |

## 命令与输出摘要

```
$ ./node_modules/.bin/vitest run tests/session-progress.test.ts tests/progress-nodes-fallback.test.ts
 ✓ tests/session-progress.test.ts  (6 tests) 26ms
 ✓ tests/progress-nodes-fallback.test.ts  (3 tests) 41ms
 Test Files  2 passed (2)      Tests  9 passed (9)
```

```
$ pnpm typecheck        # 基线 146 个 error（全在既有文件），本需求触碰的文件 0 个
$ grep -cE "error TS" evidence/typecheck-baseline.txt   → 146
$ grep -E "stages\.ts|session-progress|progress-nodes-fallback" evidence/typecheck-baseline.txt | wc -l → 0
```

## 真机数据取证（关键：绕开宿主未重载）

宿主把插件 `dist` 常驻内存，**改完 dist 不会换掉已加载模块**——实测重建后
`curl .../session/<sid>/progress` 仍返回旧形状（无 `tokenTotal` 键）。

故改用**进程内 + 真实数据根**取证（`evidence/probe-live-progress.mts`：真实
`ShardedRequirementStore(~/.dsh/reqboard)` + 真实 `QueueTaskStore` + 真实路由）：

```
$ ./node_modules/.bin/tsx docs/requirements/REQ-261004143941-b2ca/evidence/probe-live-progress.mts
session            = session-97bd3bf9-d995-4f61-81fa-9d72c58d40f8
requirement        = REQ-261004121649-bfa7 implementing
requirement.tokenTotal = 25321586 （键存在: true ）
Σ nodes[].tokens.total = 25321586
PASS：tokenTotal === Σ nodes（真数据、真路由、真队列）
```

**这条同时实证了设计里的 E-5**（为什么不能用记录上的 `tokenUsage.totals`）：
`REQ-261004121649-bfa7` 的记录总计 = 12,650,950（只含已离开的 draft/brainstorming/design/decomposing），
而 `tokenTotal` = 25,321,586 —— 差额 12,670,636 正是**仍在进行中的 implementing**
（只存在于任务执行差值兜底里）。用记录总计会让用户少看到一半消耗。

## 遗留（响亮记录，不静默）

- **宿主需重载后 curl 才能看到新字段**：当前运行中的宿主仍是旧 bundle（`dist/index.mjs` 已重建但未加载）。
  真机 curl 的期望输出形如 `tokenTotal=25321586 sumNodes=25321586`，宿主重载后即成立；t4 收口时复核。
- 旧客户端 / 无快照需求的行为不变：键缺席 → 前端不渲染（t2 落地渲染分支后由 TC-2b/2c 锁住）。
