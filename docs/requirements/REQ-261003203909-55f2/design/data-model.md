# 数据模型 · 子卡阶段模板补充

> **TL;DR**：stageKind 枚举 16 → 20；模板表 +2 个有数据支撑的键；TaskRecord 与计划任务表
> 各加一个可选 `template` 字段。全部纯增量。

## 1. 新增 stageKind（4 段） · serves: FR-1, FR-2, FR-3, FR-6

`STAGE_KINDS` 追加（顺序即语义分组，插入对应族内）：

| stageKind | 中文名（STAGE_LABELS） | 证据族（STAGE_EVIDENCE_KIND） | 颜色族（STAGE_TO_PHASE_COLOR） | 用途 |
|---|---|---|---|---|
| `e2e` | 端到端 | `verdict` | `test-family` | 写/跑端到端场景断言，贴「场景+命令+退出码」 |
| `manual` | 人工核对 | `file` | `test-family` | 真机/浏览器核对：清单落盘，链停下等人（architecture §3） |
| `release` | 发布 | `file` | `ops-family` | 打包/构建/发版：版本或变更文件改动 + 回滚方式声明 |
| `capture` | 采集 | `file` | `research-family` | 探针/截图/基线：产物落 `docs/requirements/<REQ>/evidence/` |

`STAGE_ACCEPTANCE` 对应模板（必须可证伪，含命令锚点）：

- `e2e`：「端到端场景逐条给出：场景名 + 命令 + 退出码 + 输出摘要；场景清单覆盖本卡承接的 FR
  （如 `npx vitest run tests/<e2e用例>` → 全绿）；场景失败如实报失败输出，不改实现（改实现属 dev 段）」
- `manual`：「人工核对清单落盘 `docs/requirements/<REQ>/manual/<taskId>.md`：核对项逐条勾验
  （通过/不通过+现象）+ 截图或证据路径；机器不自动判过，核对结果更新必须晚于清单骨架生成时间」
- `release`：「构建/发版命令 + 完整输出（含构建戳或版本号断言，如 `pnpm build:client` 的
  verify 门禁输出）；回滚方式显式写明（revert 范围/开关/数据回滚路径）」
- `capture`：「采集产物路径列表（`docs/requirements/<REQ>/evidence/` 下）+ 每项一句话内容摘要
  + 一条可复核命令（`ls -la` / `head` / `sha256sum`）」

`STAGE_SCOPE_RULE`（ExecuteTask.ts）对应边界：

- `e2e`：「只做端到端场景断言（写用例 + 跑 + 贴结果）。**不要**改实现代码（属研发段），
  **不要**重复跑父卡终态验收命令（属测试段）」
- `manual`：「只生成核对清单并停下等人。**禁止**代替人做核对、**禁止**伪造核对结果
  （未核对就写「通过」）」
- `release`：「只做构建/发版与回滚声明。**不要**改功能代码（属研发段）」
- `capture`：「只采集不改动（证据落盘 evidence/），**不要**做结论分析（属分析段）」

## 2. 模板表新增键（2 个，只固化有数据的组合） · serves: FR-5

`SUBTASK_TEMPLATES` 追加：

| 键 | 链 | 数据依据（调研 E-2） |
|---|---|---|
| `change-only` | `['dev','review']` | 文案/契约/纯函数/常量类卡，手写 19 次 |
| `acceptance` | `['verify']` | 链尾总验收卡（全量回归+人工核对），跨 3 需求手写 3 次 |

同时发生的可达性变化：既有 `research`/`data`/`ops`/`review-only` 键经 template 字段
从死配置变为可引用（FR-5 的「打通」——不新增段、不改分类枚举）。

**不加**的组合键：`feature+e2e` 等含新段的组合暂无使用数据，沿用本仓纪律「先数据后固化」，
先经 `stages` 显式声明观察一轮。

## 3. 字段契约 · serves: FR-4

```ts
// 计划任务表（SubmitTool schema / PlanTaskDraft）新增可选字段
template?: string   // 必须命中 SUBTASK_TEMPLATES 的键；非法键 → 计划提交被拒（响亮）

// TaskRecord 新增可选字段（冗余记录，统计/审计用）
template?: string   // 落库时由 plan-landing 透传引用键
```

**解析优先级**（`plan-landing` 落库时一次解析，写入 `TaskRecord.stages`）：

```
stages（显式枚举，最高优先）
  > template（引用键 → 解析为该键的链）
  > phase 映射（PHASE_STAGES）
  > side 映射（stagesForSide）
  > 需求分类兜底（stagesForCardType）
skipIntegration === true 正交生效：无论链从哪来，再裁掉 integrate 段
```

冲突规则：`stages` 与 `template` **同时给出 → 计划提交被拒**（二选一，禁止两套口径并存
埋歧义）；`template` + `skipIntegration` 合法（先取模板链再裁联调）。

## 4. 不变量 · serves: FR-7

- 新增 stageKind 的**五处登记**由 `Record<StageKind,…>` 类型强制：KINDS/LABELS/ACCEPTANCE/
  EVIDENCE_KIND（SubtaskTemplate.ts）+ PHASE_COLOR（card-types.ts）；第六处
  `STAGE_SCOPE_RULE` 本次改为 `Record<StageKind,string>` 后同享强制（现状 `?? ''` 静默落空
  是登记缺口）。
- `validateTemplateRef` 与 `validateExplicitStages` 并列于 SubtaskTemplate.ts（纯函数，
  返回结构化 verdict，调用方拼错误码）。
- 存量 `TaskRecord` 无 `template` 字段 → 读取侧一律 `undefined`  tolerant（可选字段，零迁移）。
