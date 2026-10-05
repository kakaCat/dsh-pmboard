# t-d34ccf 收口：四门禁 + GUI 手工证据·研发

> 需求：REQ-261004184822-9881 看板泳道自动刷新导致浏览位置丢失

## 在做什么
收口：四门禁 + GUI 手工证据·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T11:07:41.103Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

这一步做完，交付有了可复核的读数：四门禁全部达标（失败数 98 ≤ 106、类型错误 153 ≤ 223），GUI 三条人工检查由人在真机确认通过，替代截图的说明也写在证据里。

### 完成项

- evidence/gates.txt 落盘：含五条命令原文与实测输出（build / build:client / 构建戳 / typecheck / 全量 test）
- pnpm build exit 0；pnpm build:client 输出 [verify-client] OK（bundle 410557 bytes）
- 构建戳 sha256(lib/client.cjs) 前 12 位 = 17e9dba1f362（验前人已 Cmd+R 刷新页面拿到新版）
- pnpm typecheck 错误数 153（基线 223），改动文件零错误；exit=2 是仓库既有历史错误所致，判据按错误数
- npx vitest run tests/board-lane-scroll.test.ts → 15 passed
- pnpm test → 98 failed / 4416 passed（基线 106 failed；开工前后同为 98，未新增失败）
- evidence/lane-scroll-gui.md 落盘：GUI 三条人工检查的答复原文逐条记录
- 偏离声明：原计划要 evidence/lane-scroll-gui.png 截图，但 agent 无法操作用户浏览器，改为人工确认的文字记录（不做示意截图充数），并在文件头部写明替代原因

### 改动文件

- `docs/requirements/REQ-261004184822-9881/evidence/gates.txt`
- `docs/requirements/REQ-261004184822-9881/evidence/lane-scroll-gui.md`

### 下一步

子卡复核：核验证据是否支撑每条 FR

---
