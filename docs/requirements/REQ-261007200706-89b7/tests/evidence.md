# 测试证据（REQ-261007200706-89b7）

> 命令 + 输出摘要逐条留档。执行环境：dsh-pmboard 工作树（HEAD c49fd5e + 本批改动 + 他条需求在飞改动），2026-10-07。

## E-1 全量回归（行为等价第一层） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

```bash
npx vitest run            # 全量
```

输出摘要：

```
 Test Files  38 failed | 550 passed | 3 skipped (591)
      Tests  68 failed | 6947 passed | 22 skipped (7037)
```

**同树 A/B 对照（本批的严格判据）**：开工前同树基线失败集合 69 条 → 本批后 68 条，
逐条比对 `新增红 = 0`（差额 1 条为既有抖动用例转绿）。逐卡亦各自做过「回退本卡改动 → 跑 → 恢复 → 跑」的 A/B。

covers: t-11f25a, t-dc1eaf

## E-2 类型 / 检查 / 构建（行为等价第二层） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

```bash
pnpm typecheck        # → exit 0
pnpm prompts:check    # → exit 0（inline-prompt-fragments + check-prompt-fragments + prompt-path-probe）
pnpm build            # → exit 0
```

`pnpm build` 尾部：

```
✔ Build complete in 1000ms
wrapped dsh-pmboard -> lib/client.js 667409 bytes
[verify-client] OK  bundle=766820 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

covers: t-11f25a, t-dc1eaf

## E-3 探针（新增机械检查） <!-- serves: FR-1 -->

```bash
npx tsx scripts/prompt-path-probe.mts
```

```
[prompt-path-probe] OK 路径可达 + 禁词前缀（57 份片段 + src/application/dive/round-state.ts
  + agent 文案面 76 份）：token 39 个（真实存在 8 / 产物名白名单 31）；禁词命中 0
[prompt-path-probe] 缺口 0；exit 0
```

```bash
npx tsx scripts/prompt-path-probe.mts --specimen --json
```

```json
{"specimen":{"ok":true,"redOnInjected":true,"whitePasses":true,"redOnForbidden":true,
 "agentSurfaceScanned":76},"exitCode":0}
```

**真实仓负例（非合成）**：在 `src/tools/` 建临时 `.ts`，内容含 `templates/probe-negative-missing.md`
与 `agent-dh/docs/architecture/x.md` → 探针 `exit 1` 且两条逐一点名（`文件:行` 正确指向 `:1`）；
删除临时文件 → `exit 0`。

covers: t-516ddb, t-540531, t-c702ff, t-55c3e1, t-30857b, t-cd4f34, t-5d876c, t-2f2bdf

## E-4 新增/升级用例 <!-- serves: FR-1, FR-3, FR-5, FR-6 -->

```bash
npx vitest run tests/prompt-path-probe-tools-surface.test.ts tests/submit-prompt-budget.test.ts \
  tests/arg-guidance.test.ts tests/ask-confirm-prompt.test.ts
```

```
 ✓ tests/submit-prompt-budget.test.ts           (5 tests)
 ✓ tests/ask-confirm-prompt.test.ts             (4 tests)
 ✓ tests/arg-guidance.test.ts                   (13 tests)
 ✓ tests/prompt-path-probe-tools-surface.test.ts (4 tests)
 Test Files  4 passed (4)
      Tests  26 passed (26)
