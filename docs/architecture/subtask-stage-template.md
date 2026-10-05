# 子卡阶段模板：一条链的段从哪来、加一段要登记哪几处、manual 段为什么能停链（L2 领域篇）

> **TL;DR**：父卡开工时，`stageKind` 链按**五档优先级**解析出来（显式 `stages` > `template` 键 >
> `phase` 表 > `side` 表 > 需求分类表 > 兜底 `dev+review`），链上每一张子卡就是一个阶段。
> 阶段是**受控枚举**（现 20 段），加一段必须在**五张 `Record<StageKind,…>` 表**里同时登记（漏一处 = 编译错，
> 加上枚举自身共 6 个登记点）；另有三个非类型强制点（链行为、fixture、工具 schema）靠规范 C-19 点名。
> `manual` 段是全链唯一的「机器做到一半、明确交给机器以外的人」断点：**它不派 run、落清单骨架后停链等人**，
> 且停手时**不写** `autoRun`/`noopStreak`——"在等人"是正常状态，不是坏链。

**来源**：REQ-261003203909-55f2（2026-10-04）。前情：默认模板 `dev/integrate/review/test`
盖不住真实交付——端到端断言、人工真机核对、发布门禁、采集取证四类工作要么被塞进 `test` 段、
要么靠计划手写 `stages` 逃生（实测 40 需求 / 627 张子卡里手写 19 次 `change-only` 组合）。

## 一、一条链是怎么解析出来的

```
父卡开工（lazy-expand）
   │
   ├─ 父卡.stages 已给出？ ──是─→ 显式枚举校验（去重/受控枚举；[] = 显式无链 solo）
   │                          └─ 非法 → REQBOARD_STAGES_INVALID（响亮报错，不静默回退）
   └─否
       ├─ PHASE_STAGES[phase]   （doc / review / merge / analysis / test 五个相位有专属答案）
       ├─ stagesForSide(side)   （只有 side=doc 有答案；frontend/backend/fullstack 一律不猜）
       ├─ SUBTASK_TEMPLATES[需求分类]
       └─ 兜底 DEFAULT_FALLBACK_STAGES = ['dev', 'review']
                │
                └─ 父卡.skipIntegration === true → 裁掉 integrate 段
```

两个容易改错的判据：

| 判据 | 正确写法 | 写错的后果 |
|---|---|---|
| 「没写 stages」vs「显式不要链」 | `parent.stages !== undefined` | 用 `.length > 0` 会把 `[]`（明确不要链）当成没写，**静默改回默认 4 段** |
| 「这张卡有没有接口面」 | 只认计划侧声明（`stages` / `skipIntegration`）与 `side=doc` | 从端侧猜"要不要联调"必然猜错，猜错就是静默削段 |

`template` 与 `stages` 是**二选一**：计划里同时给出 → `REQBOARD_TEMPLATE_CONFLICT`；
`template` 键不在 `SUBTASK_TEMPLATES` 里 → `REQBOARD_TEMPLATE_INVALID`（回执附合法键清单，不让人猜）。
解析在**计划提交那一刻**完成（`resolvePlanStages` 是唯一实现点），落库即具体 `stages`，
引用键冗余记进 `TaskRecord.template` 供统计——**批准所见 = 落库所得**。

## 二、20 段清单（族 / 中文 / 证据形态）

证据形态决定完工凭证门怎么判（`STAGE_EVIDENCE_KIND`）：
**`file`（写入族）= 必须有真实落盘改动且 mtime ≥ 链出身；`verdict`（结论族）= 有结论即放行**。

