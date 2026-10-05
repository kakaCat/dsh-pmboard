# 调研沉淀：Agent 测评业界方法与 reqboard 测评套件设计（2026-10-02）

> **TL;DR**：agent 测评的业界共识是「不只看最终答案」——评轨迹、工具调用、任务完成度、多轮质量四个维度；方法上代码断言→LLM 评审→人工校准三层叠加；ground truth 必须包含期望工具序列与数据库终态。reqboard 的台账天然适配 τ-bench 式终态比对，本仓测评套件（eval-suite/）据此设计。
>
> **来源**：REQ-261002120707-deab（spike，2026-10-02 归档）。

## 业界方法速览

| 来源 | 核心方法 | 关键启发 |
|---|---|---|
| [Langfuse: AI agent evaluation](https://langfuse.com/resources/engineering/ai-agent-evaluation) | 四维度（轨迹/工具/任务完成/多轮）独立计分；三方法家族：code evaluators / LLM-as-a-judge / human annotation 分层 | 维度失败相互独立——「结果对但路径浪费」「路径干净但目标没达成」都要能分开看见 |
| [LangChain: Trajectories vs Outputs](https://www.langchain.com/resources/llm-evaluation-framework) | 只评输出会漏掉「答案对但推理错」；ground truth 须含期望工具调用与推理步骤；用例分 happy path / edge / adversarial 三类 | 红线用例（adversarial）是协议遵守类 agent 的必测项 |
| [τ-bench](https://searchworks.stanford.edu/articles/edsarx__edsarx.2406.12045)（[解读](https://futureagi.com/blog/tau-bench-explained/)） | 模拟用户 + 真实工具 + **数据库终态比对**；pass^k（k 次全过比例）测一致性而非单次运气 | 凡有结构化状态存储的 agent 系统都能用终态比对做确定性断言 |
| [MCP-AgentBench (AAAI)](https://ojs.aaai.org/index.php/AAAI/article/view/40347/44308) | MCP 工具的真实环境评测 | 工具选择正确性与参数合法性应独立计分 |
| [ToolHop (ACL 2025)](https://aclanthology.cn/2025.acl-long.150/) | 多跳工具依赖链测评 | 有前后依赖的工具链（如 submit→confirm→decompose）要测顺序约束 |

## 对 reqboard 的适配结论

1. **台账即数据库**：queue.json + 需求状态机 + 任务 DAG 是天然可机器断言的终态，τ-bench 方法直接可用；
2. **human_gate 即协议**：五道人工门是代码级红线，越权类对抗用例（诱导 agent 跳确认/未批准落库/伪造 evidence）应一票否决；
3. **轨迹断言形态**：有序包含（⊃）+ 禁含（forbidden）+ 预算（budget）三件套足以表达本插件的纪律要求；
4. **pass^4**：agent 行为非确定，单次过不算过，k=4 全过才算一致。

## 产出指针

- 测评套件本体：`eval-suite/`（36 用例三件套 + 5 rubric + runbook + 报告模板 + 评分表）
- 需求档案：`docs/requirements/REQ-261002120707-deab/`
- 遗留待办：自动化执行器（fixture 预置、trace 抓取、断言执行器）需另立需求；G3 步数预算基线首轮实测标定。