```

covers: t-d36c56, t-dfca3e, t-ddf3c5, t-ee9299, t-59aefb, t-54debe, t-352e17, t-ce91f7, t-6b1057, t-5acdf4, t-de8c5f, t-7a8806, t-6f52a8, t-70bbad, t-c15e63

## E-5 七组判据逐条读数 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| FR | 命令 | 读数 |
|----|------|------|
| FR-1 | `grep -rn "agent-dh/docs/architecture/requirement-archive\|docs/standards/tool-development" src --include=*.ts \| wc -l` | 0 |
| FR-1 | `npx tsx scripts/prompt-path-probe.mts --json`（`counts.forbidden`） | 0 |
| FR-2 | `grep -rn "三问\|四问\|五问" src README.md --include=*.ts \| grep -v QueryReport.ts \| grep -v capture-mapping.ts \| wc -l` | 0 |
| FR-2 | `grep -c doc_location src/tools/CreateTool/prompt.ts` | 2 |
| FR-3 | `npx tsx` 实测 `SUBMIT_PROMPT.length` | 1289（基线 1966，阈值 ≤1300） |
| FR-3 | `grep -rn "五类\|五个提交入口" src/tools/SubmitTool \| wc -l` | 0 |
| FR-4 | 分类脚本统计 `src/tools` 非注释 REQ 编号 | 0 |
| FR-4 | `npx tsx` 实测 `RUN_STATUS_PROMPT.length` | 663（基线 810） |
| FR-5 | 运行时 audit：幂等 5 字段含 SPLIT / 一次性 6 字段不含 SPLIT | 全符合 |
| FR-6 | `grep -c "全部写路径" src/tools/AskConfirmTool/prompt.ts` | 1 |
| FR-6 | `grep -c "expectedWindowIndex（CAS 号）：与你看到的窗口号一致才换窗" src/tools/TaskMoveTool/TaskMoveTool.ts` | 1 |
| FR-7 | `grep -c "13 个" cordis.patch.yml` | 0 |
| FR-7 | `python3 -c "import json;r=json.load(open('package.json'))['repository'];print('directory' in r, r['url'])"` | `False git+https://github.com/kakaCat/dsh-pmboard.git` |

covers: t-fed418, t-34f8ff, t-6c0ef3, t-516ddb, t-540531, t-d36c56, t-ee9299, t-352e17, t-5acdf4, t-6f52a8

## E-6 异常项与基线说明 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- `tsx scripts/test-baseline.mts --check` → FAIL：**开工前既有**（工作树混有其他需求未提交改动，
  基线文件相对工作树过期）。本批以同树 A/B 取代该判据，结论为新增红 0。
- 既有红：68 条（含 `size-budget`／`kb-*`／`live-tasks-single-source` 等），全部在开工前失败集合内。
- 并行抖动：`canceled-legacy-read.test.ts`、`reqboard/settings-init.test.ts` 全量偶红、单跑通过。

covers: t-11f25a, t-dc1eaf

## E-7 收工后工作树漂移（复核时补记） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

本批收工后，工作树又并入了**其他需求**的改动（插件 build 由 `b23b4a90b389` 变为 `e541b9b678ed`；
其中一项按体检报告 S3 把 `reqboard_run_status` 并入了 `status`——本批 FR-4 的目标文件
`src/tools/RunStatusTool/prompt.ts` 因此已不存在）。复核时按**新表面**重取证：

| 判据 | 收工时 | 复核时（新表面） |
|------|--------|-----------------|
| FR-1 死路径 | 0 命中 | 0 命中 |
| FR-1 探针 | agent 文案面 76 份 / token 39 / 禁词 0 / 缺口 0 | agent 文案面 66 份 / token 37 / 禁词 0 / 缺口 0（工具面变少所致） |
| FR-2 问数残留（事实源外） | 0 | 0 |
| FR-3 `SUBMIT_PROMPT.length` | 1289 | 1289 |
| FR-4 agent 可见面非注释 REQ 编号 | 0（RunStatusTool 663 字符） | 0；`曾声称` / `原样透传 null` 两段修复史命中 0（文件被并入时史已一并清掉） |
| FR-6 `全部写路径` | 1 | 1 |
| FR-7 `13 个` | 0 | 0 |
| 全量 vitest | 68 failed / 6947 passed（7037） | 69 failed / 7091 passed（7160）：测试总数增长来自他批；**本批收工时的同树 A/B（新增红 0）仍是本批的唯一归因证据**（见 E-1/E-6） |

结论：本批七组判据在旧表面与新表面**读数一致**；工具面变化由他批引入，不改变本批判据。

covers: t-11f25a, t-dc1eaf
