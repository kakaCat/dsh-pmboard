# 测试证据 · 技术规范自动沉淀（REQ-261001143526-8475）

> TL;DR：新增 2 个测试文件（20 条用例）把「覆盖清单 / 四要素 / 缺口编号 / 骨架 / 提示词接入」锁死；
> 门禁侧新增 K10 并接进 `pnpm run kb:check`；兼容性用 HEAD worktree 对比（**零新增失败**）。

## 一、用例清单

| 文件 | 条数 | 锁什么 |
|---|---|---|
| `tests/kb-operations.test.ts` | 11 | 覆盖清单（scripts ∪ 白名单）/ 排除表**必填理由**（空理由抛错）/ scripts 未归类点名 / 四要素校验（时机枚举·命令 runner 与路径·期望锚点·失败怎么办指向·待补占位即红）/ 缺口与编号 / 骨架与索引行 |
| `tests/kb-prompt-wiring.test.ts` | 9 | 三阶段 × 两档合成文本各含 `reqboard_kb` / floor 未被注入说明 / 阶段句子落在可维护位置 / heavy.md 仍是 vendor 逐字节镜像 |

```
$ npx vitest run tests/kb-operations.test.ts tests/kb-prompt-wiring.test.ts
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

## 二、门禁与脚本（可复核命令）

| 命令 | 期望 | 实测 |
|---|---|---|
| `pnpm run kb:check` | 退出码 0 | ✅ 十项全过（K1–K9 + K10） |
| `pnpm run kb:conventions` | 退出码 0 | ✅ 零缺口、零漂移 |
| `npx tsx scripts/kb-conventions-sync.mts --write` | 幂等（连跑第二次零变化） | ✅ 规范页零变化 |
| `node scripts/inline-prompt-fragments.mjs` + `check-prompt-fragments.mjs` | 退出码 0 | ✅ 产物一致 + heavy.md 与 vendor 逐字节一致 |
| `npx vitest run tests/prompt-gates.test.ts tests/prompt-tiers.test.ts` | 全绿 | ✅ 22 passed / 40 passed（light ≤2500 字符） |

## 三、收尾演练（缺口 → 骨架 → 补全 → 绿）

`python3 docs/requirements/REQ-261001143526-8475/evidence/t7-drill.py` → 退出码依次 **1 → 0 → 0 → 0**，还原后复检 0。
证据：`docs/requirements/REQ-261001143526-8475/evidence/t7-drill.txt`。

## 四、兼容与预算（HEAD 对照）

| 项 | 开工前 | 现在 | 结论 |
|---|---|---|---|
| 全量 `pnpm test` 失败数 | 106 | **106** | 零新增失败 |
| 全量通过数 | 2787 | **2807** | +20（本需求用例） |
| 提示词四文件（HEAD 对照） | 10 failed / 92 passed | 10 failed / 92 passed | 与 HEAD 完全一致 |
| light 档字符数 | ≤2500 | ≤2500 | 未破上限 |

证据：`docs/requirements/REQ-261001143526-8475/evidence/t6-regression.txt`。

## 五、任务覆盖标注（covers · 门禁可解析）

- `tests/kb-operations.test.ts` — covers: t-2fc136, t-4565ce, t-c7ef62, t-30f7a8
- `scripts/kb-conventions-sync.mts` + `evidence/t7-drill.txt` — covers: t-faf37d, t-4b34c9, t-9054a8, t-e6594f, t-9e87c1
- `scripts/kb-probe.mts`（K10）+ `evidence/t7-drill.txt` — covers: t-561faa, t-5563b3, t-23014c, t-2967e2
- `tests/kb-prompt-wiring.test.ts` + `tests/prompt-gates.test.ts` — covers: t-cbef05, t-09a389, t-e9e086, t-3bcbcc, t-b3f944
- `docs/knowledge/conventions.md` + `docs/knowledge/INDEX.md` + `pnpm run kb:check` — covers: t-96b163, t-a6f715, t-4f8025
- `evidence/t6-regression.txt` + `pnpm test` — covers: t-3329c2, t-cafd6b, t-9dcb52, t-32aa02
- `evidence/t7-drill.py` / `t7-drill.txt` — covers: t-f0f787, t-437f7c, t-e482e7, t-32e602
- `package.json`(kb:conventions) + `README.md` + `docs/architecture/project-manual.md` — covers: t-0b4d22, t-c79e00, t-60af58
