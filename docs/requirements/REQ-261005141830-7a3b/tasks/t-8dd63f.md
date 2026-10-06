# t-8dd63f Dive 归属按项目、派席与交接拦跨项目·研发

> 需求：REQ-261005141830-7a3b 修复 Dive 项目归属以路径判定：改用项目 id 唯一标识

## 在做什么
Dive 归属按项目、派席与交接拦跨项目·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T07:23:25.757Z，窗口 session-97aa4376-441a-4f0a-800a-7b13aad48a09）

研发段：把「跨项目不得派席/交接/改绑」与「Dive 只驱动本项目的需求」两条判定落成一个共用判据，并接在四处入口上。

### 完成项

- 新增「派席/交接/改绑必须同项目」的唯一判据 requireSameProject：两侧都有身份比 id，缺身份比路径，比不了则如实标注未归属
- Dive 驱动器新增项目身份端口，并把「这个窗口绑的需求」收敛成一处取数（先按绑定窗口、再验项目归属）
- 三个入口接上校验：reqboard_bind（派席）、handoff（显式接管窗口）、看板改绑路由；均在任何写入之前判，被拒即台账零改动
- 解绑路径刻意跳过校验（只做减法）；判据来源随回执与变更评论向外说（project_source / project_id）
- 新增错误码 REQBOARD_CROSS_PROJECT_SEAT 并映射到 HTTP 400；两个工具的输出版本同步声明新字段

### 改动文件

- `src/application/internal/support.ts`
- `src/application/dive/round-driver.ts`
- `src/application/use-cases/BindSeat.ts`
- `src/application/use-cases/HandoffOwner.ts`
- `src/http/routers/requirements.ts`
- `src/http/envelope.ts`
- `src/index.ts`
- `src/tools/BindTool/BindTool.ts`
- `src/tools/HandoffTool/HandoffTool.ts`

### 下一步

研发段交联调段：核对判据在派席/交接/改绑/驱动四处口径一致、老装配零行为变化。

---
