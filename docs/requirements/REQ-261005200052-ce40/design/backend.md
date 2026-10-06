# 设计：后端落点与改法（REQ-261005200052-ce40）

> 面：改哪些文件、每处怎么改、为什么。**文件清单不是任务拆分**（任务在拆分阶段才出现）。

## 落点清单（文件结构） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 文件 | 职责 | 本次改动 |
|---|---|---|
| `src/application/internal/pending-guard.ts` | 停手守卫的**唯一判据点** | 新增两谓词 + 诊断投影；`livePendingConfirm` 判定序扩展；拒绝文案按可用出路生成 |
| `src/application/use-cases/AskConfirm.ts` | 确认编排（校验 → 登记票 → 弹框） | 把「有没有东西可落章」的校验**前移到登记票之前** |
| `src/application/use-cases/SubmitArtifact.ts` | 六种 kind 的登记编排 | 删掉原型登记的第 ⑤ 步自动确认（只保留通知） |
| `src/application/internal/artifact-gates.ts` | 产物门与登记通知文案 | `artifactNotifyText` 改为**门感知** |
| `src/application/use-cases/ConfirmReceipt.ts` | 挂起票回执 | `receiptNote` 补「真实可用出路」与状态事实 |
| `src/tools/StatusTool/StatusTool.ts` | 状态投影（agent 的读窗口） | `pending_confirms[]` **追加**五个只读键（旧键不动） |
| `tests/pending-guard.test.ts` | 守卫判据用例 | 扩两谓词与判定序（含真门仍拦） |
| `tests/prototype-registration-no-pin.test.ts` | 回归用例（由诊断探针转正） | 登记原型后窗口写路径可用 |
| `tests/ask-confirm-pending.test.ts` | 挂起确认用例 | 补"无产物不登记票"与文案断言 |

不新增文件目录、不改注册表实现（`PendingConfirmRegistry.ts` 一行不动）。

## 守卫判定实现 <!-- serves: FR-2 -->

`livePendingConfirm` 在既有三步之后追加两步（**顺序不可换**——先台账落章放行，再看门与产物）：

```ts
// ④ 无确认门 ⇒ 这张票拦不住任何下游产物，放行（读时谓词，每次调用重算）
if (!hasConfirmGateOf(pending)) return undefined
// ⑤ 该 kind 台账内无产物 ⇒ 没有东西可以被确认，人也点不了看板 ⇒ 放行
if (!hasConfirmableArtifactOf(req, pending)) return undefined
return pending
```

- 谓词④ 的 kind 值域直接取 `ARTIFACT_CONFIRM_GATES`（`src/shared/protocol.ts` 再导出），**不另写名单**。
- 谓词⑤ 只读**已经在读**的 `req`，不新增 I/O。
- `req === undefined`（台账查不到需求）保持既有保守语义：**留挂**（无法证明已落章/无产物时不静默放行）。

## 登记侧实现 <!-- serves: FR-1, FR-5 -->

`SubmitArtifact.ts` 原型登记的第 ⑤ 步**整段删除**（`triggerAutoConfirm(kind='prototype')`）：

```ts
// 删：const autoConfirm = added.length > 0 ? triggerAutoConfirm(deps, { kind: 'prototype', ... }) : undefined
// 留：上方第 ④ 步之后的 notifyArtifactRegistered(...) —— 通知仍在，票不再产生
```

`AskConfirm.ts` 校验段（`port.register` **之前**）追加：

```ts
if (targetKind === 'artifact' && kindArts.length === 0)
  reject('需求 ' + targetReq.id + ' 没有 kind=' + kindRaw + ' 的产物（请先提交该阶段产物）', 'REQBOARD_MISSING_ARTIFACT')
if (targetKind === 'plan' && targetReq.plan === undefined)
  reject('需求 ' + targetReq.id + ' 还没有拆分计划', 'REQBOARD_MISSING_PLAN')
```

文案与既有 `applyConfirmDecision` 的两条逐字一致（复用同源字符串，避免两份措辞）。
既有"清理同窗口旧票"的循环位置与语义不变。

## 文案与通知实现 <!-- serves: FR-3, FR-4 -->

`pendingConfirmFactsOf(req, rec, now)` 生成四要素 + `usableRecovery`：

| 条件 | usableRecovery 追加项 |
|---|---|
| 恒定 | `① 调 reqboard_confirm_receipt(ticket=…) 取回执` |
| `hasConfirmGateOf(rec)` | `② 到项目看板点确认按钮（该产物有确认门，卡面有控件）` |
| 本窗口进行中需求命中该 id 且产物在册 | `③ 重新发起 reqboard_ask_confirm 覆盖旧记录` |
| 目标需求终态 / 非本窗口需求 | 附一句：「该需求已归档/不属本窗口：agent 侧无法覆盖，请人点看板或等 {expiresAt} 自动失效」 |
| 该 kind 产物数为 0 | 附一句：「该产物未登记：先登记产物（reqboard_submit）后再确认」 |

`artifactNotifyText` 用同一判据（`ARTIFACT_CONFIRM_GATES` 值域）决定是否输出「确认入口」那一行。

## 落点顺序与风险 <!-- serves: FR-1, FR-5 -->

1. 先改守卫（④⑤）——它让"不是门的票"立刻不再拦，且不依赖任何登记侧改动；
2. 再改登记侧（删原型自动确认 + 校验前移）——从源头不造这类票；
3. 最后改四处文案与 status 投影——只影响人读，不影响判定。

风险与对策：

| 风险 | 对策 |
|---|---|
| 误放行真门（把 G1~G4 的票也放了） | 逆验证用例：kind=verification 且产物在册未落章 ⇒ 必抛 `REQBOARD_CONFIRM_PENDING` |
| 台账读失败被当成"无产物" ⇒ 误放行 | 谓词⑤ 只在 `req !== undefined` 且**确实读到产物集**时判否；读异常沿用既有错误路径（不吞） |
| 删掉自动确认后"人不知道有新原型" | 保留 `notifyArtifactRegistered`（无门文案改为「无需人工确认（登记即生效）」） |
| 校验前移改变成功路径返回体 | 前移只覆盖"本来就会失败"的分支；成功路径逐字不变（既有用例回归） |
