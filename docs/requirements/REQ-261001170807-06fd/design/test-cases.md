---
req: REQ-261001170807-06fd
doc: test-cases
serves: FR-1, FR-2
---

# 测试用例（serves: FR-1, FR-2）

| id | 断言 | 落点 | 期望 |
|---|---|---|---|
| A1 | 本卡子卡刚关 → 父卡可立即收尾 | `tests/e2e-close-chain.test.ts` | 节流剩余 0 |
| A2 | 连关两张**兄弟卡** | 同上 | **仍被拦**（红线） |
| A3 | 子卡的 done 不影响**别的父卡** | 同上 | **仍被拦**（红线） |
| A4 | 模板各阶段 acceptance 含可执行锚点 | `tests/subtask-template-acceptance.test.ts` | 16/16 命中 |
| R1 | 判据层既有行为不回归 | `tests/domain/done-evidence.test.ts` | 8/8 绿 |
| 现场 | 关完本卡子卡 0.1s → 关父卡 | 真实工具链 | 通过，且不指认本卡子卡 |

**反例（必须保持红→绿不变）**：修复前 A1 必须失败且指认本卡子卡——见 `evidence/repro-red.txt`。
