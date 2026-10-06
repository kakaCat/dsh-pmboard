# 回归收尾与门禁总览（t-36dca3）

> 本文件是收尾时的**一次性实测快照**（2026-10-05）。命令与观测值都照抄，不"应该没问题"。

## 1. 逐项门禁

| # | 判据 | 命令 | 实测 | 结论 |
|---|---|---|---|---|
| ① | 指纹无漂移 | `node scripts/vendor-skills.mjs --check` | exit 0；`28 条 sha256 一致；清单 7 项与磁盘一致；合计 2801800 B` | ✅ |
| ② | 片段↔产物一致 | `node scripts/check-prompt-fragments.mjs` | exit 0（含 heavy.md ↔ vendor 原文逐字节一致） | ✅ |
| ③ | P1 基线显式更新 | `node scripts/dump-stage-prompts.mjs` | 已重生成（keys=12） | ✅ |
| ④ | 类型检查 | `npx tsc --noEmit` | **0** 条 error TS（开工基线为 1；另一个窗口在此期间修掉了那条既有错误） | ✅ 新增 0 |
| ⑤ | 本需求四份用例 | `npx vitest run tests/skills-assets.test.ts tests/skills-materialize.test.ts tests/skills-provenance.test.ts tests/skills-injection.test.ts` | 45 passed | ✅ |
| ⑥ | 提示词相关 11 份用例 | 见 `tests/prompt-*.test.ts` 等 | 327 passed | ✅ |
| ⑦ | 指定回归 | `npx vitest run tests/reqboard tests/application tests/http` | 1 failed / 577 passed（开工基线 1 failed / 569 passed） | ✅ 失败数未增 |
| ⑧ | 全量套件 | `npx vitest run` | 68 failed / 5087 passed（开工基线 69 failed） | ✅ 未增 |
| ⑨ | 知识层自检 | `pnpm kb:check` | **exit 1** —— 见"外部阻塞" | ⚠️ 非本需求所致 |

## 2. 知识层：本需求的部分是绿的

- 覆盖清单不再漂移：`node scripts/vendor-skills.mjs` 已进白名单 + 规范页新增 **C-22**，
  `docs/knowledge/operations.tsv` 已 `--write` 重生成。
- 新条目 `docs/knowledge/entries/kb-0043.md` 落库，`pnpm kb:build` 后 INDEX 未见漂移。
- 生成物（code-map 等）已多次 `--write` 重生成；**在某个静止瞬间实测 `kb-build.mts --check` 为 0 漂移**，
  但随即又被并发改动带出新的漂移（见下）。

## 3. 外部阻塞（如实报出，不掩盖）

`pnpm kb:check` 在本需求收尾时**无法转绿**，两个原因**都不来自本需求的改动**：

### 3.1 三个未归类条目（他人在飞）

```
scripts/ 未归类文件：.probe、rework-inverse-verification.mts、rollback-landing-replay.mts
```

- 两个 `.mts` 文件时间戳 12:46/12:47、`scripts/.probe/` 是 11:34 的临时目录（已在 `.gitignore` 第 8 行声明忽略）；
  三者均属**另一个并发窗口**的在飞工作。
- 本需求**不擅自**替别人登记/删除（跨范围，且可能是对方正在写的临时脚本）。

### 3.2 code-map 是**全仓源码的派生物**，而另一窗口正在持续改源码

- 实测：连续三次生成符号数 2878 → 2880 → 2881，`find -newermt '-3 minutes'` 命中
  `src/shared/protocol.ts`、`src/application/query/QueryDocs.ts`、`src/client/views/panels/docs.ts` 等。
- 即：**只要对方还在写源码，`code-map.md` / `code-map.symbols.tsv` 就不可能收敛**；
  这与"本需求改了知识层内容却忘了重生成"是两回事。
- 本需求已按 C-13 反复 `--write` 重生成；建议**在静止的工作树上复核一次**本文件第 1 节的命令。

### 3.3 若要求"此刻必须全绿"的最小干预（未执行）

① 给 `listUnclassified` 加"跳过 `.` 开头条目"（消掉 `.probe`），另两个由对方登记；
② 等对方收口后重跑 `pnpm kb:check`。**本需求未做 ①**，因为它属共享基础设施且不解决全部三项。

## 4. 反向演练（两处，均实跑）

| 演练 | 反转动作 | 期望 | 实测 | 记录 |
|---|---|---|---|---|
| 指纹门禁承重 | 把 sha256 比对改成 `if (false)` + 篡改一字节 | 门禁空转（exit 0） | `--check` **exit 0**（篡改被放过） | `notes/vendor-drift-drill.md` |
| 本节可裁承重 | 把该片段优先级 10 改成 `floor` + 重生成 | TC-13 必红 | **1 failed / 9 passed** | `notes/nonfloor-drill.md` |

两处反转的脚本改动**已逐字节还原**（`diff -q` 与备份一致），还原后门禁恢复绿。

## 5. 已知的并发风险（写进验收材料）

本需求实施期间，**另一个窗口在同一工作树内并行改动**（可见 `src/client/**`、`src/application/internal/**`、
`tests/**` 等多处非本需求的改动）。本需求的所有判定都**限定在自己的文件集**上复算过
（例如"全量套件 37 个失败文件里没有一个是本需求的 skills 用例"），但仍建议验收时以本文件命令
在**静止的工作树**上复核一次。
