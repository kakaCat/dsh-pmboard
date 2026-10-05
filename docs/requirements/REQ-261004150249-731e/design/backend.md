---
req_id: REQ-261004150249-731e
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 后端设计（REQ-261004150249-731e）

> `sides: backend` ⇒ 本需求**无前端改动**：看板「改绑到本窗口」按钮已存在，本次只修它的副作用。
> 全部改动落在 host 侧（adapters / application / tools / 组合根）。

## 改动清单（逐文件，带现状锚点） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| # | 文件 | 现状 | 改动 |
|---|---|---|---|
| 1 | `src/adapters/SessionWindowOpener.ts:76-87` | `create()` 调 `svc.create({})` | `create(opts?: {cwd?, workspaceId?})`；按 opts 组装请求（二者互斥，都空 → 报 `open_failed` 且**不调用**宿主） |
| 2 | `src/adapters/SessionWindowOpener.ts`（新增方法） | — | `resolveSourceProject(sourceSessionId)`：`workspaceRegistry.list()` → `{workspaceId}`；否则源 `header.cwd` → `{cwd}`；都没有 → `undefined` |
| 3 | `src/application/ports.ts`（`WindowOpenerPort`，:601） | `create(): Promise<OpenWindowOutcome>` | 签名加 `opts?`；`resolveSourceProject?` 可选方法（替身可不实现） |
| 4 | `src/application/use-cases/OpenWindow.ts:57-97` | `opener.create()` 无参 | `mode=create` 时先解析源项目；解析不出 → `reject(..., 'REQBOARD_OPEN_WINDOW_UNAVAILABLE')` |
| 5 | `src/application/use-cases/CaptureRequirement.ts:145` | `opener.create()` | 同上（UC-7） |
| 6 | `src/application/internal/binding-write.ts:34-49` | `applyRebind` 只改 `sourceSessionId` | 委托给新的 `handoffOwner`（见 #7），保持留痕文案口径 |
| 7 | `src/application/internal/handoff-write.ts`（新增） | — | `handoffOwner(req, { toWindow, fromWindow, actor, at, commentId, reason })`：一次 mutate 内完成席位升降 + `sourceSessionId` + 留痕；返回 `changed` |
| 8 | `src/application/internal/handoff-policy.ts`（新增） | — | `decideHandoff(pressure, cfg)` 纯函数（三档 + `unknown`），零 IO、零依赖 |
| 9 | `src/application/use-cases/HandoffOwner.ts`（新增） | — | 编排：授权 → 开窗 → `handoffOwner` → 投递底稿 → 回执 |
| 10 | `src/tools/HandoffTool/`（新增 `HandoffTool.ts` + `prompt.ts`） | — | `reqboard_handoff` 薄壳（schema + 摘要渲染） |
| 11 | `src/tools/index.ts` | 既有导出 | 导出 `defineHandoffTool` |
| 12 | `src/plugin-config.ts:243` 附近 | `seatsMaxSetting` 写法可照抄 | `handoffSettings(config)`：三档解析 + 非法装配期抛错 |
| 13 | `src/index.ts:669` 附近（`useCaseDeps`） | 只有 `windowOpener` | 加 `crossWindowDeliver: deliverer`（**一行装配**，FR-4 的全部实现） |
| 14 | `src/index.ts:673` 附近 | `windowOpener: new SessionWindowOpener(() => sessionControllerSvc)` | 注入 `workspaceRegistry`（`ctx.inject(['workspaceRegistry'], …)`，与 `sessionController` 同款惰性解析） |
| 15 | `src/index.ts:735` 附近（工具注册区） | 注册 `defineOpenWindowTool` / `defineBindTool` | 注册 `defineHandoffTool(useCaseDeps)` |

## 装配点细节 `serves: FR-1, FR-4`

```
ctx.inject(['workspaceRegistry'], (ws) => { workspaceRegistrySvc = ws.workspaceRegistry })

useCaseDeps = {
  …,
  windowOpener: new SessionWindowOpener(() => sessionControllerSvc, () => workspaceRegistrySvc),
  crossWindowDeliver: deliverer,        // AgentDeliverer 已实现该端口（含冷会话 resume）
  handoff: handoffSettings(config),     // { warn, fork, critical }
}
```

**为什么用惰性回调**：与 `sessionController` / `agents` 同款——装配期回调未必送达，
"装配期拿不到 ≠ 永远拿不到"（既有注释 `index.ts:437` 已把这条纪律写死）。

## 兼容、灰度与回滚 `serves: FR-1, FR-2, FR-3`

| 面 | 缺省行为（不配置即现状） | 回滚 |
|---|---|---|
| 开窗 | `create()` 不传 opts 时请求体与改造前一致 | 回退 `OpenWindow.ts` 的解析调用即可（端口 `opts` 可选） |
| 交接 | 无人调用 `reqboard_handoff` / 看板改绑则零副作用 | 看板改绑回原窗口（幂等） |
| 判据 | 未配置 → `0.75/0.85/0.90`；无后台自动行为 | 删除 `handoff-policy` 调用点 |
| 投递 | `crossWindowDeliver` 未装配 → 交接照旧成立、投递如实报未装配 | 摘掉 `useCaseDeps.crossWindowDeliver` 一行 |

**数据侧**：无迁移脚本；存量记录在第一次交接时物化 `seats`（与读端折算语义等价）。

## 风险与对策 `serves: FR-2, FR-3`

| 风险 | 对策 |
|---|---|
| 两个窗口同时自称 owner（并发交接） | `handoffOwner` 在 `mutate` 内复查前置（当前 owner == 调用窗口），不满足即整条放弃 |
| 阈值过敏感导致频繁开窗 | 只在阶段边界执行 + `pendingHandoff` 不落库实时重算 + `warn` 档只提示不开窗 |
| 新窗口仍需旧窗口的"只在会话里的"上下文 | 投递断点 + 节点输入包（自足契约，`internal/node-input-package.ts` 既有设计）；不是本需求新引入的假设 |
| `resolveSourceProject` 抛错被吞 | 三级降级后返回 `undefined` ⇒ 调用方**响亮失败**（不静默落宿主目录） |

## 自证命令 `serves: FR-6`

```bash
./node_modules/.bin/vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts
npx tsx scripts/handoff-probe.mts
npx tsc --noEmit
pnpm build
```
