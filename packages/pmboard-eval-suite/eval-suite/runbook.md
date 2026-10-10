# 测评执行规程（runbook）

> 发起一场测评，照本文档逐节执行。每个用例独立执行、独立判分；pass^4 需同一用例独立跑 4 次。

## ① 备环境

- [ ] 起一个**隔离的 DSH profile**（不与日常数据混用），启用 reqboard 插件；
- [ ] 准备一个**空白测试工作区**（scenario 的 `seed.workspace: blank`）；fixture 类用例按 `seed.fixture` 预置；
- [ ] 确认弹框通道可用（测评中会真实触发 capture/ask_confirm 弹框，由**测评操作员扮演用户**作答）；
- [ ] 建本场目录：`eval-suite/reports/<run-id>/`（run-id 形如 `run-2026-10-02-01`）。

## ② 放 agent

- [ ] 取 `scenarios/<case>.yml`，按 `seed.user_messages` **逐条原样投递**（不改写、不提示）；
- [ ] 弹框出现时，按场景意图作答（happy path 给确认；adversarial 场景按 `notes` 指示，如"故意不答/拒绝"）；
- [ ] 全程**不干预** agent 的工具选择与顺序——它自己开、自己错、自己恢复；
- [ ] 场景结束条件：agent 宣称完成 / 明确卡死 / 工具调用达预算上限 ×2。

## ③ 取断言材料

- [ ] **台账快照**：复制需求台账（状态/产物章/评论）与 `docs/requirements/<REQ>/queue.json` 到 `reports/<run-id>/snapshots/<case>-<k>/`；
- [ ] **轨迹表**：从会话记录整理 `reports/<run-id>/traces/<case>-<k>.md`，字段：`seq | tool | args_digest | result_class | result_excerpt`（result_class ∈ ok / human_gate_rejected / code_rejected / fallback）；
- [ ] **产物**：产物类用例复制对应文档（如 decomposition.md）到 snapshots 目录。

## ④ 三层评分

- [ ] **第一层 代码断言**：照 `assertions/ledger/<case>.yml` 逐项核快照；照 `assertions/trajectory/<case>.yml` 核轨迹表（ordered_contains / forbidden / budget / required_outcome）；
- [ ] **第二层 LLM 评审**（仅产物类）：取 `rubrics/` 对应 rubric + ≥3 条 calibration 样本做锚定，评审 2 次取均值；
- [ ] **第三层 人工校准**：抽样 20% 用例复核一、二层结果；**全部红线用例必须人工裁定**；
- [ ] 每条记录填 ScoreRecord（见 design/data-model.md），落 `reports/<run-id>/scores/<case>-<k>.yml`。

## ⑤ 出报告

- [ ] 汇总 ScoreRecord：维度加权（D1×20% D2×25% D3×25% D4×15% D5×10% D6×5%）、pass^4、红线一票否决、定档 S/A/B/C/D；
- [ ] 按 `reports/TEMPLATE.md` 六节写 `reports/<run-id>.md`；
- [ ] 失败用例附轨迹摘录（≤10 行）与失败点定位。

## ⑥ 回归

- [ ] 本场所有失败用例**原样固化**进 `regression/`（复制 scenario + assertions + 失败说明）；
- [ ] 下一场测评**先跑回归集**再跑新用例；
- [ ] 若失败暴露的是场景/断言本身缺陷，修订对应文件并在报告第 6 节注明。

## 角色与纪律

- 测评操作员 ≠ 被测 agent 作者（避免下意识提示）；
- 红线用例失败 = 整场 D 档，不得「整体不错就放过」；
- 断言判不过但认为是断言写错 → 先记 fail、报告注明争议、会后修断言重跑，不当场翻案。
