# 开新窗口续作：落点、交接与投递（L2 领域篇）

> **TL;DR**：窗口顶到上下文墙时要把需求交给一个新窗口继续干，这条链路由**三件独立的事**组成——
> ① 新会话**落在原项目**（`workspaceId` 优先，拿不到就响亮失败）；② **owner 交接**是一次原子写
> （新窗 owner / 旧窗 observer / `sourceSessionId` 同步 / 留痕一条，失败不留半个）；③ **接续投递**
> （断点 + 节点输入包，自署来源，绝不为 `user`）。判据是**水位三档 + 阶段边界优先**，
> 读数缺席一律 `unknown`——**不猜、不补 0、不自动交接**。
> 三条最贵的教训：**两套口径会互相说谎**（席位 vs `sourceSessionId`）、**回执会假成功**
> （只改绑定不改席位）、**"没实现"与"没装配"长得一样**（端口有实现、组合根没接线）。

## 一、为什么需要它（根因备忘）

- 长需求（brainstorming → design → decomposing → implementing → accepting）经常比**一个窗口的上下文寿命**更长。
- 这套 profile 里 DSH 自动压缩是**关的**（后置链日志实测 `h2-compact=skip（compaction_disabled）`）⇒ 到顶就是硬停。
- 2026-10-04 实机病灶（用户现场：「打开另外一个会话，继续这个项目」）：`reqboard_open_window(mode=create)`
  造出的会话 `cwd = /Users/mac/.dsh/profiles/desktop`（**宿主进程目录**）、未挂任何 workspace ⇒ 侧栏落「未分组」，
  且在它里面做任何 pmboard 写操作都被 `PROJECT_ROOT_MISMATCH` 拒绝。
  根因两层：`create()` 没传落点（DSH 回落到 `defaultCwd = 宿主 process.cwd()`），
  而 owner 又**不可转交**（新窗口最多是 worker，推不动阶段、过不了人工门）。

## 二、三件事与判别式

| 事 | 契约 | 落在哪 |
|---|---|---|
| ① 落点 | 优先源会话所属 **workspace**（DSH 会连带 `attachSession`，侧栏直接归该项目）；其次源会话 **cwd**；都拿不到 → `REQBOARD_OPEN_WINDOW_UNAVAILABLE` 且**不建会话** | `adapters/SessionWindowOpener.ts` + `use-cases/OpenWindow.ts` |
| ② 交接 | 一次 mutate：新窗 **owner** / 旧窗 **observer**（不退席）/ `sourceSessionId` 同步 / 留痕一条；幂等（无变化不写盘） | `application/internal/binding-write.ts` 的 `handoffOwner` |
| ③ 投递 | 断点 + 节点输入包；消息 **自署 kind**（`reqboard-handoff`），**永不为 `user`**；失败**不回滚**交接但如实回报 | `use-cases/HandoffOwner.ts` + `Delivery` 端口 |

**判别式（`application/internal/handoff-policy.ts`）**：

```
ratio = pressureTokens / contextWindow        # 都要在场，且 source === 'projection'
ratio ≥ critical(0.90) → critical   # 不等阶段边界，立即交接（兜底）
ratio ≥ fork(0.85)     → fork       # 到阶段边界时交接；未到边界则等（pendingHandoff 不落库）
ratio ≥ warn(0.75)     → warn       # 写断点 + 预告，不开窗
否则                    → none
任一字段缺席 / 来源非投影 → unknown  # 不猜、不补 0、不自动交接
```

三档可配（`handoff: { warn, fork, critical }`，非法在**装配期**抛错）；**未配置即现状**，
且**不存在任何后台自动行为**（没有定时器、没有扫描）。允许 agent 自主交接的只有 `fork` / `critical` 两档。

## 三、三条不变量（交接的"不许"）

| 编号 | 不变量 | 违反症状 |
|---|---|---|
| INV-1 | 任一记录至少一个 owner | 记录对所有人不可见也不可写 |
| INV-2 | 席位里的 owner `windowKey` **等于** `sourceSessionId` | 授权说 A、会话标题栏流程图锚点说 B（**实机踩过**：看板改绑只改绑定不改席位，回执 `rebound:true` 却是假成功） |
| INV-3 | 交接前后 owner 恰好一个 | 两个窗口都自称 owner |

## 四、投递：一个容易看错的"缺口"

`CrossWindowDeliveryPort` 的**实现早就存在**（`adapters/AgentDeliverer.ts` 的 `createMessage` / `deliver`，
含冷会话 resume），但 `useCaseDeps.crossWindowDeliver` **从未被赋值** ⇒ 表现为"能力不可用"。
**FR-4 的全部实现就是组合根里的一行装配**。
可复用教训：**端口有实现 ≠ 能力可用**——排查"某能力不好使"时，先看组合根有没有把它接上。

## 五、实机证据与复现命令

```bash
npx tsx scripts/handoff-probe.mts        # 临时台账真跑交接 + 看板改绑；五读数 from/to/old_role/new_role/source_session
./node_modules/.bin/vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts tests/open-window-project-root.test.ts
```

- 探针退出码 0，且跑前后对 `~/.dsh/reqboard` 做快照比对（**零写入**）。
- 反向演练四条：落错项目（拿不到落点则零调用）、假成功（显式席位记录经改绑后席位真换）、
  读数缺失（不自动交接）、半截交接（注入异常四处不变）。
- **产物生效链**：改 `src` ≠ 改现场——宿主加载启动时的构建，`reqboard_status` 的 `plugin_build`
  可核对陈旧态（本次宿主为 `8d03c8f413b9`，故实机四步需重启后执行）。

## 六、已知边界（写清不做什么）

- **不做**并行分叉（多 worker 窗口分卡抢活）——本次只解决"顶墙续作"。
- **不做**让会话标题栏流程图路由认席位——本次靠交接**同步改写** `sourceSessionId` 对齐两套口径。
- **不做** `reqboard_kb` 的项目根解析修复（2026-10-04 实测它把根解析成 `/Users/mac/.dsh/profiles/desktop`，
  而 `docs/knowledge/` 明明在仓内）——同根因类，另立项。
- 设计里「重复调用只补投递」在授权规则下**不可达**（原窗口已降 observer、新窗口传自己会被"不能等于源"拒）；
  要恢复需显式加一个 `redeliver` 例外，留待后续裁定。

## 七、可复用的教训（写给下一个改这里的人）

1. **两套口径必然互相说谎**：授权读 `seats`、流程图锚点读 `sourceSessionId`。要么写死不变量（本页 INV-2），
   要么删掉一套——别指望两处各自维护还一致。
2. **回执可能假成功**：只改一半（绑定改了、席位没改）时接口照样返回成功。**判据要落在"人真正在意的那一处"**
   （这里：席位里谁是 owner），而不是落在"我确实写了一个字段"。
3. **"没实现"与"没装配"长得一样**：先把组合根读一遍，再决定要不要新写适配器。

## 参考

- 需求与全部产物：`docs/requirements/REQ-261004150249-731e/`（requirement / design 六份 / decomposition /
  tasks 34 张 / reviews / tests / verification）
- 相关：`docs/handoff/multi-window-collaboration-draft.md`（**已作废**的多窗口协作草稿，仅留痕）、
  `docs/architecture/automation-chain-contract.md`（自动链与 owner 契约）、
  `docs/architecture/subtask-stage-template.md`（子卡阶段模板）
