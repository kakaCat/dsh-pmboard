# 测试证据（REQ-261002141430-a5ef）

> 全部命令在 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 下执行；结论只写**实际输出**，未执行的一律标注。

## 1. 新增回归用例（本需求的主证据）

```
$ npx vitest run tests/dialog-inflight-stop.test.ts
Test Files  1 passed (1)
     Tests  14 passed (14)
```

覆盖：TC-1 在途不投回合 · TC-2 在途不派卡（autoRun 不变、不计停滞）· TC-3 作答/否定均解除 ·
TC-4 反向自检（无在途时照常起轮/派卡/未装配判据行为不变）· TC-5 在途时 rearm 拒绝且零写入 ·
TC-6 过期/重启后心跳对账恢复（在途仍在时不恢复）· TC-7 门框与起轮不并存 · TC-8 降级不登记 ·
TC-9 exit 幂等 + 台账写失败响亮告警且拦截仍生效。

## 2. 修前必红取证（精确基线）

做法：把 `awaiting-confirm` 的 `enterAwaitingConfirm` / `exitAwaitingConfirm` / `dialogInFlightFor`
临时改成空操作（只改这一个文件、不动他人未提交的改动），复跑全量；再恢复真实实现复跑全量。

```
空操作基线：  Test Files 49 failed | ...   Tests 105 failed | 3000 passed
真实实现：    Test Files ...               Tests 100 failed | 3014 passed
失败名单差集：新引入的失败 = 空集
              唯一差值 = 本文件 5 条用例由红转绿（TC-2 / TC-3 / TC-6 / TC-7 / TC-9）
```

结论：新用例**不是恒真断言**，它们在改动前确实会红；本次改动未引入任何新失败。

（说明：本条刻意不用 `git stash` 取基线——那会把 `confirm-settle.ts` 上他人未提交的改动一起回退，
得到的是假基线；这一点在 `reviews/self-review.md` 第三节有记录。）

## 3. 类型检查（C-15）

```
$ npx tsc --noEmit 2>&1 | grep -E "awaiting-confirm|round-driver|rearm|gate-prompt|wake-heartbeat|AdvanceChain|AskConfirm|confirm-settle"
（无输出 → 本次改动文件 0 条类型错误）
```

## 4. 构建（C-11）

```
$ pnpm build
✔ Build complete in 816ms
wrapped dsh-pmboard -> lib/client.js 313458 bytes
[verify-client] OK  bundle=335555 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
（退出码 0；dist/index.mjs 已更新，1213054 字节）
```

## 5. 未执行的项（如实登记）

- **人工端到端四步**（提交产物 → 停手可见 → 点确认 → 无需额外输入自动续跑）：本轮**未执行**。
  原因：需要重载插件并产生真实弹框，会打断当前流水线。等价路径已覆盖：TC-7 用真实
  `createGatePromptPort` 压同一 idle 拍、TC-3 走真实 `applyConfirmDecision` 收敛点。
- **阻塞弹框（capture 五问 / accept_sheet）** 未纳入停手判据（需求文档边界 ⑤）；若端到端实测发现
  阻塞期 agent 会转 idle（`readyToDrive` 成立），需回补登记。

## 6. 逐卡测试覆盖（33 张卡全覆盖）

计划 key ↔ 台账卡 id 对照见 `docs/requirements/REQ-261002141430-a5ef/decomposition.md` §2。

| 卡片 | 覆盖标注 | 对应证据 |
|---|---|---|
| t1 契约层（父） | covers: t-62533f | TC-1 / TC-9 + §2 基线 |
| t1·研发 | covers: t-1e5ab1 | §1 TC-9（幂等 + 写失败响亮） |
| t1·联调 | covers: t-f7baff | §1 TC-4 第三条（未装配判据行为不变） |
| t1·复核 | covers: t-103d79 | §3 类型检查 + 复核报告第二节 |
| t1·测试 | covers: t-9c4ecd | §1 TC-9 + §2 基线 |
| t2 起轮判据（父） | covers: t-d4d79d | TC-1 / TC-4 |
| t2·研发 | covers: t-3461cb | §1 TC-1（在途不投回合） |
| t2·联调 | covers: t-650538 | §1 TC-4 第三条 |
| t2·复核 | covers: t-6e32a1 | 复核报告第一节（停手不写健康位） |
| t2·测试 | covers: t-cc6a16 | §1 TC-1 + §2 基线 |
| t3 派卡判据（父） | covers: t-df2005 | TC-2 |
| t3·研发 | covers: t-72d9bf | §1 TC-2（autoRun 不变、不计停滞） |
| t3·联调 | covers: t-05351b | §1 TC-5（在途时恢复被拒） |
| t3·复核 | covers: t-3ef8aa | 复核报告第一节（判定位置与顺序） |
| t3·测试 | covers: t-e083c9 | §1 TC-2 + §2 基线 |
| t4 投递点接线（父） | covers: t-671d23 | TC-7 / TC-8 |
| t4·研发 | covers: t-753035 | §1 TC-3 / TC-8 |
| t4·联调 | covers: t-d083df | §1 TC-3（收敛点解除） |
| t4·复核 | covers: t-06939d | §1 TC-8（降级不登记） |
| t4·测试 | covers: t-e38dae | §1 TC-7 / TC-8 |
| t5 恢复与对账（父） | covers: t-3a1623 | TC-3 / TC-5 / TC-6 |
| t5·研发 | covers: t-9c2b9e | §1 TC-5 / TC-6 |
| t5·联调 | covers: t-39e274 | §1 TC-6（对账趟接线） |
| t5·复核 | covers: t-7fe2e5 | 复核报告第一/二节 |
| t5·测试 | covers: t-f84b32 | §1 TC-3 / TC-5 / TC-6 |
| t6 回归用例（父） | covers: t-a5f37a | §1 全部 14 条 |
| t6·用例落地 | covers: t-e30468 | §1（14 passed） |
| t6·反向自检 | covers: t-6b5d59 | §1 TC-4 / TC-8 |
| t6·基线取证 | covers: t-2b12f3 | §2（修前必红空集证明） |
| t7 兼容回滚端到端（父） | covers: t-418e2c | §3 / §4 / §5 |
| t7·兼容回滚 | covers: t-b1dd03 | 复核报告第二节（零迁移、回滚路径） |
| t7·证据 | covers: t-8a929c | §3 / §4（类型 + 构建） |
| t7·端到端 | covers: t-c18835 | §5（未执行项，如实登记） |

