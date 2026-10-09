# 拆分计划（REQ-261008190515-5212）

> **目标一句话**：把 `implementing` 从 vendor 镜像表移出，heavy 主档改写成本仓自写完整档
> （≤5,500 字符），并把档案 / 断言 / 生成物 / P1 基线五处**同批**对齐。
> **做法**：7 张卡按「映射表 → 自写档 → overrides 收编 → 档案 / 断言 / 生成物」的顺序落地，
> 项目说明书那节独立并行。本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。
> 依据：`docs/requirements/REQ-261008190515-5212/design/`（架构 / 接口 / 数据模型 / 测试用例 / 用例）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | `requirement.md` 功能点表 | 需求条款（FR-1…FR-6） |
| I-x | `design/interfaces.md` 接口清单 | 契约边界（I-1…I-9） |
| TC-x | `design/test-cases.md` 用例表 | 测试用例（TC-1…TC-18） |
| t-x | 本文档任务表 | 计划内任务 |

## 变更盘点（对照需求文档 + 设计一套）

**新增**：无新文件、无新接口、无新数据结构。

**修改**：

- `scripts/inline-prompt-fragments.mjs`（映射表删 1 项 + 头注释）
- `tests/prompt-tiers.test.ts`（同源副本删 1 项）
- `src/domain/prompt/fragments/implementing/heavy.md`（整篇改写，20,405 → ≤5,500 字符）
- `src/domain/prompt/fragments/implementing/heavy/overrides.md`（10 条 → 2 条）
- `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md`（§2 角色列 + §3 镜像清单）
- `tests/kb-prompt-wiring.test.ts`（镜像档抽样断言名单）
- `scripts/prompt-path-probe.mts`（删死条目 + 改 1 条理由）
- `src/domain/prompt/generated/fragments.ts`（重跑生成器，不手改）
- `tests/fixtures/stage-prompts-baseline-p1.json`（重刷基线，不手改）
- `docs/architecture/project-manual.md`（新增机制备忘节 + 变更记录一行）

