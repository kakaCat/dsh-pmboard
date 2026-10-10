# 数据模型（REQ-261009174713-7bc8 重构后）

本需求不新增领域数据，只**搬家与分层**；此处记录重构后各类数据的落点与归属，供追溯与验收核对。

## 1. 需求台账（queue / ledger）

- 形态：`REQ-<id>/queue.json`（v9 台账；`tasks` 走队列通道，`ledger.tasks.push` 已非法）。
- 归属：领域类型与解析在 `pmboard-core`（`domain/queue/*`、`repositories/QueueRepository.ts`）；纯帧协议在 `pmboard-common`（`protocol.ts`）。
- 运行期数据根：`REQBOARD_DATA_ROOT`（根包导出 `dshHomePath` 决定；测试用 `tests/helpers/workspace-root.ts` 的临时根，避免污染真实工作树）。

## 2. 需求文档与产物簿

- 落点：`docs/requirements/<REQ>/`（requirement.md / design/*.md / decomposition.md / tasks/*.md / prototypes/ / archive.md）。
- 产物登记：`artifacts[]`（`{stage, kind, path, confirmedAt, confirmedBy}`）；人工确认章是五道门的判据。
- 归属：`pmboard-core` 的 `application`（用例）与 `repositories`（文件读写）；文档路径解析走 `FileDocRepository` 的 `workspaceRoot`。

## 3. 模板与提示词片段

- 模板：`packages/pmboard-templates/templates/**`（6 类需求模板 + 设计文档模板）；根包 `TemplateRoot` 以**双根**解析（包内优先 → 根 `templates/` 回退）。
- 片段：通用 21 条产 `pmboard-common/src/prompt/generated/**`；六类型各 1 条产 `packages/pmboard-type-<cat>/src/fragments.ts`；由 `scripts/inline-prompt-fragments.mjs` 确定性生成。

## 4. 知识层（kb）

- 落点：`docs/knowledge/`（`INDEX.md` + 5 页 + `entries/kb-NNNN.md` + `operations.tsv` + 机器索引 `code-map.symbols.tsv` / `design-tokens.*.tsv`）。
- 索引行语法唯一口径：`pmboard-core/domain/knowledge/index-line.ts`（`- <id> · <kind> · <一句话> · → <指针>`）。
- 预算（硬）：索引页 ≤8000 字符 / ≤200 行；每页 ≤200 行；由 `scripts/kb-probe.mts` 的 K1/K3 执法。

## 5. 技能与评测资产

- `packages/pmboard-skills/skills/**`（含 `PROVENANCE.md`）、`packages/pmboard-eval-suite/eval-suite/**`；运行期由根包 `SkillAssets` 以双根解析。

## 6. 迁移基线（判据数据）

- 落点：`.dsh-data/refactor-baseline/`（gitignore）：`dist-exports.json` / `tool-registry.json` / `type-spec.json` / `asset-manifest.json` / `vitest-cases.json`；由 `scripts/refactor-baseline.mts` 只读 dump。
- 口径：迁移后判据 = **用例总数 ≥ 基线 且 失败集 ⊆ 基线清单**（pristine 树即有环境相关失败，「全绿」不是本机可达口径）。
- 工具面 `schemaHash` 为**布局无关投影** `sha256({key,toolName,dir})`（原 `sha256(整条)` 含路径，搬迁即全变）。
