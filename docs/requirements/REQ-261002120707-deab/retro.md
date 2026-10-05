# 复盘（REQ-261002120707-deab · spike）

## 结论

1. **测评框架选型成立**：「六维度 × 三层断言 × 台账终态比对」与 reqboard 架构高度契合——台账（queue.json/状态机/任务 DAG）天然是 τ-bench 式终态断言的数据库，五道 human_gate 天然是红线对抗用例的靶子。36 条用例三件套 + 5 rubric + runbook + 评分表已齐套交付（eval-suite/）。
2. **业界方法的可迁移性**：Langfuse 四维度、LangChain 三层断言、τ-bench 终态比对+pass^k 均可直接映射；差异化只在「ground truth 从哪来」——本插件的台账让它几乎零成本。
3. **边界划分正确**：只交付内容与规程（spike 定位），自动化执行器（fixture 预置、trace 抓取、断言执行）留作后续需求——本轮 6 卡全部按时收口，未范围蔓延。

## 被证伪的假设

| 假设 | 证伪经过 |
|---|---|
| 「reqboard_clear_pause 返回序列化错误 = 解锁失败」 | 工具报 `value is not lossless JSON` 后 decompose 直接成功——解锁实际生效，报错只是返回体序列化缺陷（插件侧 bug，可另立需求） |
| 「计划经弹框批准后会自动推进到 implementing」 | 批准时恰逢 decompose 因缺 FR 引用失败，自动推进链断裂，需求停在 decomposing；需第二次 ask_confirm(target=plan) 才推进——自动推进依赖「批准瞬间所有收尾步骤成功」，任一失败即需人工补一脚 |
| 「验收材料一次能交齐」 | 实际被三道门连续拦回：9 类文档前置（test-cases/reviews/tests/复核卡文档）、acceptance 可执行性（t3/t4 缺命令锚点）、测试覆盖度（covers 16 卡）——验收前置检查比预想严，宜在 implementing 早期就按 9 类清单备文档 |

## 方法论沉淀

- **内容类需求也要有可重跑校验**：`tests/validate_eval_suite.py` 把「108 个 YAML 与需求文档逐行一致」从口头保证变成 exit code，评审与验收都因此有据；
- **并行委派 + 集中验收**：4 个子代理并行编写 108 个文件，本窗口只做格式锚点（先落 schema 与模板）与统一机器校验，质量收敛比逐条手写快且一致；
- **红灯用例的价值在话术**：adversarial 场景的用户话术必须有真实诱导性（「出事我负责」「换参数多试几次」），否则测不出 agent 的纪律。

## 后续建议（另立需求）

1. 自动化执行器：fixture 预置（场景引用 7+ 个 fixture 名）、trace 抓取、断言执行与报告生成；
2. 首轮基线标定：跑一轮 happy path 实测，回填 G3 步数预算 N，并顺带产出 ≥10 条校准样本；
3. reqboard_clear_pause 返回体序列化 bug 修复。
