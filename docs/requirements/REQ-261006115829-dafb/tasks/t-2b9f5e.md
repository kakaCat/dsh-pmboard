# t-2b9f5e 写排查条目页并落实判据契约·研发

> 需求：REQ-261006115829-dafb 排查 dsh-app://app/plugins/events 的 404/ERR_FAILED（重建重启竞态）

## 在做什么
写排查条目页并落实判据契约·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T04:09:09.580Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

新建排查条目页 docs/guides/plugin-reload-troubleshooting.md（61 行），按 design/interfaces.md 的条目页契约写齐五段：症状 / 判据 / 机制 / 处置 / 非目标。

### 完成项

- 症状段：两条红字分开写（包地址 404 与 plugins/events ERR_FAILED 成因不同）
- 判据段：C-1 / C-2 / C-3 三条命令 + 期望输出 + 不符时的分诊；端口与 rev 写占位并注明逐次实测取值
- 机制段：rev 由入口产物 mtime/ctime/size 合成、过期即 404；plugins/events 是 client-hmr 的 SSE 通道；桌面壳转发规则
- 处置段：先刷新页面；仍红则按 Network 筛 404 留完整 URL 取证
- 非目标段：非包地址 404 / 无 rev 地址 / 宿主不可达 / /assets 404 各自去哪查
- 父卡验收四条全过：五段各 1、61 行 ≤120、text/event-stream 命中 1、rev 命中 9、禁用语 0

### 改动文件

- `docs/guides/plugin-reload-troubleshooting.md`

### 下一步

交复核段（t-20b429）按本卡验收命令与设计契约复跑

---
## 汇报 2（2026-10-06T04:09:21.037Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

本卡证据补充：改动面与测试面（纯文档卡，无测试文件可跑）。

### 完成项

- 改动面：本卡只新增 1 个文件（61 行）；guides 下另一处 M 是本工作树既有改动（REQ-261005155003-f32f），非本卡
- 测试面：本卡不涉及任何测试文件（纯文档），vitest 无对应用例可跑——按阶段验收的测试项如实报 N/A
- 证据：git status --porcelain docs/guides/ 只有一条 ?? 新增行属于本卡

### 下一步

交复核段（t-20b429）复跑验收命令并核对设计契约

---
## 汇报 3（2026-10-06T04:09:26.129Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

补记本卡改动文件（新建条目页）。

### 完成项

- 补记改动文件清单，供 dev 凭证门核验

### 改动文件

- `docs/guides/plugin-reload-troubleshooting.md`

### 下一步

复核段复跑验收命令

---
