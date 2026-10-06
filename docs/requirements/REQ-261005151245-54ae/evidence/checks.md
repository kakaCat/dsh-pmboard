---
req_id: REQ-261005151245-54ae
kind: evidence
---

# 机器自检证据（t5）

> 生成时机：实施完成后（2026-10-05 15:37 前后），工作区 `dsh-pmboard` 根目录。
> 口径：**命令 + 输出摘要 + 失败归属**；与本需求无关的既存失败逐条点名，不含糊带过。
> 结论先给：**本需求改动面全绿**（新用例 57 条 + 六个受影响套件 112 条 + 探针退出码 0 + tsc 0 错误 + build 退出码 0），
> 仓库级门禁有 3 项**改动前就是红的**（size-budget / layer-boundary / kb:check），逐项在下文交代归属。

## 1. 主用例集（新增）

```bash
npx vitest run tests/open-window-inherit.test.ts
# → Test Files 1 passed (1) / Tests 57 passed (57)
```

覆盖五组：纯函数（标题递增三形态 + BigInt 大序号）、读画像归一（空串/纯空白/非字符串/非对象返回）、
模式三态、落定编排（不短路 / 文案逐字 / 未装配写能力两条）、适配器三方法（假宿主服务断言入参）、
用例级 T-01~T-14、兼容（旧替身 / 旧回执键集合 / 底稿投递键不被挤掉）。

## 2. 受影响既有套件（回归）

```bash
npx vitest run tests/open-window-inherit.test.ts tests/open-window-tool.test.ts \
  tests/handoff-owner.test.ts tests/open-window-project-root.test.ts \
  tests/reqboard/settings-migrate-dispatch.test.ts tests/capture-window-bound-policy.test.ts
# → Test Files 6 passed (6) / Tests 112 passed (112)
```

其中 `tests/handoff-owner.test.ts` 新增「新建窗口带回执 / 指定已有窗口不带」两条；
`tests/reqboard/settings-migrate-dispatch.test.ts` 新增 T-15 / T-15b 两条（迁移窗口显式语义标题 + 模式随请求带入 + 回执三态）。

## 3. 探针（真适配器 + 真用例 + 真继承模块，只换假宿主服务）

```bash
npx tsx scripts/open-window-inherit-probe.mts
# → exit 0
#   source_title  = 登录重构 (2)      child_title   = 登录重构 (3)
#   source_preset = cordis            child_preset  = cordis
#   source_model  = {deepseek, deepseek-reasoner, high}
#   child_model   = {deepseek, deepseek-reasoner, high}
#   elapsed = readProfile 0.00ms / rename 0.00ms / selectModel 0.00ms / total 0.81ms
#   [probe] OK：三对读数相等，继承闭环成立
```

## 4. 类型与构建

```bash
npx tsc --noEmit      # → 0 错误
pnpm build            # → 退出码 0
#   ✔ Build complete（host dist/index.mjs 2045418 bytes）
#   [verify-client] OK  bundle=591550 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

## 5. 全量测试与基线归属

```bash
npx vitest run --reporter=basic
# → Test Files 37 failed | 439 passed | 3 skipped (479)
#   Tests 68 failed | 5466 passed | 22 skipped (5556)
```

**逐条核对归属：68 条失败全部不在本需求改动面**。核对方法：① 取全部失败文件名，与本需求改动文件清单求交 →
空；② 对唯一同族的两条（`tests/handoff.test.ts` 两条）做根因抽查，报错均为
`REQBOARD_DEPENDENCY_GATE`（任务上层依赖未完成），栈落在 `src/application/use-cases/MoveTask.ts:126` /
`src/repositories/QueueTaskStore.ts:216` —— 本需求**未触碰**这两个文件，报错内容也与继承无关。

| 既存红项 | 现状 | 与本需求的关系 |
|---|---|---|
| `tests/size-budget.test.ts` | 1 failed（30+ 个超标文件，含 `application/ports.ts` 1569 行、`application/use-cases/HandoffOwner.ts` 444 行） | **改动前即红**（两个文件在改动前都已超 400 行）。本需求给这两个文件分别加了约 72 / 27 行，**没有新增失败用例**，但确实让已超限的文件更长——按"不在本需求内重构"的边界，如实记录、不动结构 |
| `tests/layer-boundary.test.ts` | 3 failed（application 越界 import / domain 用 Date.now / http 状态字面量） | 失败条目逐条核对，**无一条**落在本需求改动文件；`window-inherit.ts` 只 import `domain/text/fmt.js` 与 type-only `ports.js` |
| `pnpm kb:check` | 退出码 1 | 生成物零漂移通过；红在「`scripts/` 未归类文件」：`.probe`、`doc-section-parity.mts`、`rework-inverse-verification.mts`、`rollback-landing-replay.mts`、`template-gate-probe.mts`、`template-render-map.json` —— **全部是本次改动之前既存**（改动前该清单多一个本需求新增的探针）。本需求的 `open-window-inherit-probe.mts` 已按既有惯例登记进 `EXTRA_ENTRIES`（`src/domain/knowledge/operations.ts`），登记后本需求对该门禁的贡献为**零** |
| `tests/output-contract.test.ts` | 4 failed | 全部是他人卡片（DefineTaskAdoptTool / DefineKnowledgeTool / DefineRegenerateTool / DefineSkillInstallTool 缺 RESPONSE_SOURCES）；本需求的两个工具壳在该测试内通过 |

基线说明：仓库规范页记录的基线是「106 failed / 2807 passed」，与当前树（5556 条）已不可比
（用例总数被其他窗口扩到两倍）。故本需求采用**归属核对**而非绝对数比对，逐条点名如上。

## 6. 存量与生成物

```bash
npx tsx scripts/kb-build.mts --write   # → 退出码 0；符号 2965 条 · INDEX 110 行
pnpm kb:check                          # → 生成物零漂移；仅余 scripts 未归类 6 条（见上表）
git status --porcelain docs/knowledge  # → 生成物已同步（新增模块进代码地图）
```

## 7. 结论

- 本需求交付面（新用例 + 探针 + tsc + build + 六个受影响套件）**全绿**。
- 仓库级门禁的 3 项红为**既存**且**逐条点名**（含本需求贡献为零的 kb:check）；
  `size-budget` 一项因本需求给两个已超限文件加行而"更红"，已如实记录，重构不在本需求边界内。
- 实机三处观察（侧栏标题 / 模式芯片 / 模型选择器）见 `live-check.md`（需人在重启插件后核对）。
