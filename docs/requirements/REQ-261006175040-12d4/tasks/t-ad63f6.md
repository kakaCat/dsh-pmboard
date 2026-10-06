# t-ad63f6 兼容与回滚收口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
兼容与回滚收口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① 旧服务端形态下卡面不出现 ✗、产物 0/6、门 0/N，其余卡面照旧；② pnpm build:client 输出 [verify-client] OK；③ pnpm typecheck 退出码 0 且 pnpm baseline:check 失败用例集合差为空；④ 回滚演练证据入 compat-rollback.md。

## 实施方案（implementation）
新增 docs/requirements/REQ-261006175040-12d4/evidence/compat-rollback.md 记录四项证据：旧服务端（摘要无读数键）降级渲染、pnpm build:client 输出、pnpm typecheck 与 pnpm baseline:check 读数、回滚演练（git stash 客户端改动后重建复现旧行为）。

## 上游产出摘要（dependsSummary）
- 四实现同形与载荷上界断言
- E2E 出图脚本与三态证据

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:54:28.135Z，窗口 session-5678dda2-4511-465c-bae1-0b321cd1c0fc）

t10 完成：旧服务端降级在真实 60 条载荷上实测不说谎，回滚步骤与危险侧写明；构建 OK。另修掉基线抓出的一条本次回归（stage-panel 旧契约用例），并如实记录 typecheck/基线的不达标项属外部。

### 完成项

- 演练①（旧服务端降级）：取改动前真实 /state（60 条需求、0 条含 gates）删键后喂真渲染器 ⇒ 整页 ✗ 0 处、产物 0/6 0 处、门 0/4 0 处；目标卡只剩标题（不白卡）
- 演练②（危险侧）：只回滚客户端 ⇒ 旧谎报复活（四门恒红 + 产物 0/6），证据引 inverse-verification.md 的逆验证①（4/4 红）
- 回滚步骤写进证据：12 个源文件分组 git checkout + pnpm build:client + 基线判据；台账零改动（本次只读台账）
- 构建读数：pnpm build:client → [verify-client] OK bundle=712353 bytes
- 基线跑了两轮：第二轮新增失败清单里已不含本需求涉及的任何测试文件
- 期间抓到并修掉一条真属本次的回归：tests/stage-panel.test.ts 的 renderConfirmButton 用例仍用旧契约夹具（t6 改契约后失效）——已按 gates 重写，61 passed
- 如实交代不达标项：typecheck 退出码非 0（剩 1 条外部 vendor 路径错，属 7a43 在飞）与基线差集非空（新增失败全指向外部）——按纪律不掩饰、不 refresh 基线
- 证据落盘：docs/requirements/REQ-261006175040-12d4/evidence/compat-rollback.md

### 改动文件

- `docs/requirements/REQ-261006175040-12d4/evidence/compat-rollback.md`
- `tests/stage-panel.test.ts`

### 下一步

全部 10 张卡收口后进验收：reqboard_submit(kind=verification) 提交验收材料

---
