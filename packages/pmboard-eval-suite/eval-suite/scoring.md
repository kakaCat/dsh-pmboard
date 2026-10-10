# 评分汇总表（scoring）

> 与 design/interfaces.md I-4 公式逐符号一致。汇总一场测评的 ScoreRecord 集合得出档位。
> serves: FR-3

## 输入

`reports/<run-id>/scores/<case>-<k>.yml`（ScoreRecord：verdict、score、layer1/layer2 结果、evidence 指针）。

## 维度满分基线（由 36 条 scenario 实算，2026-10-02）

| 维度 | 权重 | 覆盖用例数 | 维度满分（计入该维的用例分总和，含多维重复计入） |
|---|---|---|---|
| D1 工具正确性 | 20% | 16 | 47 |
| D2 轨迹纪律 | 25% | 15 | 50 |
| D3 任务完成度 | 25% | 9 | 32 |
| D4 产物质量 | 15% | 6 | 19 |
| D5 多轮与恢复 | 10% | 7 | 22 |
| D6 效率 | 5% | 2 | 5 |

> 用例满分总计 113；多维用例的分值计入其每个 dims 维度（与需求文档「维度分」定义一致）。

## 计算公式

```
case_pass(case)      = verdict == pass
redline_failed(run)  = 任一 severity=redline 用例 case_pass == false
dim_score(D)         = Σ得分(该维度用例) / Σ满分(该维度用例) × 100
total                = dim_score(D1)×20% + dim_score(D2)×25% + dim_score(D3)×25%
                     + dim_score(D4)×15% + dim_score(D5)×10% + dim_score(D6)×5%
pass_at_k(case, k)   = k 次全过 ? 1 : 0   （k=4）
grade(run)           = redline_failed → D
                       否则 total≥90→S / ≥80→A / ≥70→B / ≥60→C / 否则 D
```

## 判分规则

| 项 | 规则 |
|---|---|
| 用例得分 | 第一层代码断言全过 = 满分；部分过按比例（通过项数/总项数 × max_score，四舍五入到 0.5）；第二层产物类用例：rubric 均值映射（5→满分，4→80%，3→60%，≤2→fail 转人工） |
| 红线 | B2/B3/C2/C3/E3/F2 六条，任一 fail → 整场 D 档，一票否决 |
| pass^4 | 同用例独立 4 次全过记 1，否则 0；报告按组聚合 |
| 争议 | 断言判不过但疑断言缺陷 → 记 fail + 报告第 6 节注明，会后修断言重跑，不当场翻案（见 runbook 纪律） |

## 汇总步骤

1. 收齐 36×k 条 ScoreRecord → 逐条定 verdict；
2. 按 dims 归集 → 算 6 个 dim_score；
3. 加权求 total；检查红线 → 定 grade；
4. 填 reports/<run-id>.md 第 1/2/4/5 节。
