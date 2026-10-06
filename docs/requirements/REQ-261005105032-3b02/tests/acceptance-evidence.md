# 测试证据（REQ-261005105032-3b02）

> 本文件是验收要求的「测试证据」汇编：**命令 + 真实输出摘要**，全部由实施窗口在交付前独立重跑。
> 复核方式：按下方命令原样执行即可复现；数字口径与 `notes/e2e-evidence.md` 一致。

## 1. 本需求全部相关用例（一次跑完）

```bash
npx vitest run \
 tests/artifact-spec.test.ts tests/artifact-labels.test.ts \
 tests/gate-feedback-envelope.test.ts tests/http-envelope-status.test.ts \
 tests/clause-numbering.test.ts tests/serve-extraction.test.ts \
 tests/prototype-gates.test.ts tests/prototype-metadata-parse.test.ts \
 tests/decision-gates.test.ts tests/move-gate-paths.test.ts \
 tests/rtm-prototype-sections.test.ts tests/rtm-coverage-prototype.test.ts tests/rtm-validator-tolerance.test.ts \
 tests/rtm-trigger-prototype.test.ts tests/rtm-health-legacy.test.ts \
 tests/submit-prototype.test.ts tests/submit-prototype-exempt.test.ts \
 tests/prototype-skeleton.test.ts tests/plan-prototype-anchor-gate.test.ts tests/stage-gate-timeline.test.ts \
 tests/category-doc-sets.test.ts tests/subtask-prompt-prototype.test.ts tests/node-input-package.test.ts \
 tests/round-state-dive.test.ts tests/docs-panel.test.ts tests/query-docs.test.ts \
 tests/accept-sheet-rtm-integration.test.ts tests/accept-sheet-tool.test.ts tests/acceptance-criteria.test.ts \
 tests/plan-prototype-anchor-gate.test.ts tests/probe-hard-criteria.test.ts tests/compat-regression.test.ts
```

结果：

```
Test Files  2 failed | 37 passed (39)
     Tests  6 failed | 628 passed | 2 skipped (636)
```

6 例红的逐条归因（均与本需求无关）：

| 文件 | 例数 | 归因证据 |
|---|---|---|
| `tests/dive-gate-prompt.test.ts` | 2 | 在**干净 HEAD worktree** 上同样 2 红（基线红） |
| `tests/output-contract.test.ts` | 4 | 他人新增的四个工具缺响应源映射（`TaskAdopt`/`Knowledge`/`Regenerate`/`SkillInstall`）；`prototype` 关键字命中 0 |

## 2. 四条机械探针

```bash
pnpm templates:check            # R1 模板过门禁 + R2 门禁节名↔模板节名
npx tsx scripts/prompt-path-probe.mts   # R3 提示词路径可达
pnpm prompts:verify             # R4 内联产物新鲜度（只校验、不重生成）
```

| 探针 | 结果 |
|---|---|
| R1 | `模板 25 份：OK 25 / FAIL 0；缺口 0；观察 4（不计入判据）；文档自检缺口 0；exit 0` |
| R2 | `需求模板 6 类：OK 6 / FAIL 0；双向漂移 0；exit 0` |
| R3 | `token 20 个（真实存在 4 / 产物名白名单 16）；缺口 0；exit 0` |
| R4 | `OK: generated/fragments.ts 与 fragments/**.md 一致；heavy.md ↔ vendor 原文逐字节一致` |

## 3. 文档自检（9 项）

```bash
npx tsx scripts/req-doc-validate.mts --req REQ-261005105032-3b02
```

判据：必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling。
本需求：**实判 8 项、读数未知 1 项（E2E：无测试策略表 ⇒ 无判据对象，不判）、缺口 0**。

## 4. 逆向演练（六条，全部"改坏必红"）

```bash
npx tsx scripts/reverse-drill-matrix.mts
```

| 改坏点 | 期望 | 实测 |
|---|---|---|
| R1 模板节标题 | 必红 | exit 1，点名 `FAIL templates/brainstorming/feature.md` |
| R1 渲染映射表项 | 必红 | 点名「模板含未登记占位符 `{{PROTOTYPE_REFS}}`」 |
| R2 节名集合 | 必红 | 点名「[模板多一节]『多出来的一节』没登记」 |
| R3 路径指针 | 必红 | 点名 `templates/rewrite-drill-missing-t23.md ← …/feature.md:8` |
| R4 未重生成 | 必红 | 点名「首个差异偏移 67077」 |
| 抹除锚点（stripPrototypeAnchors 移除） | 必红 | `tests/serve-extraction.test.ts` 12 例中 9 例红 |

七条还原全部过 sha256 逐字节核对；还原过程有并发写入检测（他人改过则放弃还原并报错）。

## 5. 三次 dogfood（已固化为可复跑命令）

```bash
npx tsx scripts/self-gate-dogfood.mts    # 9/9
```

- **A 裁定门**：本需求文档放行 → 把 D-14 的「影响 FR」改回「全 FR」→ 点名 `D-14（影响 FR 未命中真实条款）` → 还原后放行；
- **B 原型门**：本需求 `prototype_missing`；`exempted=legacy required=false`（存量不追溯）；
- **C 时序门**：E2E 读数 `undefined` → 放行；把读数改回恒 `false` → `stage_gate_overdue`。

## 6. 探针硬判据与退出码

```bash
npx tsx scripts/req-report-probe.mts                 # exit 0 + PROBE PASS（4/4 组合）
CHROME_BIN=/nonexistent npx tsx scripts/req-report-probe.mts   # exit 2（不许静默回退）
npx vitest run tests/probe-hard-criteria.test.ts     # 9 passed；21 项几何量全部有失败分支
```

## 7. 类型检查与客户端构建

```bash
npx tsc --noEmit -p tsconfig.json    # exit 0（0 行输出）
```

## 8. 全量套件与归因

```
Test Files  36 failed | 448 passed | 3 skipped (487)
     Tests  67 failed | 5594 passed | 22 skipped (5683)
```

与第 1 节 39 个文件求交集 = **恰好 2 个**（即上表那 2 个文件，均已归因）；本需求其余 37 个文件在全量跑里同样绿。
