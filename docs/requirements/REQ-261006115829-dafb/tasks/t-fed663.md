# t-fed663 判据实测定标并把读数回写条目与用例表·研发

> 需求：REQ-261006115829-dafb 排查 dsh-app://app/plugins/events 的 404/ERR_FAILED（重建重启竞态）

## 在做什么
判据实测定标并把读数回写条目与用例表·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T04:12:09.699Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

研发段完成：C-1/C-2/C-3 交付日复测并把读数回写条目页与 TC-3 定标表；同时记录 rev 会变的活例。

### 完成项

- 交付日实测（2026-10-06 12:11）：host=127.0.0.1:19387，rev=30507b9b5434
- C-1 = 200 + content-type: text/event-stream
- C-2 原样请求当前包地址 = 200（656260 字节）
- C-3 同地址改错 rev = 404（0 字节）
- 回写一：条目页判据段新增「本次交付实测定标」块（含 host / rev / 三条读数）
- 回写二：design/test-cases.md 的 TC-3 定标表更新为交付日读数，并记入定标值的时效说明
- 顺带观测到活例：lib/client.js 于 12:09:49 被重建，构建戳 cfd7e0c0d56c → 33a6b5c8ce65，上一轮 rev 失效——已写进条目与用例表
- 测试面：纯文档卡无对应 vitest 用例，如实报 N/A

### 改动文件

- `docs/guides/plugin-reload-troubleshooting.md`
- `docs/requirements/REQ-261006115829-dafb/design/test-cases.md`

### 下一步

交复核段（t-55d1a4）核对回写值与实测一致

---
