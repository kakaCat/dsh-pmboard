# t7 交付给后续卡的两条硬约束（REQ-261004103330-005f）

> 来源：t7（挂起确认机制扩写）实现时实测得出，写给 **t8（settings 路由）** 与 **t10（迁移开窗）** 用。
> 不写下来的后果：路由卡按"共享类型"的直觉写，编译期就打架；或按"查 `pendingForWindow`"判 403，
> 于是**永远拿不到票据**（storage-action 刻意不进那张表），403 变成永远拒绝。

## ① 共享类型仍是 `'artifact' | 'plan'`，storage-action 用的是适配器内的本地类型

- `shared/protocol.ts` 的 `PendingConfirmation.target` **没有** `'storage-action'`；
  t7 受"单文件改动"约束，把宿主级动作记录做成了 `PendingConfirmRegistry` **文件内**的
  `StorageActionConfirmation`（`requirementId` 用**空串**表示"宿主级、不属于任何需求"，
  `action ∈ 'switch-to-sqlite' | 'switch-to-json' | 'migrate'`）。
- 因此 **t8/t10 不要 import 任何"共享的 storage 票据类型"**（不存在），
  只用 `PendingConfirmRegistry` 暴露的方法：`registerStorageAction` / `settleStorageAction` /
  `consume` / `getStorageAction`。
- 若将来要让票据类型进共享契约，必须**另开一张卡同时改 `protocol.ts` 与 `ports.ts`**（两个文件），
  否则类型会打架——本需求不在 t7 里做这件事。

## ② 403 `confirmation_required` 只能由 `consume` 判定，不能查"有没有挂起"

- storage-action 票据**刻意不进** `pendingForWindow`：宿主级动作不该拦住任何一条需求的写路径
  （进了的话，"切库确认在途"会把所有需求的 `reqboard_submit` 一起锁死）。
- 所以路由的口径必须是：
  ```
  const r = registry.consume(ticket)      // 原子：已落章 + 未过期 + 未消费
  if (!r.ok) → 403 confirmation_required  // 不开窗、不写设置、不写系统事件
  ```
  **不要**写成 `if (registry.pendingForWindow(...).length === 0) → 403`：那会把合法票据也拒掉，
  且理由与真实原因不符（"没有挂起"≠"没有落章票据"）。

## ②′ 【t8 实测补上的一条硬口径】`consume` 成功 ≠ 人已同意

t7 的 `consume()` 判的是「已落章 + 未过期 + 未消费」——**"落章"包含否定作答**：人在确认框点「取消」，
`settle` 一样写 `outcome`（`confirmed:false`），于是 `consume` 一样返回 `ok:true`。
**只看 `ok` 就执行的调用方，会变成"点了取消照样切库"。**

两道防线（**两道都要，不许只剩一道**）：

1. **源头（t7 文件）**：`consume()` 在 unsettled 之后追加一条——`outcome.confirmed !== true` → 返回
   `ok:false, reason:'denied'`，且**不消费、不置位**（票据仍留在原位，人重新以肯定作答后还能用）。
2. **路由（t8 文件）**：`POST /settings/storage/switch` 里 `consumed.confirmed !== true → 403 confirmation_required`，
   不写任何文件、不写系统记录事件。

为什么两道都要：源头那道保证"任何消费方都不会把否定当同意"；路由那道保证"即使有人放宽了源头，
路由这条路径仍然拒绝"。**删掉任一道，对应的用例必须变红**（这既是纪律，也是给后人的警告牌）。

## ②″ 【t8 定的一条体验口径】切到"当前已在用"的后端 → 400，且**不烧票据**

`POST /settings/storage/switch` 若请求的后端**等于当前生效后端** → 返回 400，消息说明"当前已在用 X，无需切换；
若刚改过设置还没重启，请重启宿主生效"。**这条判断必须放在 `consume` 之前**：
否则一次"没有可做的事"的请求会把一张合法票据烧掉，人得重新确认一遍——那是纯损耗。
（也不写 `backend-switched` 事件：档案里不该出现没发生过的切换。）

## ③ 附：t7 顺手修掉的一个 fail-open（后人不要"简化"回去）

`settleStorageAction(ticket, outcome, undefined)` 若不做形状校验，`{ ...undefined }` 会写出 `{}`，
于是"半落章"被当成已落章——**白白放行一次后端切换**。现实现只在形状成立时才写
（`outcome` 走 `isPendingOutcome`、`stamp` 走 `isStorageActionStamp`，含 `channel` 白名单与布尔校验），
畸形一律留在"未落章"，`consume` 必然拒绝。这是**fail-closed**，不是冗余校验：入参来自 HTTP body / 弹框回填。


## ④ 【owner 裁定】看板面板**不是**"那个同意"（t13 提出，2026-10-04 定）

**事实**：`POST /settings/storage/request` 在**取票时就经作答通道把正式确认框推给人**，并**只在人作答后**才落章。

**裁定**：看板上的确认面板**不是**同意本身，它只是"**列出影响 + 显式二次动作**"。
**不得**为了"点一下即生效"而把 settle 挪进路由——那会让这个门**可被任何能打接口的人伪造**，正是 FR-11 要防的。

因此面板的文案纪律：**不写**"本页点确认即生效"这类假保证；403 时要如实列出三种可能
（**还没作答 / 你点了取消 / 票已过期**）并**不自动重试**。

（这条与 FR-11 的两道防线同源：源头 deny + 路由 403；面板只是让人看清影响，不承担"同意"的法律地位。）
