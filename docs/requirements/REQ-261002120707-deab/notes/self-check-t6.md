# t6 全量自检记录（2026-10-02）

> 验收对照：t6 acceptance「自检记录列出 36 条用例三件套完整性核对结果（缺失=0）、红线清单（6 条）与需求文档一致、评分公式两处表述一致；发现的任何不一致已修复」。

## 自检项与结果

| # | 自检项 | 方法 | 结果 |
|---|---|---|---|
| 1 | 三件套齐全性（scenario+ledger+trajectory） | 脚本遍历 36 id 查三路径存在 | ✅ 36/36，缺失=0 |
| 2 | id/max_score/severity 与需求文档用例表逐行比对 | 脚本对照 36 行期望值表 | ✅ 36/36 一致 |
| 3 | 红线清单 | severity=redline 集合比对 | ✅ 恰为 {B2,B3,C2,C3,E3,F2}，与需求文档一致 |
| 4 | 台账断言算子合法性 | 全部 checks 的 op ∈ 算子表 8 算子 | ✅ 全过 |
| 5 | 台账断言 path 前缀 | 全部 path 以 requirement./queue. 开头 | ✅ 全过（修复 A3 一处裸根 path → requirement.status） |
| 6 | 轨迹断言必备结构 | ordered_contains + budget 存在性 | ✅ 全过 |
| 7 | rubric 引用闭环 | 6 处 rubric_ref → rubrics/ 文件存在 | ✅ C5/D4/E1/E3/E5/G2 全闭环 |
| 8 | YAML 可解析 | yaml.safe_load 全量 | ✅ 108/108 |
| 9 | 评分公式两处一致 | 人读 scoring.md 公式块 vs interfaces.md I-4 | ✅ 逐符号一致（case_pass/redline_failed/dim_score/total/pass_at_k/grade） |
| 10 | 报告模板六节 | 人读 reports/TEMPLATE.md | ✅ 六节齐全（总档/维度分/明细/pass^4/红线/回归） |

## 修复记录

- A3 台账断言 `path: requirement`（裸根）→ `requirement.status`（op: absent），语义不变：空白工作区无需求台账产生。

## 遗留约定（非缺陷，执行器需求范围）

- 场景引用 7+ 个 fixture 名（如 fixture:req-decomposing、fixture:req-implementing-flaky），fixture 预置属后续执行器需求；
- G3 步数预算 max_tool_calls: TBD，首轮实测标定后回填（需求 Q1）；
- forbidden 的 when 为自然语言条件表达式，判分时按 runbook 由人/执行器解释；
- 「无新 REQ」断言用 queue.requirements 表达（看板级根解释），执行器实现时注意。

自检结论：**全部通过，可交付验收**。
