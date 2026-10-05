# 自评审报告（REQ-261004210128-283d）

> 范围：本需求全部改动的对抗式复核（作者自审，非独立评审人）。结论：**未发现需返工的缺陷**，两处与设计的偏离已具名。

## 一、复核对象

| 文件 | 角色 |
|------|------|
| `src/client/session-running.ts` | 读数 / 订阅 / 需求映射 / 重绘门控辅助（唯一实现处） |
| `src/client/render/dom-utils.ts` | `renderRunningDot`（唯一渲染单点） |
| `src/client/views/artifacts.ts` / `src/client/views/board.ts` | 两处视图透传 |
| `src/client/board-mount.ts` | 订阅接线、重绘门控、dispose 退订 |
| `src/client/styles/board.ts` | 指示样式与降级分支 |
| `src/client/session-jump.ts` / `src/client/types.ts` | 类型放宽与席位声明 |

## 二、逐条对抗式检查

| 检查项 | 方法 | 结论 |
|--------|------|------|
| 降级是否静默吞掉业务失败 | 通读 session-running 的 5 条降级路径 | 只吞「能力不可得」（服务/行/字段缺失），不吞业务失败；模块内无 `console.error` |
| 是否伪造运行态 | `grep` 全模块找 `updatedAt` / `autoRun` / `advanceLockAt` / `executions` | 零命中——不存在近似推断 |
| 判据是否只有一处 | 检查两处视图的运行判定 | 两处都调用 `requirementRunning`；渲染单点 `renderRunningDot` 只有一处定义 |
| 门控是否真的挡得住 | 渲染计数断言（TC-12） | 无关会话抖动 0 次重绘；相关抖动各 1 次 |
| 退订是否可靠 | 直接调用退订前捕获的旧回调（TC-14） | `disposed` 先置真 + 退订双保险，迟到通知 0 次重绘 |
| 旧调用方是否受影响 | 省略参数与显式空集逐字节比对（TC-09） | 完全一致；`renderReqCard` 的既有测试（token-card）不改判据即通过 |
| 席位边界（异常数据） | 显式空 `seats` + 来源窗口在跑 | 判「不在跑」——与 host `seatsOf`「有值即权威」口径一致（设计真值表已写明） |
| 无障碍 | 检查 DOM 属性 | `role="img"` + `aria-label="会话进行中"` + `title`；装饰性 svg 带 `aria-hidden` |
| 动效偏好 | 样式契约用例 | 降级分支点名弧线动画并停动画；静态半环仍在场 |
| 样式纪律 | `pnpm build:client` 的 verify-client | 归属章在场、分片完整 |

## 三、与设计的偏离（具名）

1. **增补（非契约变更）**：额外导出 `relevantSessionIds` / `sameRunningSet` / `runningAmong` 三个门控辅助函数。
   `design/architecture.md` 描述了「相关集合收敛」的行为但未点名函数；实现把它们与读数放在同一模块，避免门控逻辑散落到挂载层。
2. **实现取严**：`renderReqCard` / `renderListCard` 的运行态参数实现为**布尔**（`design/architecture.md`「渲染层只接布尔」），
   而 `design/interfaces.md` 的签名写的是集合。集合 → 布尔的映射收在 `buildBoard` / `buildListView` 一处，
   两个视图都不再自己映射。行为与设计意图一致，仅签名形态更严。

## 四、未覆盖 / 留在验收的部分

- **应用内人工观察（TC-11a～TC-11e）**：需要人在浏览器里跑回合观察，agent 无法执行与截图，已在验收材料中标为已知缺口并给出 6 步复现路径。
- 未做浏览器端自动化（本包无 jsdom/Playwright 依赖）：如后续需要，可另立需求引入 E2E 框架，不在本需求范围内。
