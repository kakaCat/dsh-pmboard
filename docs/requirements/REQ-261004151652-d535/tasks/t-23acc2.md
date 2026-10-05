# t-23acc2 构建与基线回归 + 三档截图（收口）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
构建与基线回归 + 三档截图（收口）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
pnpm build 与 pnpm build:client 退出码 0 且输出含 [verify-client] OK、dist/index.mjs 与 lib/client.js 时间戳更新；全量 pnpm test 的失败文件集合与改动前逐文件相同（贴 diff 输出）；pnpm typecheck 错误数 ≤ 146；三档截图（视口 1280 / 700 / 560）落盘且 700 档图里当前节点名字下方能看到它自己的数、560 档图里只有圆点+计数+徽章；evidence/ 下有兼容与回滚说明。

## 实施方案（implementation）
跑 pnpm build（C-11）与 pnpm build:client（C-12）并核对产物；跑全量 pnpm test 与改动前基线做失败文件集合 diff；跑 pnpm typecheck 计数；用标本页生成器（真 CSS + 真模型 + 真 Chrome）出三档截图（1280 宽档 / 700 中档 / 560 窄档）；核对兼容（后端契约零变更、降级路径行为）与回滚（三处独立回滚）；所有输出与截图写进 docs/requirements/REQ-261004151652-d535/evidence/。

## 上游产出摘要（dependsSummary）
- 探针改判据：可见集重写 + 三条新断言 + 红态自证

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T07:35:18.295Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，本需求可交验收：每个节点的数都跟着它的名字走，窄到只剩圆点时把总数交出来，且基线零新增红。

### 完成项

- 构建与产物核对通过（宿主 + 客户端）
- 全量失败集合与基线逐文件零差异
- 三档截图落盘（1280 / 700 / 560）
- 兼容与回滚逐条写明
- 唯一待人工项已标注：重载宿主看真机

### 改动文件

- `docs/requirements/REQ-261004151652-d535/evidence/t3-evidence.md`

---