| 族 | 段 | 中文 | 证据形态 | 语义边界（与相邻段的区别） |
|---|---|---|---|---|
| 研发族 | `dev` | 研发 | file | 本卡范围内改动 + 本地验证，**不跑**父卡终态验收命令 |
| 研发族 | `repro` `fix` | 复现 / 修复 | file | 先证明「修复前失败」，再让回归用例转绿 |
| 联调 | `integrate` | 联调 | verdict | 给请求样例 + **真实一次调用**的响应；不改实现 |
| 复核 | `review` | 复核 | verdict | 只给「设计与实现是否偏离」的逐条结论；不改代码 |
| 测试族 | `test` | 测试 | verdict | **父卡终态验收命令归本段**；失败如实报 |
| 测试族 | `regress` | 回归测试 | verdict | 失败数 ≤ 开工前基线（贴比对输出） |
| 测试族 | `e2e` | 端到端 | verdict | 场景名 + 命令 + 退出码 + 输出摘要；**不重复**跑父卡终态命令 |
| 测试族 | `manual` | 人工核对 | **file** | 只生成核对清单并停下等人；**禁止**代替人核对、禁止伪造结果（见 §四） |
| 调研族 | `probe` `collect` `analyze` | 探针 / 取数 / 分析 | verdict | 只回答可证伪问题 → 只取数（标来源时点） → 只做结论（含置信度与适用边界） |
| 调研族 | `capture` | 采集 | **file** | 只采集不改动：产物落 `evidence/` + 可复核命令 |
| 数据族 | `prepare` `run` `verify` | 准备 / 执行 / 校验 | file·file·verdict | 准备方案 → 执行落库 → 逐条校验（不动被校验对象） |
| 运维族 | `change` `dryrun` `apply` | 变更 / 试运行 / 实施 | file | 声明变更与回滚 → `--dry-run` 比对 → 生效 + 可复核输出 |
| 运维族 | `release` | 发布 | **file** | 构建/发版命令 + 完整输出（含构建戳/版本号断言）+ **回滚方式显式写明** |

**模板键**（`SUBTASK_TEMPLATES` 的 12 个键）：`feature` `refactor`（4 段）、`bug`（repro/fix/review/regress）、
`doc` `chore` `change-only`（dev/review）、`spike`、`research` `analysis`、`data`、`ops`、
`review-only`、`acceptance`（仅 verify）。
段序惯例沿用 2026-09-20 用户裁定：**复核在前、测试在后**（早发现偏离，改完再测不浪费）。
`change-only` / `acceptance` 是高频逃生舱口的固化（实测手写最多；`acceptance` 是「每条链必含 review」的显式豁免）。

## 三、加一段必须登记哪几处（规范 C-19 的由来）

**类型强制的登记点**（五张 `Record<StageKind, …>`：漏登记 = `tsc` 编译错，不用靠人记；
下表第 1 行是枚举自身，是"加一段"的入口）：

| # | 位置 | 表 | 漏登记的后果（除编译错外） |
|---|---|---|---|
| 1 | `src/domain/task/SubtaskTemplate.ts` | `STAGE_KINDS`（枚举自身） | 新段根本不被承认（`REQBOARD_STAGES_INVALID`） |
| 2 | 同上 | `STAGE_LABELS` | 卡标题/徽标回落原始英文（`stageLabel` 有回退，不崩但难读） |
| 3 | 同上 | `STAGE_ACCEPTANCE` | 子卡验收模板缺失 → 验收标准不可执行 |
| 4 | 同上 | `STAGE_EVIDENCE_KIND` | 未登记按**写入族从严**处理 → 天然无 diff 的段 100% 死在凭证门 |
| 5 | `src/application/use-cases/ExecuteTask.ts` | `STAGE_SCOPE_RULE` | 子卡提示词缺「本步边界」→ 越界干活（如复核段去改代码） |
| 6 | `src/domain/card-types.ts` | `STAGE_TO_PHASE_COLOR` | 看板颜色族缺项（`getPhaseColor` 有回退） |

**非类型强制、必须人记的三处**：

