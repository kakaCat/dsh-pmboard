# 文档与知识层同步（REQ-261004065652-5c1c t10）

## 一、三份文档改了什么

| 文档 | 新增内容 | 与实现的一致性锚点 |
|---|---|---|
| `docs/architecture/automation-chain-contract.md` | 新增 **第六节「起轮前的四道停机前置」**（判据表 + 三条不变量 + 可复跑判据 + "不负责什么"），原第六节顺延为第七节并在入口清单里补本轮证据 | 判定顺序抄自 `round-driver.drive()` 的实际行序：`readyToDrive`（内含 `latchBlocks` L270 → `inBackoff` L271）→ `providerLatch` L398 → `humanGate` L442 → `chainBudget` L456 |
| `docs/architecture/project-manual.md` | 新增「机制备忘：让自动链'该停就停'的四道前置」+ 变更记录一行 | 手册里给的三条认知（写了≠读得到 / 停机位唯一 / 超限与故障分家）逐条对应本轮实现 |
| `docs/knowledge/conventions.md` | 新增两条工程操作条目 **C-20 / C-21**（反向演练矩阵、台账副本演练），四要素齐全 | C-20/C-21 的命令与 `src/domain/knowledge/operations.ts` 的 `EXTRA_ENTRIES` 同源 |

**四道前置的判据表**（摘要；完整表在契约文档）：

| # | 前置 | 放行条件 | 命中时写什么 | 缺省不装配时 |
|---|---|---|---|---|
| ① | 内存闭锁（+退避） | 无闭锁且未在退避窗口 | 无（纯内存，不依赖 I/O） | 不拦 |
| ② | 全局上游闩 | `providerLatch.isOpen() === false` | 无 | 不拦 |
| ③ | 人工门 | 验收单无待裁决 / 无未确认门类产物 / 计划已批准 | **不写健康位、不改 activation** | 不拦 |
| ④ | 预算闸 | 在跑链 < 3 且 cacheRead < 5×10⁸ | 无（只拒绝，不杀在跑链） | 不拦 |

## 二、引用路径逐条 `ls` 通过

文档新增节里引用的每个路径都实测存在（15/15）：

```
✓ scripts/reverse-drill-matrix.mts            ✓ scripts/reconcile-terminal-drill.mts
✓ docs/requirements/REQ-261004065652-5c1c/evidence/{decisions,regression,reconcile-drill,AskConfirm.recovery-notes}.md
✓ tests/{dive-loop-breaker,dive-abort-latch,dive-human-gate-stop,chain-budget,store-projection-ryow}.test.ts
✓ src/application/internal/reconcile-terminal-dive.ts   ✓ src/application/dive/round-driver.ts
✓ src/domain/knowledge/operations.ts          ✓ docs/knowledge/conventions.md
```

## 三、知识层自检

```bash
pnpm kb:check
```

```
✅ K7 生成物与源码一致（零漂移）
✅ K8 10 条规范全部挂真实可跑校验
✅ K9 符号表 2153 行 = 源码口径 2153 条
✅ K10 覆盖 10 项全部有条目、四要素齐全、清单零漂移（条目 11 条）
✅ K11 11 条规范期望可判定、豁免均带基线
kb-probe: 全部通过（11 项检查）
```

> 开工时 `kb:check` 是**红的**（代码地图漂移 2 处）：本轮新增 42 个符号没重生成。已 `kb-build --write` 重生成；
> 两条新脚本按纪律进**白名单 + 理由**（而不是塞进排除表）。`tests/kb-operations.test.ts` 的白名单条数断言同步 8 → 10。

## 四、AskConfirm 风格债整形（D-6）

按裁定在 t10 统一整形（只动形式、不动行为）：

| 项 | 整形前 | 整形后 |
|---|---|---|
| 双引号字符串 | 51 行 | 0（残留 4 个引号是**句内引号内容**，非串定界符） |
| `void 0` | 21 | 0 |
| 行尾分号 | 88 | 0 |

验收：`npx tsc --noEmit | grep -c 'error TS'` = **144**（持平）；
`ask-confirm-blocking` 5/5 绿、`default-grace` 7/7 绿、`confirm-evidence` 8/8 绿、
`concurrency-limits` 8/8 绿、`pending`/`confirm` 各 1 条既有失败（与整形前一致）。

**诚实记录一次失败**：第一版整形脚本先把 `\"` 反转义、再按行配对替换引号，造成引号错配
（字符串里的 `"…"` 被当成定界符）——`tsc` 立刻报 4 个错误、5 个用例文件无法收集。
**因为动手前做了文件级备份（sha256 已校验），立刻还原并改用"一次性成对 + 转义安全"的正则**，
一次通过。这再次印证本轮写进 C-20 的那条纪律：**不要用 `git checkout` 还原，用文件备份 + 逐字节校验**。

## 五、判据（可复跑）

```bash
pnpm kb:check                                   # 知识层自检（11 项全绿）
npx tsc --noEmit | grep -c 'error TS'           # 144 = 基线
npx vitest run --reporter=dot                   # 48 failed files / 98 failed / 3635 passed
comm -3 <(基线失败名称集) <(当前失败名称集)      # 空 = 零新增失败
```