**删除**：`implementing/heavy/overrides.md` 的覆盖 10（上游四类不可执行项补丁，对象消失即删）；
`scripts/prompt-path-probe.mts` 的 `scripts/task-start` / `scripts/task-done` 允许条目（死条目）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 让 implementing 退出 vendor 镜像表 | FR-1 | I-1, I-4 + scripts/inline-prompt-fragments.mjs、tests/prompt-tiers.test.ts | — | — | implement | backend | — | S | ① `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"` 输出恰为 `accepting,archived`；② `grep -c "executing-plans" scripts/inline-prompt-fragments.mjs tests/prompt-tiers.test.ts` 两文件计数均为 0；③ `npx vitest run tests/prompt-tiers.test.ts` 全绿 |
| t2 | （落库后回填） | 把实施阶段的 heavy 主档改写成本仓自写完整档 | FR-2, FR-5 | I-2, I-4 + src/domain/prompt/fragments/implementing/heavy.md | — | — | implement | backend | t1 | M | ① `node -e` 取 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length` 读数 < 8000（改前 23852）；② 注入文本同时包含 `The Task Loop`、`Common Rationalizations`、`reqboard_task_move`、`reqboard_task_report` 四个关键词；③ `diff -q src/domain/prompt/fragments/implementing/heavy.md src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` 有差异（不再是镜像）；④ `npx vitest run tests/stage-prompts.test.ts` 全绿 |
| t3 | （落库后回填） | 把 overrides 里描述本仓流程的补丁收编进正文 | FR-3 | I-7 + src/domain/prompt/fragments/implementing/heavy/overrides.md | — | — | implement | backend | t2 | S | ① `grep -c "覆盖 [0-9]" src/domain/prompt/fragments/implementing/heavy/overrides.md` 输出 2；② 该文件仍含 `覆盖上文`（`grep -c` ≥ 1）；③ `npx vitest run tests/prompt-tiers.test.ts` 的 ⑥ 注入顺序组全绿 |
| t4 | （落库后回填） | 同步上游档案里的镜像关系 | FR-4 | I-8 + src/domain/prompt/vendor/superpowers/ATTRIBUTION.md | — | — | doc | doc | t1 | S | ① `grep -c "heavy 主 skill" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` 输出 2；② `grep -n "不再注入" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` 命中 executing-plans 行；③ `wc -c src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` 仍为 20405 |
| t5 | （落库后回填） | 把镜像档断言与路径探针口径同步到新事实 | FR-4 | I-9 + tests/kb-prompt-wiring.test.ts、scripts/prompt-path-probe.mts | — | — | implement | backend | t2 | S | ① `npx vitest run tests/kb-prompt-wiring.test.ts` 全绿；② `grep -c "task-start" scripts/prompt-path-probe.mts` 输出 0；③ `pnpm prompts:check` 退出码 0 |
| t6 | （落库后回填） | 重跑生成器并重刷 P1 基线 | FR-4, FR-5 | I-3, I-5, I-6 + src/domain/prompt/generated/fragments.ts、tests/fixtures/stage-prompts-baseline-p1.json | — | — | implement | backend | t1, t2, t3 | M | ① `node scripts/check-prompt-fragments.mjs` 退出码 0；② 逐键比对 12 键，只有 `implementing/heavy` 变（其余 11 键逐字节相等）；③ `npx vitest run tests/prompt-baseline.test.ts` 全绿；④ `pnpm typecheck` 退出码 0 |
| t7 | （落库后回填） | 在项目说明书里写明本仓实施模式 | FR-6 | docs/architecture/project-manual.md | — | — | doc | doc | — | S | ① `grep -n "本仓实施模式" docs/architecture/project-manual.md` 命中新增节标题；② `grep -c "REQ-261008190515-5212" docs/architecture/project-manual.md` ≥ 1（变更记录行） |

- **工作量口径**：S = 半天内 / M = 1~2 天 / L = 3 天以上。t2 落到 M（改写有既有设计与骨架可照抄，
  但需逐节自证关键词与长度）。
- **t2 体量声明**（tasks[] 的 `footprint`）：files=3、anchors=4、chars=2200 →
  detailUnits = 3 + 2 + 1.1 = **6.1 DU** < 容量 16 DU，不需标「⚠️超容量」。
- **每卡都跳联调**（`skipIntegration: true` + 理由）：本需求全部改动落在**提示词文本资产、
  构建期脚本、测试断言、人读档案**四类，没有任何运行时接口面 —— 详见 tasks[] 的逐卡理由列。
- **每卡都带 `requirement_refs`**：FR-1…FR-6 六条全部被接收（t1/t2/t3/t4/t5/t6/t7 覆盖），
  无孤儿条款；条款覆盖门禁只认 tasks[] 的 `requirement_refs`，本文档的覆盖对照表是人读汇总。

## 接口清单 ↔ 接收卡 key（对照表）

> `design/interfaces.md` 的「接口清单」共 9 条，逐条有卡接（一对多合法）。

| 接口 | 接收卡 key |
|---|---|
| I-1 | t1 |
| I-2 | t2 |
| I-3 | t6 |
| I-4 | t1, t2 |
| I-5 | t6 |
| I-6 | t6 |
| I-7 | t3 |
| I-8 | t4 |
| I-9 | t5 |

（`sides: []`，无 frontend.md，故无「组件树 ↔ 接收卡 key」段。）

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-4（2） | —（纯提示词资产，无端侧模块） | TC-1, TC-2, TC-5, TC-10（4） | t1（1） | ✅ |
| FR-2 | I-2（1） | —（纯提示词资产，无端侧模块） | TC-4, TC-6, TC-11（3） | t2（1） | ✅ |
| FR-3 | I-7（1） | —（纯提示词资产，无端侧模块） | TC-12（1） | t3（1） | ✅ |
| FR-4 | I-3, I-6, I-8, I-9（4） | —（纯提示词资产，无端侧模块） | TC-3, TC-7, TC-9, TC-13, TC-14, TC-16, TC-17, TC-18（8） | t4, t5, t6（3） | ✅ |
| FR-5 | I-5（1） | —（纯提示词资产，无端侧模块） | TC-8, TC-10, TC-13（3） | t2, t6（2） | ✅ |
| FR-6 | —（纯文档条款，无接口面） | —（纯项目说明书更新，无端侧模块） | TC-6, TC-15（2） | t7（1） | ✅ |
| **合计** | 9 接口 | 0 页面/模块（`sides: []`） | 18 用例 | 7 任务 | **6/6 条款有主** |

**FR-6 的接口格写「—」的理由**：该条只改人读文档（`docs/architecture/project-manual.md`），
不落在任何契约边界上——`design/interfaces.md` 的 9 条契约边界里没有它的位置，
这不是漏拉齐，是判据对象不存在。

## 边界校验

- 每张卡都能被**零会话历史**的新窗口独立开工：落点列给了具体文件路径与契约编号，
  验收列给了可跑命令与期望读数；
- 本计划不二次创作设计：与 `design/*.md` 冲突时**退回设计**改文档后重新提交本计划，
  不在拆分阶段私改设计；
- 不给 `accepting` / `archived` 开卡（映射内两节点本次不动，见设计架构篇的边界节）。
