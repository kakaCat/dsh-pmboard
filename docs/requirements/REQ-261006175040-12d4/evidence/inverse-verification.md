# 逆验证取证（REQ-261006175040-12d4 · t7 / FR-7 · D-6）

目的：证明 `tests/card-face-summary-shape.test.ts`（跨缝用例）**真的有证伪力**——不是"恰好绿灯"。
手段：**受控改坏 → 跑用例 → 复原**（每次改坏只动 `src/client/render/gate-view.ts` 一个函数，跑完立即逐字节还原）。

为什么不用 `git stash`：本工作树同时承载**其他窗口在飞的改动**（`src/client/panels/verify.ts`、
`application/internal/confirm-settle.ts` 等），`git stash` 会把它们的在途工作一并藏走——为了取证而
打断别的窗口不可接受。受控改坏是更窄、可逆、且只看目标函数的做法。

## 基线（改坏前）

```
npx vitest run tests/card-face-summary-shape.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## 逆验证 ①：把读侧改回「从 `req.artifacts` 现算」（缺陷的原始形态）

改坏点：`gatesOf(req)` 不再读 `req.gates`，改为就地按 `req.artifacts` 现算四门状态
（摘要里没有该字段 ⇒ 恒为空 ⇒ 四门 missing）。

```
   × 四门全落章 + 验收未交 ⇒ ✓✓✓✗ + 门 3/4（不再出现 产物 0/6）
   × 读数缺省（旧服务端）⇒ 门相关块整块不渲染，且**不出现** ✗ 与 产物 0/6
   × 两种形态必须**可区分**：真缺一件（读数在、该门 missing）仍要显示红 ✗
   × 当前门待确认时，按钮按读数在场（尺寸/份数取自 count）
 Test Files  1 failed (1)
      Tests  4 failed (4)
```

⇒ 该用例守住了「卡面必须读**服务端读数**」这条缝：一旦回到就地推断，四条断言全红。

## 逆验证 ②：把「读数缺省」当成 `missing`（读不到渲染成缺失）

改坏点：`gatesOf(req)` 在 `req.gates === undefined` 时补一份「四门全 missing」——
正是本次缺陷的渲染形态（读不到 ⇒ 四个红 ✗）。

```
   × 读数缺省（旧服务端）⇒ 门相关块整块不渲染，且**不出现** ✗ 与 产物 0/6
   × 两种形态必须**可区分**：真缺一件（读数在、该门 missing）仍要显示红 ✗
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

⇒ 该用例守住了 FR-6「读不到 ≠ 缺失」：两态一旦同形，立刻红。

## 复原

```
cp /tmp/gate-view.bak.ts src/client/render/gate-view.ts
diff -q /tmp/gate-view.bak.ts src/client/render/gate-view.ts   # 无输出 = 逐字节一致
npx vitest run tests/card-face-summary-shape.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## 评审点（留给验收人）

本用例的证伪力依赖一件事：**夹具只给摘要字段**。若有人往 `summaryShape()` 里塞回
`artifacts` / `plan` / `verification` / `archive`，用例仍会绿，但跨缝证明力归零——
评审时按此点检查夹具（文件头注释已写明这条纪律）。

---

## 逆验证 ③（t5）：让一条实现漏装配读数 ⇒ 同形断言必红

改坏点：把 `tests/reqboard/store-contract.test.ts` 内**假 SQL 只读替身**的摘要出口从
`boardSummaryOfAuthoritative` 退回直调 `summarize`（等价于"这条实现忘了装配门读数"）。

```
   × 门读数同形：四条实现给出相同的 gates / planState / archivePrepared > FakeSqlReadOnlyStore：读数与期望逐字段一致
     → expected undefined to deeply equal [ { kind: 'requirement', …(2) }, …(3) ]
   × 门读数同形：四条实现给出相同的 gates / planState / archivePrepared > 四条实现的读数彼此相等（同一条需求、同一批夹具）
     → expected { gates: undefined, …(2) } to deeply equal { gates: [ { …(3) }, …(3) ], …(2) }
 Test Files  1 failed (1)
      Tests  2 failed | 118 passed (120)
```

复原后：`Tests 120 passed (120)`，`diff -q` 无输出（逐字节一致）。

**这条逆验证在施工期就抓到了真问题**：t4 那轮只扫了 `tests/support/legacy-store-projection.ts` 与
`tests/application/harness.ts` 两个测试辅助文件，**漏了** `store-contract.test.ts` 里自带的假 SQL 替身
（它同样直调 `summarize`）。同形断言一落地就把它点出来了——这就是"四条实现必须同形"这条纪律的价值。
