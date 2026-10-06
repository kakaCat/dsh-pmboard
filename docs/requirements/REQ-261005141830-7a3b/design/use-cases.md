---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 用例设计（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）。场景语言：谁 → 什么条件 → 做什么 → 看到什么。
> 系统内部实现见 `architecture.md`，验收命令见 `test-cases.md`。

## UC-1 立项定身份（窗口 → projectId） `serves: FR-1, FR-2`

**谁**：多项目并行的使用者。**条件**：窗口 A 已归属项目 P1，人在 A 里调 `reqboard_capture`。

1. 人人作答 → 系统用 A 的会话 id 查项目表（`sessionIds` 含它）→ 拿到 `projectId = P1`。
2. 记录写入 `projectId = P1`；`workspaceRoot` 仍写（快照）。
3. **看到**：回执含 `projectId: P1` 与 `projectSource: project-id`；看板里该需求归 P1。

**异常路径**：窗口不属于任何项目（宿主"未分组"）→ 记录**不写** `projectId`，立项评论出现
"未归属项目（按路径兜底）"字样，回执 `projectSource: path-fallback`。**不猜、不编 id**。

## UC-2 读写盘按项目根（跨窗口并发） `serves: FR-3, FR-5`

**谁**：窗口 A（P1）与窗口 B（P2）同时干活。

1. A 触发写入（提交产物 / 推进状态）→ 系统按 A 的需求记录 `projectId = P1` 取根。
2. 期间 B 调 `reqboard_status` → 共享单例根被 B 改成 P2 的根（现状如此，本次不消灭这个单例）。
3. A 的写入仍落在 **P1**；复核通过；**看到**：A 的产物只在 P1 目录出现，P2 目录零新增。
4. 反向：把 B 的记录拿给 A 的调用上下文（真错配）→ 仍 `REQBOARD_PROJECT_ROOT_MISMATCH`，文案给两个绝对路径。

## UC-3 看板按项目看需求 `serves: FR-6, FR-10`

**谁**：使用者。**条件**：A 在 P1 打开看板。

1. 前端带 `session=<A 的会话 id>` → 路由解析出 `projectId = P1`。
2. 列表按 `projectId` 过滤 → **看到** P1 的 3 条需求（P2 的 2 条不出现）。
3. 产物扫描同样按 `projectId` 分区 → 不拿 P1 的根去扫 P2 的同名目录（`others` 桶计数）。
4. 知识层自举去重键为 `projectId` → P1 / P2 各一次，两个窗口触发也只跑一次。

## UC-4 Dive idle 拍的归属与起轮 `serves: FR-4, FR-7`

**谁**：Dive 驱动（自动续跑）。**条件**：窗口 A 与窗口 B 同属 P1，窗口 C 属 P2；P1 有一条 armed 需求绑在 A。

1. A idle → 解析 A 的 `projectId = P1` → 与需求 `projectId` 相等 → 归属通过（可读 / 可写 / 可扫）。
2. B idle → 也判"同项目"，但**起轮权按席位/`sourceSessionId`**：需求绑的是 A ⇒ B **不起轮**。
3. C idle → 与需求 `projectId` 不等 ⇒ 零投递 + 留痕（写明两个 `projectId`）。
4. **看到**：一回合只起一次；跨项目零投递且现场有据可查。

## UC-5 派席 / 交接的跨项目拦截 `serves: FR-11`

**谁**：需求 owner。**条件**：需求属 P1。

1. owner 把 P2 的窗口派成 worker → **被拒** `REQBOARD_CROSS_PROJECT_SEAT`，文案含两个 `projectId` 与各自根，台账零改动。
2. owner 把 P1 的另一窗口（不同 session）派成 worker → 成功（同项目多窗口是常态）。
3. 交接（handoff）到跨项目窗口 → 同样被拒；同项目窗口 → 照常交接。
4. **边界**：`remove=true` 解绑不校验项目（只做减法）。

## UC-6 存量需求与未归属窗口 `serves: FR-8, FR-9`

**谁**：维护者 / 存量用户。**条件**：56 条存量记录无 `projectId`；3 条连 `workspaceRoot` 也没有。

1. 读 / 写 / 推进存量需求 → 与改造前逐字一致（回落 `workspaceRoot`），仅判定结果标 `attributed=false`。
2. 连 `workspaceRoot` 都没有的记录 → 走调用方兜底根并**标注**，不静默当成本项目。
3. 宿主无 workspace 注册表（老版本）→ 全局降级路径兜底 + 标注，功能不中断。

## 用例与条款对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

| 用例 | 覆盖条款 |
|---|---|
| UC-1 立项定身份 | FR-1 / FR-2 |
| UC-2 读写盘按项目根 | FR-3 / FR-5 |
| UC-3 看板按项目看需求 | FR-6 / FR-10（含 FR-2 的解析） |
| UC-4 Dive 归属与起轮 | FR-4 / FR-7（含 FR-9 的留痕） |
| UC-5 派席 / 交接拦截 | FR-11（含 FR-9 的文案要求） |
| UC-6 存量与未归属 | FR-8 / FR-9 |
