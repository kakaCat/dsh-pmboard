# 测试证据（REQ-261006201649-cc89）

> 本文件是**验收材料的一部分**：逐条给出"跑什么、看到什么算过"的**新鲜读数**，
> 以及两条元判据（反向演练）的**双向**实测。
> 「新鲜」的口径：本文件里的每条读数都是在提交验收材料**之前**当次跑出来的，
> 不是从卡片汇报里复制的历史结论。

## 1. 主判据：本需求全部原型套件

```bash
npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts \
  tests/verification-prototype-compare-required.test.ts
```

| 套件 | 条数 |
|---|---|
| `tests/prototype-placeholder.test.ts` | 15 |
| `tests/prototype-placeholder-gate.test.ts` | 14 |
| `tests/prototype-geometry-evidence.test.ts` | 29 |
| `tests/prototype-gates.test.ts` | 28 |
| `tests/prototype-metadata-parse.test.ts` | 17 |
| `tests/prototype-skeleton.test.ts` | 21 |
| `tests/prototype-registration-no-pin.test.ts` | 2 |
| `tests/prototype-new-codes.test.ts` | 13 |
| `tests/prototype-parity.test.ts` | 24 |
| `tests/prototype-parity-contracts.test.ts` | 19 |
| `tests/plan-prototype-anchor-gate.test.ts` | 29 |
| `tests/verification-prototype-compare-required.test.ts` | 9 |
| **合计** | **Test Files 12 passed / Tests 220 passed** |

## 2. 元判据（改坏看变红 → 还原后复绿）

**只跑绿的那一向等于没跑**：它只证明"没红"，不证明"判据在量东西"。故两条都做了**负向**实跑。

```bash
# 演练 A 负向：把锚点门里的非骨架判据调用摘掉（模拟"门没接上"）
# 实测：tests/prototype-placeholder-gate.test.ts → 4 failed | 10 passed   ← 变红
# 还原后：14 passed

# 演练 B 负向：把对照项取数退回「台账按字典序取首项」（模拟"回到旧行为"）
# 实测：tests/verification-prototype-compare-required.test.ts → 2 failed | 7 passed   ← 变红
# 还原后：9 passed

# 还原完整性：两个被演练改动的文件与备份逐字节一致
diff -q /tmp/drill-gate.ts src/application/internal/prototype-anchor-gate.ts
diff -q /tmp/drill-sv.ts   src/application/use-cases/SubmitVerification.ts
```

**演练 A 的正向三向**（在 `tests/prototype-placeholder-gate.test.ts` 内逐条有用例）：

1. 真实骨架占权威位 → `prototype_placeholder`，`gaps` 点名 `prototypes/detail.html`；
2. 换成填过的原型 → `undefined`（放行）；
3. 不注入模板基线 → `undefined`（**不判、不假红**）。

**演练 B 的靶子设计**：台账登记的产物路径（`zz-ledger.html`）与 INDEX 的权威行
（`aa-authoritative.html`）**故意不同**，断言验收单必须取 INDEX 那条——
退回"按台账字典序取首项"这条断言必红。

## 3. 类型与构建

```bash
npx tsc --noEmit | grep -E '本需求改动的九个文件'   # → 无输出（零类型错误）
pnpm build:client                                    # → [verify-client] OK  bundle=721645 bytes
pnpm build                                           # → Build complete
```

## 4. 非骨架判据的实测标定（判据为什么用 0.90）

对全仓 21 份原型逐份比对「去占位符归一后的骨架非空行覆盖率」：

| 档 | 读数 |
|---|---|
| 空骨架（与模板只差标题/req_id/日期） | **0.957** |
| 真稿（本需求自己的原型） | **0.391** |
| 正向样本（REQ-261006175040-12d4 的 `card-gates.html`） | **0.304** |
| 半成品（REQ-261006092213-4f5b 的 `verification-result.html`） | **0.326** |
| **中间带** | **无样本** |

阈值 0.90 落在**峰谷**里，不靠调参。

**已知边界（如实记录）**：占位标记只占骨架的少数行。人若把**每一处**标记字面都换掉、
行数与缩进照抄，覆盖率会掉到 **0.870**（阈值之下）而漏过。该读数由
`tests/prototype-placeholder.test.ts` 的一条专门用例锁死——将来调阈值或改模板时它会先红。

## 5. 存量零回归（反向核对，不是"应该无关"）

- 摘掉本需求改动 → 跑同一批既有套件 → 失败集合逐条比对：**失败者与改动前完全一致**
  （零输入裁决 2 条、归档材料 3 条、size-budget 1 条，均来自其它链的在制改动或仓库既有状态）；
- 存量需求的非骨架判据与几何量证据按 `createdAt < DOC_QUALITY_RULES_SINCE` **整段不判**
  （用例：旧 `createdAt` + 骨架 → 放行）；
- `shot` / `shotSha256` 为**加性可选键**：旧分片缺键 = 未采集 → 放行，**不补齐、不改写**。

## 6. 逐条对应需求验收标准

| 需求 §验收标准 | 判据 | 读数 |
|---|---|---|
| 1. 反向演练 A（必红→必绿） | `tests/prototype-placeholder-gate.test.ts` | 14 passed；负向 4 failed |
| 2. 反向演练 B（删分支必红） | `tests/verification-prototype-compare-required.test.ts` | 9 passed；负向 2 failed |
| 3. `npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts` 全绿 | 上文 §1 | 12 files / 220 passed |
| 4. `pnpm build` 与 `pnpm build:client` 通过 | 上文 §3 | Build complete / verify-client OK |
| 5. 存量需求零回归 | 上文 §5 | 失败集合逐条一致 |
| 6. 本需求自己的原型过 FR-1 判据 | `tests/prototype-placeholder.test.ts` 自洽性用例 | 不命中，`lineRatio` 0.391 < 0.90 |

## 7. 覆盖标注（covers）

本文件与上文全部套件共同覆盖本需求全部任务卡（**6 父卡 + 15 子卡 = 21 张**）：

covers: t-d10419, t-213142, t-da2ad7, t-271dda, t-ba91c2, t-c014e0, t-19a902, t-2a981f, t-fd676c, t-35d832, t-1bf375, t-dd3dc6, t-6056bf, t-cab576, t-4318ce, t-819f23, t-6e3179, t-0d79a4, t-8195aa, t-2f1126, t-9d504b
