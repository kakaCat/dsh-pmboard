# 测试用例设计 · REQ-261006164732-6503 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 关注点：判据可执行。**每条用例都写成"跑什么命令 / 看到什么算过"**，空话即为不合格。

## T-1 命令与期望 <!-- serves: FR-6 -->

```bash
npx vitest run tests/gate-request-uniqueness.test.ts tests/ask-confirm-pending.test.ts \
               tests/pending-guard.test.ts tests/pending-guard-integration.test.ts \
               tests/confirm-advance-deadlock.test.ts tests/submit-prototype.test.ts
# → 全绿，退出码 0

npx tsc --noEmit -p tsconfig.json     # C-15 → 退出码 0
pnpm baseline:check                   # C-14 → 失败用例集合差为空
node scripts/check-prompt-fragments.mjs   # C-17 → 退出码 0（改了片段时）
```

## T-2 新用例（`tests/gate-request-uniqueness.test.ts`） <!-- serves: FR-1, FR-2, FR-4, FR-5 -->

| 例 | 场景 | 断言（可失败） |
|---|---|---|
| U1 | 同需求连调两次 `reqboard_ask_confirm(target=plan)` | 弹框端口**恰好 1 次**；票表计数不变；两次 `ticket` 相同 |
| U2 | 连调三次（幂等） | 同上（第三次也复用，不新建、不续期：`createdAt` 不变） |
| U3 | 已批准的计划再调 | `already-settled`：不弹框、`note` 含「未重复弹框」 |
| U4 | 异门实例（先留一个设计门，再请求计划门） | 旧门被 settle（`outcome` 非空）、新门在场、票表计数为 1 |
| U5 | 跨窗口（同需求另一 windowKey）请求同门 | 复用：同一 `ticket`，首建者的 `windowKey` 未被覆盖 |
| U6 | 已批准后**再走一次落章路径** | `plan.approvedAt` 与 `approvedEvidence` **逐字节不变** |
| U7 | 需求已推进（`status` 离开来源阶段）后作答 | 台账**零新时间戳**；只多一条评论；回执 `confirmed=false` |
| U8 | 被取代的门迟到作答 | 同上，且回执文案含"已被取代 / 已推进" |
| U9 | `reqboard_status.pending_confirms[]` 读门状态 | 建门后恰好一条（含 ref/target/createdAt）；作答后清空 |

## T-3 四门回归矩阵（各至少一例） <!-- serves: FR-1, FR-6 -->

| 门 | 正例（首次请求） | 反例（回归锁） |
|---|---|---|
| G1 需求 | 提交需求文档 → 自动建门 → 肯定答复落章并推进 `brainstorming → design` | 门未答时 `reqboard_submit` 被 `REQBOARD_CONFIRM_PENDING` 拦（码与范围不变） |
| G2 设计 | `reqboard_submit(kind=design)` **不自动建门**；显式请求才建门 | 设计未确认时 `design → decomposing` 被 `design_doc_incomplete` 拒（不变） |
| G3 拆分 | 提交计划 → 自动建门 → agent 再请求命中**复用**（恰好 1 个框） | 未批准时 `reqboard_decompose` 被拒（不变） |
| G4 验收 | 提交验收材料 → 建门（`await` 形态不变）→ 肯定答复落章 | `blockers` 存在时不建门（既有条件不变） |

## T-4 反向验证（改坏必须红） <!-- serves: FR-1, FR-4, FR-6 -->

三条"改坏必红"，用于证明用例真在守不变量（做完即还原）：

| 改坏点 | 应当变红 |
|---|---|
| 把 `reused` 分支改成"照旧登记新票" | U1 / U2（票表计数与 ticket 相同断言） |
| 把陈旧票清理改回"同门也清" | U4 或 U1（同门连调会变成新建） |
| 把落章写回"无条件赋值" | U6 / U7（首写不变断言） |

## T-5 回归面与基线 <!-- serves: FR-6 -->

- **直接受影响**：`ask-confirm-pending`（13 例）、`pending-guard`（20 例）、`pending-guard-integration`（8 例）、
  `confirm-advance-deadlock`、`submit-prototype`（20 例，原型登记不得再产生门）。
- **间接（口径基线）**：`output-contract`（返回键零新增 ⇒ 应当零变化）、`stage-prompts` 基线（FR-3 文案）、
  `tests/prototype-registration-no-pin.test.ts`（无门产物不得进票表）。
- **基线口径**：判据是**失败用例集合差为空**（不是计数上限）；差集非空先逐条确认是否本次引入。
- **不做**：不为本需求新增端到端浏览器用例（无界面变更；`sides: [backend]`）。
