# t-afd035 pending 票首屏横带组件·复核

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
pending 票首屏横带组件·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007223647-da5d/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T16:26:30.714Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，容器与设计的三条空态/降级口径逐条对上；一处「失败红字由谁兜」的实现分工已留档说明。

### 完成项

- frontend.md §空态与降级三条逐条核对：① 无 pending → Band 不渲染（返回空串，用例断言等于 ''）✓；② 老服务端无该键 → 按 [] 处理（api 宽松解析 + 容器 undefined 零渲染，各有用例）✓；③ 取数失败 → Band 显示一行红字「pending 票读取失败」（用例断言文案 + data-pending-error）✓
- 交互路径核对（frontend.md §交互路径）：打开看板 → /state 带 pending_confirms → Band 钉顶（t10 用例断言横带出现在页头之前）；倒计时每秒本地递减、不轮询（t8 tick 用例）；到零切「已超时」仍可答（t8 用例）
- 样式归属核对：容器类名 .dsh-pm-pending-band 在 styles/report/band.ts 落位（与常驻状态带同族）✓
- 偏离说明（如实记录）：设计写「取数失败显示一行红字」——本实现的红字走**容器自身的 error 分支**（组件用例在场），而 board-mount 的失败路径是 /state 整体取数失败 → 走既有整页错误态（buildError）。理由：pending 票与需求列表同在 /state 一个响应里，不存在「列表取到了、票没取到」的中间态；若将来票源独立，容器接口已就绪
- 命令：npx vitest run tests/pending-confirm-band.test.ts tests/pending-band-wiring.test.ts → 全绿

### 改动文件

- `src/client/views/pending-confirm.ts`

### 下一步

测试段：跑本卡相关测试集并留命令与输出摘要

---
