# 测试证据（REQ-261006094052-1da2）

covers: t-32e494, t-9aa82b, t-af9414, t-13a8ca, t-c89be1, t-64bf2e, t-37c671, t-a775c9, t-b979ca, t-501599, t-035788, t-d56990, t-a8775d, t-b40da5, t-0c5a47, t-5c2b84, t-04c085, t-6ac15e
> 本文件是**新鲜取数**（2026-10-06 09:55 本轮实跑），不是转述。
> 覆盖卡：t-32e494（t1）、t-9aa82b（t2）、t-af9414（t3）、t-13a8ca（t4）、t-c89be1（t5）；
> 子卡同覆盖：t-64bf2e/t-37c671（t1 研发·复核）、t-a775c9/t-b979ca（t2）、t-501599/t-035788（t3）、
> t-d56990（t4 测试段）、t-a8775d（t5 测试段）。

## 1. 判据命令与真实输出

covers: t-32e494, t-9aa82b, t-af9414, t-13a8ca, t-c89be1, t-64bf2e, t-37c671, t-a775c9, t-b979ca, t-501599, t-035788, t-d56990, t-a8775d, t-b40da5, t-0c5a47, t-5c2b84, t-04c085, t-6ac15e

```bash
npx vitest run tests/confirm-advance-deadlock.test.ts tests/design-gate-messages.test.ts tests/ask-confirm-pending.test.ts
```
```
 ✓ tests/design-gate-messages.test.ts  (6 tests) 64ms
 ✓ tests/ask-confirm-pending.test.ts  (13 tests) 151ms
 ✓ tests/confirm-advance-deadlock.test.ts  (10 tests)

 Test Files  3 passed (3)
      Tests  29 passed (29)
```

```bash
npx tsc --noEmit          # exit=0，输出为空（零类型错误）
```

```bash
pnpm test                 # 全量回归（原始输出：.dsh-data/post-fix-test2.txt）
```
```
 Test Files  38 failed | 465 passed | 3 skipped (506)
      Tests  69 failed | 5883 passed | 22 skipped (5974)
```
基线（改动前，原始输出：`.dsh-data/baseline-test.txt`）：
```
 Test Files  39 failed | 462 passed | 3 skipped (504)
      Tests  70 failed | 5839 passed | 22 skipped (5931)
```

逐条差集（`.dsh-data/baseline-cases.txt` vs `.dsh-data/post-fix-cases2.txt`）：
- **新增真实失败：0**；
- 唯一差集条目 `tests/typecheck.test.ts > src 与 tests 下 0 个类型错误` 是**跨窗口瞬时态**：
  它报的错在 `tests/result-binding.test.ts`（两个未使用导入 TS6133），该文件不在本次改动集；
  单跑该用例 2/2 绿、`npx tsc --noEmit` 零错误 ⇒ 判定为并行工作期的抖动，非本次引入。

## 2. 新增用例逐条（`tests/confirm-advance-deadlock.test.ts`，10 例）

covers: t-9aa82b, t-13a8ca, t-a775c9, t-b979ca, t-d56990

| 用例 | 判据 | 断言要点 |
|---|---|---|
| TC-1 | A1 | `advanced:true` / `from=brainstorming` / `to=design`；**读回台账** `status=design`、`statusHistory` 含 design、评论含 `[自动推进] brainstorming → design` |
| TC-2 | A2 | 缺「讨论与裁定记录（D-x）」⇒ `advanced:false`、`gate_failure.code=decision_log_missing`、状态仍 `brainstorming` |
| TC-3 | A2 边界 | `accepting`（无自动下一阶段）⇒ 不推进、**无** `gate_failure`、状态不变 |
| TC-4 | A1 边界 | `advance:false` ⇒ 明确不推进 |
| TC-5 | A3 | UI 需求缺原型 ⇒ `triggered:false`，reason 含 `docs/requirements/<REQ>/prototypes/` 与 `reqboard_submit(kind=prototype)` |
| TC-6 | A3 闭合 | UI 需求 + `prototype_exempt` 生效 ⇒ 重发确认即推进到 design |
| TC-6b | A3 现场路径 | 真交原型 + INDEX 权威行 + 一块 geometry ⇒ 三门全过并推进（来源需求走的就是这条路） |
| TC-7 | A3 不越界 | `sides:[backend]` ⇒ 照弹（`triggered:true`） |
| TC-9 | A2 后门 | design 阶段用 `kind=requirement` 重发 ⇒ 被设计完整性门拦下，状态不变（修复自身不得开后门） |
| TC-8 | 夹具自检 | 文档只写临时目录，不落仓库 |

