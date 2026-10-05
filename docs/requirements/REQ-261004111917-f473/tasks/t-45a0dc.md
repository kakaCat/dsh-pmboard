# t-45a0dc board-focus 订阅通道 + 看板挂载定向·复核

> 需求：REQ-261004111917-f473 修复看板/需求详情深链 404：/dashboard#pmboard 已失效，补兼容路由 + 前端定位

## 在做什么
board-focus 订阅通道 + 看板挂载定向·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T03:49:28.038Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

复核段结论：订阅语义与不变量逐条一致，但复核揪出 4 条（隐藏实例吃掉意图、抛错静默吞意图、追溯编号漂移、覆盖缺口），全部当场修掉；客户端产物已重建并通过 verify 门禁。

### 完成项

- 复核方式：第三个独立子代理只读复核（对照 interfaces.md《board-focus 契约变更》《board-mount 订阅点契约》与不变量 I-7/I-6），并逐条核对了调用方影响与测试可证伪链
- 结论：语义分叉、防双跳、订阅生命周期、订阅者隔离、handler 与 open-req 同款、与 t2 消费端自洽、两条既有调用方无回归——全部一致，带条件放行
- 复核 R1（产物未重建）：已当场 pnpm build:client → [verify-client] OK，并取证产物含订阅诊断串（grep 命中 1）
- 复核 R2（隐藏实例吃掉意图）：已修——监听者可显式返回 false 表示「本实例没消费」；board-mount handler 在 disposed 或 !isActive() 时返回 false；全部未消费时意图回落为 pending，不再静默消失；新增 TC-8c（isActive()=false 时不切详情且 peek 仍得值）
- 复核 R3（唯一订阅者抛错静默吞意图）：已修——抛错按「未消费」处理并打 console.warn；新增 TC-7h（全部抛错也回落 pending）
- 复核 R4（追溯漂移）：新增用例补齐 TC-7a~TC-7i 编号；board-attach 里重复的 TC-8/TC-9 改为 TC-8b/TC-8c/TC-9b；test-cases.md 与 interfaces.md 关于空白输入的措辞冲突已记账（实现按 interfaces.md：清 pending 不通知）
- 复核 R5（空白清 pending 不可证伪）：新增可证伪前置——先留一条 pending 再传空白，断言 peek 为空（TC-7e）
- 复核 R6（覆盖缺口）：新增 TC-7i（通知期间订阅者退订/新增不打乱本次迭代，快照拷贝）；host-panel.test.ts 缺 react-dom 无法加载记为预存在技术债
- 复核 R7d：dispose 里 unsubFocus 提到 removeEventListener 之前（容器桩抛错不该连累退订）
- 复核 R7a（重要，转 t5）：深链经宿主路由是整页加载 → 消费发生在 apply 期、看板通常尚未挂载，故 UC-3 的真机可达性窄；t5 端到端不能靠「再点一次链接」构造 UC-3
- 自测：npx vitest run tests/board-focus.test.ts tests/board-attach.test.ts → 23/23 全绿；npx tsc --noEmit 本卡文件零 error（并修掉一处 boolean|void 与 false 比较的 TS2367）
- 反向演练 3 组（改完即撤，两文件 sha256 逐字节还原）：去掉订阅接线 → 1 红；无条件写 pending → 3 红；去掉可见性门闩 → 1 红

### 改动文件

- `src/client/board-focus.ts`
- `src/client/board-mount.ts`
- `tests/board-focus.test.ts`
- `tests/board-attach.test.ts`
- `lib/client.js`

### 下一步

交测试段：全量回归 + tsc 基线 + 构建产物取证。

---
