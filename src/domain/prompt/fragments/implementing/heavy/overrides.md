## 本仓覆盖条目（覆盖上文与本仓冲突之处；priority=floor，永不被裁）

- [ ] **覆盖 1 · 任务来源**：上文说"读 plan 文件、按 bite-sized steps 执行"。本仓的任务卡由
      `reqboard_decompose` 落库：开工时 `reqboard_task_move(to=in_progress)` 返回任务卡全文
      （title / description / acceptance / implementation / context），照卡执行，不凭记忆、不二次创作。
- [ ] **覆盖 2 · 汇报 = 完工记录**：每张卡完成必须 `reqboard_task_report`（做了什么 / 改了哪些文件 /
      下一步）——它是 done 凭证门的前置；无汇报、无真实工具动作、60s 内连环关任务会被代码级拒绝。
- [ ] **覆盖 3 · 构建新鲜度**：改了 packages/pages/*/src 必须重建对应 client 产物，
      否则关任务会被构建新鲜度门拒绝（STALE_BUILD）。
- [ ] **覆盖 4 · 附属按需片段（同一次注入最多挂一个）**：只在出现对应场景时才用
      test-driven-development / subagent-driven-development / using-git-worktrees /
      dispatching-parallel-agents / requesting-code-review，不默认全挂。
- [ ] **覆盖 5 · 遇门用弹框**：范围变更 / 方案取舍用 `reqboard_ask_confirm`；
      普通信息征询用 `ask_user_question`（宿主工具，非 reqboard_* 工具集）。
- [ ] **覆盖 6 · 交棒**：下一步：accepting —— 用 reqboard_submit(kind=verification) 交棒；未获批准不得进入。
- [ ] **覆盖 7 · 任务卡必须说人话**：卡的标题与正文要让**非工程读者**复述出
      「在解决什么」与「做完看到什么变化」；三要素（在做什么 / 解决什么问题 / 得到什么结果）
      缺一即被门禁拦下（task_card_incomplete）。工程细节（改哪些文件 / 表 / 接口 / 测试命令）
      下沉到「实施方案」与「验收标准」，**不当主语**。反例：「判据 metric 化」「规则自愈」。

- [ ] **覆盖 8 · 汇报自检（防整轮报废）**：调 `reqboard_task_report` 前自检——正文不出现半角双引号
      （要引号用「」）、`completed` 每条短句（建议 ≤60 字）、文本过长就拆成多次调用（幂等追加）。
      参数里一处引号漏转义 → 工具参数 JSON 非法 → 适配器判 MALFORMED_RESPONSE →
      **整轮运行失败**，该卡汇报永远落不了库（2026-10-02 实测两次）。

- [ ] **覆盖 9 · 原型与裁定对照**：本卡「设计落点」带原型锚点时，动手前先照 `prototypes/INDEX.md`
      的权威原型看对应锚点区块（`prototypes/<name>.html#FR-N`），并逐条兑现本卡关联的 D-x 裁定原话
      （不概括、不重写）；实施完按锚点自查。**不许"没看原型就动手"**——那是返工的根因。

- [ ] 开工先查 `reqboard_kb(kind='standard')`；改完自证，收尾沉淀新规范。