## 3. 反向验证（改坏必须红；test-cases.md「反向验证」表四条）

covers: t-13a8ca, t-d56990, t-32e494, t-64bf2e, t-37c671

| 人为改坏 | 结果 |
|---|---|
| 早退分支丢弃 `advanced`（仍报 false） | TC-1 红（`1 failed`） |
| 单点里删掉 `transitionRequirement`（只留评论与断点） | TC-1 红 |
| 删掉 `triggerAutoConfirm` 的预判 | TC-5 红 |
| 忽略调用方的门（闸门不过也推进） | TC-2 红 |

四条各跑一次必红；**跑完逐字节还原**（`diff` 与 `.dsh-data/post-fix/` 快照一致），还原后两文件 16 例全绿。

## 4. 兼容面（既有契约未被污染）

covers: t-af9414, t-501599, t-035788

```bash
npx vitest run tests/output-contract.test.ts tests/submit-prototype.test.ts tests/prototype-registration-no-pin.test.ts
```
```
 Test Files  1 failed | 2 passed (3)
      Tests  4 failed | 56 passed (60)
```
4 条失败全部是 `output-contract` 的**其它四个工具**（adopt/knowledge/regenerate/skill-install），
与基线 `.dsh-data/baseline-cases.txt` 里的 4 条**同名同因**——`auto_confirm` 由同步对象改成
`Promise` 后的回执形状（`{triggered, reason?}`）与 `kind=prototype` 的既有形状均未被破坏。

## 5. 文档自检（如实，含 1 处已知缺口）

```bash
npx tsx scripts/req-doc-validate.mts --req REQ-261006094052-1da2      # 提交验收前
```
```
文档自检汇总：判据 9 项（实判 6 / 读数未知 3）；缺口 1；exit 1
```
当时唯一缺口：`缺 RTM 文件：rtm-accepting.yml（该状态 accepting 下应有）`——需求刚由任务全 done
自动进入 accepting，该 RTM 文件是**后续流程的产物**。

```bash
npx tsx scripts/req-doc-validate.mts --req REQ-261006094052-1da2      # 提交验收后复跑（返工轮）
```
```
文档自检汇总：判据 9 项（实判 6 / 读数未知 3）；缺口 0；exit 0
```
复跑确认：`docs/requirements/REQ-261006094052-1da2/rtm-accepting.yml` 已由流程生成 ⇒ **缺口 0、exit 0**。
其余 3 项为「读数未知不判」（与既有口径一致，不冒充通过）。

## 6. 返工轮（针对验收单 v1 未过项 v1-7）

covers: t-b40da5, t-0c5a47, t-5c2b84, t-04c085, t-6ac15e

验收意见：**需修改**；要求：与裁定对照（逐条说明如何落实）。

```bash
ls docs/requirements/REQ-261006094052-1da2/reviews/decision-mapping.md
```
```
docs/requirements/REQ-261006094052-1da2/reviews/decision-mapping.md   （存在，非空）
```
返工产物 = `reviews/decision-mapping.md`：D-1~D-7 **逐条**给出「原话来源 / 落实点（文件:行）/
可复核证据 / 结论」，并补记一条实施期派生裁定 **D-2′**（G2 后门封堵，证据 TC-9）。
返工轮新鲜复跑：`npx vitest run`（三文件）→ 29 passed；`npx tsc --noEmit` → exit 0；
`npx tsx scripts/req-doc-validate.mts --req REQ-261006094052-1da2` → 缺口 0 / exit 0。