| 位置 | 什么时候要动 |
|---|---|
| `src/application/use-cases/AdvanceChain.ts` | 只有新段有**特殊链行为**时才动（如 `manual` 的停链等人分支） |
| `eval-suite/` fixtures | 默认链（模板键的段集合）变更时同步，并跑 `validate_eval_suite.py` |
| `SubmitTool` 的 schema 描述 | 新增模板键时同步合法键说明 |

**自动跟随、不用登记但要知道**：workflow 脚本 schema 族（派生自 `STAGE_EVIDENCE_KIND`）、
客户端徽标（单点取 `STAGE_LABELS`）、DAG 子卡排序（自 `STAGE_KINDS` 派生——
2026-10-04 之前这里是**硬编码四段**，正是"加段只改一处会静默错序"的活样本）。

## 四、`manual` 段：唯一合法的「停下等人」断点

```
链走到 manual 子卡
   ├─ ① 清单骨架落盘 docs/requirements/<REQ>/manual/<taskId>.md（含生成时间戳）
   ├─ ② 子卡 todo → in_progress（开执行记录）+ 写 t.manualSkeletonAt = now
   ├─ ③ 需求留痕 + alert：「该你动手了」
   └─ ④ 返回 AWAIT_MANUAL → stopped='awaiting-manual'（**不派 run、不动 autoRun**）
                              人填完核对结果 → reqboard_task_report（filesChanged 含本文件）→ 链续跑
```

四条不变量（改这块必须同时满足）：

1. **不派 run**：人的活干不了（引擎里没有"人"），派了只会产出伪造结论。
2. **停手不写健康位**：「在等人」是正常状态。沿用自动链既有口径——**超限/等待不写 `driverHealth`**，
   否则人会被叫醒去点「继续」，而其实什么都没坏。
3. **防伪造靠时间地板**：`manual` 段的凭证门新鲜度基准收紧为
   `since = max(chainSince, manualSkeletonAt + 1)`——**预先写好的"核对结果"不算数**，
   只有晚于骨架生成的更新才过门。
4. **幂等**：子卡已是 `in_progress`（已在等人）→ 不重写清单（防止覆盖人正在填的内容），原地 `noop` 停链。

工具侧：`reqboard_advance` 在 `stopped === 'awaiting-manual'` 时回执 `REQBOARD_AWAITING_MANUAL`
（**正常状态码，不是错误**），文案直接告诉人去找哪份清单。

## 五、判据（可复跑）

| 要验什么 | 命令 |
|---|---|
| 模板/模板键/template 解析矩阵 + 六表同 key 集合 | `npx vitest run tests/domain/subtask-template.test.ts tests/execute-task.test.ts` |
| 颜色族覆盖与漏登记变红 | `npx vitest run tests/card-types.integration.test.ts tests/integration/card-types.test.ts` |
| manual 停链等人的四种结果（落盘/幂等/停链/防伪造） | `npx vitest run tests/advance-manual-stage.test.ts` |
| 五张表漏登记必编译失败 | `npx tsc --noEmit`（删掉任意一张表的一行 → 当场报错） |
| 计划通道：UC-1 端到端（`template=change-only` → 落库 `[dev,review]`） | `npx vitest run tests/plan-mode.test.ts`（TC-8/TC-9） |
| 知识层规范同步 | `pnpm run kb:check`（C-19） |

完整证据矩阵与反向演练输出：`docs/requirements/REQ-261003203909-55f2/evidence/`。

## 六、已知缺口（诚实登记）

- **死测试里的过期断言**：`src/domain/__tests__/card-types.integration.test.ts` 与
  `src/__integration_test__/card-types.integration.ts` **不在 vitest include（`tests/**/*.test.ts`）内**，
  前者写死「覆盖全部 16 种 StageKind」+ `toHaveLength(16)`——加段后它成了**既不跑、也不红**的过期断言。
  修法二选一：并入 `tests/`，或改成自 `STAGE_KINDS` 派生。
- **历史手写 `stages` 的卡没有 `template` 字段**：模板键统计只能覆盖新落库的计划。
