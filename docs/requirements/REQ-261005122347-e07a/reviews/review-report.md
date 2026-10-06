# 评审报告 · 收录 UI 提示词并按引用交付原型 subagent（REQ-261005122347-e07a）

> TL;DR：5 张父卡 × 4 段子卡逐段复核；实施期抓出并修掉 **2 个真缺陷**（写盘写错目标目录、
> 资产列举拼错路径分隔符），**5 处与设计的偏离**（其中注入落点变更已经人裁定），其余与设计一致。

## 一、逐卡复核结论

| 卡 | 结论 | 依据 |
|---|---|---|
| t-540c7e 收录 7 份资产并固化指纹 | 无偏离（裁剪收紧 2 处，见偏离 2） | `vendor --check` exit 0；28 条指纹；2.67 MiB ≤ 5 MiB；`tests/skills-assets.test.ts` 8 passed |
| t-8e7e19 清单契约与配置开关 | **验收②未达成**（存量越界，非本卡所致） | `tests/skills-provenance.test.ts` 17 passed；`tests/layer-boundary.test.ts` 3 failed / 16 处越界**全部存量**，本卡新增模块 0 处 |
| t-41cc65 投放工具 | 无偏离（偏离 1、3 已登记） | 5 个错误码齐备；事务性用例过；端到端实跑 exit 0；`tests/skills-materialize.test.ts` 10 passed |
| t-ebb03c 注入原型工作原则节 | **落点变更（已由人裁定）** | 五要素齐、691 字符 ≤1200、重档 19081 ≤24000；可裁反向演练实跑；`tests/skills-injection.test.ts` 10 passed |
| t-36dca3 回归收尾 | **验收①未达成**（外部阻塞） | tsc 0 错误；指定回归失败数持平；两处演练记录在盘；`pnpm kb:check` 红因他人在飞 |

## 二、实施期抓出的真缺陷（复核阶段回溯）

| # | 缺陷 | 怎么被抓住 | 影响 |
|---|---|---|---|
| 1 | `SkillWriter.writeTree` 把文件写到了**目标根**而不是临时目录（等于放弃事务） | TC-6「失败不留半份」用例红 | 若直接发版：写盘失败会留下半份混版资产——正是本需求最想避免的失败形态 |
| 2 | `SkillAssets.listFiles` 拼接路径少了分隔符（`brandSKILL.md`） | `tests/skills-materialize.test.ts` 读资产即失败 | 若直接发版：投放直接不可用（100% 失败，反而容易发现） |

两处都在同一轮用例里被逮住并修掉，**未进入提交**。

## 三、设计偏离处置（完整版见 `notes/design-deviations.md`）

| # | 偏离 | 处置 |
|---|---|---|
| 1 | 投放根**整体替换**（设计两处要求互斥） | 取事务性优先；已在偏离清单写明取舍与回滚 |
| 2 | 裁剪 **5 条**（设计示例 4 条） | 按 FR-1 给这两条规则写明的原因收紧（深层自测目录、字节码缓存），省 99,126 B |
| 3 | 不传需求号时**不强制**窗口绑定 | 只放宽不收紧；显式传了仍照常校验 |
| 4 | `SkillAssetPort` 方法数多于卡片所列 | 端口须服务用例（枚举文件、读溯源） |
| 5 | 注入落点由**类型档**改为**可裁难度档槽** | **已经人裁定**：类型档会撞破轻档 2500 上限，改走 heavy 专属可裁槽 |

## 四、复核确认的「无偏离」项

- 注入链仍只有 `resolveStagePrompt` 一个取词入口；未动 `router.ts` 算法与
  `CATEGORIES` / `PROMPT_STAGES` 受控枚举。
- `DEFAULT_PROMPT_BUDGET = 24000` 与 floor 不裁口径未被触碰。
- 未新增 `ArtifactKind`；原型产物沿用既有 `notes` 兜底。
- 既有片段与既有路由**一律未动**（`heavy.md` 与 vendor 原文仍逐字节一致）。
- 非破坏性：本需求全部为纯增量；`skills.enabled=false` 一键回到改造前。

## 五、并发风险提示（写进验收材料）

实施期间另一窗口在**同一工作树**内并行改动 `src/client/**`、`src/shared/protocol.ts`、
`src/application/internal/**` 等多处。本报告的所有判定都**限定在自己的文件集**上复算过，
仍建议验收时在**静止的工作树**上复跑 `notes/verification-summary.md` 第 1 节的命令。
