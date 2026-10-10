# 实施（implementing）· 轻档

> 轻档：直接改、自测通过就汇报；任务卡状态与产物链照旧维护。

- [ ] **照卡执行**：调 `reqboard_task_move(to=in_progress)` 取卡全文，按卡实施，不加功能、不扩范围。
- [ ] **自测**：改动后跑相关测试 / 命令确认通过（不跑不算完成）。
- [ ] **汇报**：调 `reqboard_task_report` 落完工记录。
- [ ] **遇门用弹框**：需人拍板（范围变更 / 方案取舍）用 `reqboard_ask_confirm`。
- [ ] **Worktree（不强制，防多窗口冲突）**：`git worktree add .worktrees/REQ-<号>/ -b feature/REQ-<号>`；
      子任务完成即 commit 检查点；归档时合并回主线并 `git worktree remove` 清理。

- [ ] **下一步**：下一步：accepting —— 用 reqboard_submit(kind=verification) 交棒；未获批准不得进入。

- [ ] 开工先查 `reqboard_kb(kind='standard')`；改完自证，收尾沉淀新规范。
