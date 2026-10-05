# REQ-261002153446-c600 自评审 · 看板窗口 chip 恢复并打开

> 评审对象：src/client/session-jump.ts、src/client/render/dom-utils.ts、src/client/board-mount.ts
> 评审方式：对照 requirement.md 的 FR-1..FR-5 与设计 design/interfaces.md I-1..I-5 逐条核验。

## 逐条核验

| 条款 | 核验点 | 结论 |
|---|---|---|
| FR-1 | `restoreIfArchived` 命中归档集合时先 `await unarchiveSession`，成功才继续跳转 | ✅ 单测 TC-1 时间线可证伪 |
| FR-2 | 抛错 → `restore-failed` 且不 openSession；无能力 → `archived` 且文案说清 | ✅ TC-2 / TC-3 |
| FR-3 | 已归档 chip title 含「点击取消归档并打开」，类名与 data 属性不变 | ✅ board-info-fixes 断言 |
| FR-4 | 恢复后的跳转顺序仍为 `selectPanel(null)` → `openSession`；未归档路径零副作用 | ✅ TC-1 / TC-4，既有 8 条用例原样通过 |
| FR-5 | 行为由单测锁死；两文件 29 passed | ✅ |

## 边界与不做的事

- 不加二次确认：点击意图就是打开，恢复幂等且可逆。已按边界声明执行，未扩范围。
- 未改 DSH 宿主、未新增后端接口、未改数据模型——三条升级信号均未触发，轻档成立。

## 已知不足（如实记录）

1. **需要刷新页面**：客户端 bundle 已重建，但本窗口未跑 `dev:web` 监听，浏览器需手动刷新一次才拿到新代码。
2. **handmade 假服务**：单测用假 `SessionServiceAccess` 投影（与既有 8 条用例同款），
   覆盖行为契约；真实 `workspaces.unarchiveSession` 的 RPC 行为由 DSH 宿主侧单测保证，本需求不改它。
3. **既有基线红**：`jumpResultMessage('unavailable')` 文案缺「暂不可用」是 HEAD 上就红的断言，
   本次因改动同一函数而一并修正（已写入 evidence，未掩盖）。
