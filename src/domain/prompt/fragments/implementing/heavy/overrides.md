## 本仓覆盖条目（覆盖上文与本仓冲突之处；priority=floor，永不被裁）

- [ ] **覆盖 1 · 上游附属 skill 只留档、不注册**：上游的 test-driven-development /
      subagent-driven-development / using-git-worktrees / dispatching-parallel-agents /
      requesting-code-review 在本仓**只留档、不注册为分片**（注册即需被路由命中，否则违反
      「无孤岛」门禁）——不得尝试加载它们，也不得因加载不了而停手。本仓的派发与复核纪律见
      上文「子代理：派发与复核」，机制细节见 `docs/architecture/subtask-stage-template.md`。

- [ ] **覆盖 2 · 汇报自检（防整轮报废）**：调 `reqboard_task_report` 前自检——正文不出现半角双引号
      （要引号用「」）、`completed` 每条短句（建议 ≤60 字）、文本过长就拆成多次调用（幂等追加）。
      参数里一处引号漏转义 → 工具参数 JSON 非法 → 适配器判 MALFORMED_RESPONSE →
      **整轮运行失败**，该卡汇报永远落不了库（2026-10-02 实测两次）。

- [ ] 开工先查 `reqboard_kb(kind='standard')`；改完自证，收尾沉淀新规范。
