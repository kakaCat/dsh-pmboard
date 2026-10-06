---
serves: [FR-5]
---

# 前端设计（REQ-261005122915-9f90）

> 只做一件事：把**已经交付但从未接线**的批量清场入口接到看板需求详情上（FR-5）。

## 入口位置与形态 `serves: FR-5`

- **位置**：需求详情的**常驻操作条**——`src/client/views/stage-detail.ts` 的 `renderActionBar(req)`
  追加一枚按钮。选它的理由：该条已是「本阶段人工闸门按钮」的正面铺开处（批准计划 / 验收裁决 / 退回归档
  都在这里），清场是同一类人工操作，不应再埋进折叠区。
- **形态**：`<button class="dsh-pm-btn" data-action="rollback-cleanup" data-id="<req.id>" data-seq="<seq>">清理误物化重做卡</button>`
  （`title` 写明「按第 N 次回退的物化清单批量取消占位卡；不影响已完成卡」）。
- **渲染条件**：`req.rollback !== undefined`。无回退记录 → **不渲染**（与既有「不给点了必被拒的假按钮」
  纪律一致，见 REQ-9f4a44 后的操作条注释）。
- **序号取值**：`req.rollback.seq ?? 1`（与服务端 `currentRollbackSeq` 同口径：存量记录无 `seq` 时按 1）。
- **不做**：不在泳道卡面 `cardActions` 重复给按钮（卡面已够密，避免误点批量操作）。

## 事件通道与回执展示 `serves: FR-5`

- `src/client/board-mount.ts` 新增 `case 'rollback-cleanup'`（与既有 `auto-run-stop` 同款写法）：
  1. `window.confirm` 说明后果（照抄服务端语义：按第 N 次回退的物化清单批量取消；不碰 `done` 卡）；
  2. 调 `api.rollbackCleanup({ id, rollbackSeq, reason: '看板需求详情：清理误物化重做卡' })`；
  3. 成功后 `window.alert` 展示**可核对回执**（逐行）：
     ```
     清理完成（第 N 次回退）
     匹配方式：按该次回退记录的物化清单精确匹配      ← matchedBy 的人话，原样取服务端 note
     已取消：13 张 · 父子关系还原：0 条
     （有 skipped 时逐条）跳过 <taskId>：<reason>
     ```
  4. `fetchAll()` 重绘（按钮随 `rollback` 记录仍在而保留，重放即为幂等验证）；
  5. 失败 → `window.alert(String(e))`（服务端错误码与文案原样透出，不替换、不静默）。
- `src/client/api.ts` 新增 `rollbackCleanup(input)`，复用既有 `post` 助手（超时/错误信封与其它接口同款）。

## 禁用与错误态 `serves: FR-5`

| 状态 | 表现 |
|---|---|
| 无 `rollback` 记录 | 不渲染按钮（不是灰按钮） |
| 有记录、序号缺失 | 渲染，`data-seq=1`（存量口径，服务端允许） |
| 在途（请求中） | 按钮保持可点（幂等），重复点击不会重复取消（服务端 `canceled === 0`） |
| 服务端拒绝 | `alert` 原样展示 `error` 文案（如 REQBOARD_UNKNOWN_ROLLBACK_SEQ），不做二次包装 |

## 样式与既有约定 `serves: FR-5`

- 复用既有类 `dsh-pm-btn`（与操作条其它按钮同款），**不新增样式块**；
- 文案走既有 `esc()` 转义；不引入新的状态管理——按钮是纯字符串渲染 + 事件委托，
  与操作条其它按钮完全同构。
