# 后端设计 · REQ-261006164732-6503 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 关注点：调用顺序、失败表现、并发与幂等、代码落点。本需求是**纯后端**改动（`sides: [backend]`）。

## B-1 调用顺序（不可换序） <!-- serves: FR-1 -->

```
submit(kind=requirement|plan)
  ├─ 校验 / 登记产物 / 通知
  ├─ requestGate(...)            ← 唯一性判定在此，必须在任何副作用之前
  │    ├─ reused          → 不弹框（写"未弹框原因"）
  │    ├─ already-settled → 不弹框
  │    └─ opened          → 登记门 → 交付弹框（fire-and-forget 或 await，随调用通道）
  └─ 组装回执（note 分支按 I-7）
```

铁律：**唯一性判定早于一切副作用**——不登记门、不写台账、不弹框、不改门归属。判定是纯读，因此可以在回执组装前任意位置调用。

## B-2 复用路径：返回什么、不做什么 <!-- serves: FR-1, FR-2 -->

| 做 | 不做 |
|---|---|
| 返回 `pending=true` + **原** ticket；note 指明"已有一道门在等" | 不弹框（弹框端口调用次数为 0 是判据） |
| 让调用方拿 ticket 去 `reqboard_confirm_receipt` | 不登记新票（票表计数不变） |
| — | 不 `settle` / 不 `markInterrupted` / 不改 `createdAt`（不续期） |
| — | 不写台账、不改门归属窗口（首建者持有 `windowKey`） |

## B-3 异门陈旧票为什么仍要清 <!-- serves: FR-1 -->

挂起门会拦四条写路径（`reqboard_submit` / `reqboard_decompose` / `reqboard_move` / `reqboard_task_move`）。
若旧门是**别的门**（例如上一步的设计门）而人已走开，窗口会被钉死到 TTL（30 分钟）——这是既有
FR-9/FR-11 清理逻辑存在的理由。

本需求把清理**分门**：**同门复用优先**（不清）、**异门照清**。这条优先级与既有"登记新票前清理"的口径冲突处，
以"同门复用优先"为准——因为清掉同门旧票正是今天双弹框的近因之一。

## B-4 条件写的两个前提与失败表现 <!-- serves: FR-4, FR-5 -->

| 前提 | 判定 | 不满足时 |
|---|---|---|
| 门仍 open | 该 ref 的运行记录 `outcome === undefined` | 走 `recordStaleAnswer`：留痕 + 中性回执，**不抛** |
| 需求仍在该门的来源阶段 | `req.status === sourceStageOf(target, kind)`；来源阶段由 `ARTIFACT_CONFIRM_GATES` **反查**（不另写映射表，防两处口径分叉） | 同上 |

失败表现（禁静默降级）：回执 `success:true, confirmed:false, advanced:false` + `note` 写明
"已被取代 / 需求已推进到 `<status>`"；评论里留一条可核验痕迹（谁、何时、作答被忽略、为什么）。

## B-5 提示词与文案的落地纪律 <!-- serves: FR-3 -->

改片段（`decomposing/{light,heavy}.md`、`brainstorming/heavy/overrides.md`）后**必须**：

```bash
node scripts/inline-prompt-fragments.mjs     # C-16 重生成产物
node scripts/check-prompt-fragments.mjs      # C-17 片段与产物一致
```

并纳入 `tests/fixtures/stage-prompts-baseline*.json` 的基线比对：条件式措辞是**可断言文本**，
基线漂移当场可见（防"改了源没重生成"这一类静默失败）。

## B-6 并发、多窗口与幂等 <!-- serves: FR-1, FR-2 -->

- **跨窗口唯一性**：判定键不含 `windowKey` ⇒ 同需求的第二个窗口（worker 席位）请求同一道门时命中**复用**。
  人不会被问两次；唤醒与回执仍归**首建窗口**。
- **判定 → 登记之间无 `await`**：`findOpen` 是同步读、`register` 是同步写，Node 单线程下二者之间没有交错窗口
  ⇒ "两个并发请求都新建"不可能发生（与 `PendingConfirmRegistry.consume` 的原子性同理）。
- **幂等**：连调 N 次结果一致（同一 ticket、无新记录、无二次弹框）。
- **不引入锁**：不需要跨进程锁——门表是进程内的，判定与登记同进程同步完成。

## B-7 代码落点（一句话职责） <!-- serves: FR-6 -->

| 文件 | 职责 | 变动 |
|---|---|---|
| `src/application/internal/gate-request.ts` | 建门唯一入口：判定顺序 + 复用/早退语义 | **新增** |
| `src/application/internal/auto-confirm.ts` | 自动弹改走 `requestGate`；未弹框时给出 reason | 改 |
| `src/application/use-cases/AskConfirm.ts` | agent 请求改走 `requestGate`；陈旧票清理分门；提示词无关逻辑不动 | 改 |
| `src/application/internal/pending-confirm.ts` | 迟到作答路由：stale ⇒ 中性通道 | 改 |
| `src/application/internal/confirm-settle.ts` | 落章两个前提 + 首写不变 + `recordStaleAnswer` | 改 |
| `src/adapters/PendingConfirmRegistry.ts` | 新增只读 `findOpen`；其余逐字不变 | 改 |
| `src/application/internal/pending-guard.ts` | recovery / 拒绝文案去"覆盖" | 改 |
| `src/application/use-cases/SubmitArtifact.ts` | 回执 note 分支（triggered 时不再指向 `ask_confirm`） | 改 |
| `src/application/use-cases/SubmitVerification.ts` | G4 保持 `await` 形态，只改走 `requestGate` | 改 |
| `src/application/internal/capture-section.ts` | 设计/拆分两处指南条件式 | 改 |
| `src/domain/prompt/fragments/…` + `generated/fragments.ts` | 三处片段条件式 + 重生成产物 | 改 |

**已知不一致（本次不统一，登记为后续线）**：G4 用 `await askConfirm`（挡住 submit 返回），
G1/G3 用 `triggerAutoConfirm`（fire-and-forget）。两者在本需求判据下都可被 `requestGate` 覆盖；
统一形态会动验收提交流程时序，风险与本需求正交，故列入"不做"并在此登记。
