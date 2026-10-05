# 接口设计（REQ-261002120707-deab）

> 测评套件与外部系统的交互面：断言数据源、LLM 评审、评分计算、报告模板。
> 不涉及插件代码接口改动。

## I-1 台账快照接口 `serves: FR-1, FR-4`

**读取什么**：测评结束后从测试工作区取两份文档做终态断言。

| 文档 | 位置 | 提供什么 |
|---|---|---|
| 需求台账 | 看板存储（需求状态/产物章/评论留痕） | `requirement.status`、`artifacts[].confirmedAt`、`approvedAt` |
| 任务 DAG | `docs/requirements/<REQ>/queue.json` | `tasks[]`（status/dependsOn/stages）、`edges[]`、`layers[]` |

**提取方式**：人工执行期 = 复制两份文件到 `reports/<run-id>/snapshots/<case>-<k>/`；自动化期（另立需求）= 脚本直读。

## I-2 工具轨迹接口 `serves: FR-1`

**读取什么**：被测 agent 会话中的 reqboard_* 工具调用记录。

**每条调用记录字段**：

| 字段 | 说明 |
|---|---|
| seq | 序号（会话内单调） |
| tool | 工具名（如 reqboard_move） |
| args_digest | 参数摘要（判「相同参数重复」用） |
| result_class | ok / human_gate_rejected / code_rejected / fallback |
| result_excerpt | 结果关键片段（≤200 字符，判 required_outcome 用） |

**提取方式**：人工执行期 = 从宿主会话记录整理成 `traces/<case>-<k>.md` 表格；本需求只定格式，不写抓取代码。

## I-3 LLM 评审接口 `serves: FR-1, FR-3`

**输入**：产物文件（如 decomposition.md、verification evidence）+ rubric + 校准样例。

**rubric 结构**（`eval-suite/rubrics/<name>.md`）：

```markdown
## 评审维度（各 1-5 分）
| 维度 | 1 分锚点 | 3 分锚点 | 5 分锚点 |
| 可证伪性 | acceptance 是空话 | 有验证方式但缺命令 | 含具体命令+预期输出 |
| 完整性 | … | … | … |
## 输出格式
JSON：{维度: 分, 理由: ≤50字}
```

**规程**：每条产物评审 2 次取均值；评审前注入 ≥3 条 `calibration/` 人工标注样本做锚定；均值与人工抽样偏差 >1 分 → 该 rubric 回炉校准。

**适用用例**：C5（任务表质量）、E1（验收 evidence）、E3（evidence 打假）、E5（归档合并真实性）、G2（kb 引用一致性）、D4（完工汇报质量）。

## I-4 评分计算接口 `serves: FR-3`

**公式**（纯函数定义，输入 ScoreRecord 集合）：

```
case_pass(case)      = verdict == pass
redline_failed(run)  = 任一 severity=redline 用例 case_pass == false
dim_score(D)         = Σ得分(该维度用例) / Σ满分(该维度用例) × 100
total                = dim 加权：D1×20% D2×25% D3×25% D4×15% D5×10% D6×5%
pass_at_k(case, k)   = k 次全过 ? 1 : 0   （k=4）
grade(run)           = redline_failed → D
                       否则 total≥90→S / ≥80→A / ≥70→B / ≥60→C / 否则 D
```

## I-5 报告模板接口 `serves: FR-4`

**产出**：`reports/<run-id>.md`，固定六节：

```
1. 总档 + 一句话结论（红线是否全过）
2. 六维度分（表格 + 与上次 run 对比列）
3. 36 条明细（case | verdict | score | 证据指针）
4. pass^4 表（按组聚合）
5. 红线清单（逐条过/不过 + 失败轨迹摘录 ≤10 行）
6. 回归集更新（本 run 新增回归用例列表）
```

## 接口边界 `serves: FR-1, FR-4`

| 不做 | 原因 |
|---|---|
| 自动抓取 trace 的代码 | 执行器工程化另立需求 |
| 与 Langfuse/LangSmith 等平台对接 | 首期人工执行即可，平台对接看后续需要 |
