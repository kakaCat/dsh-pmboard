# t-3dad5a 确认票超时不丢与一键重投

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
确认票超时不丢与一键重投

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

怎么验（可执行）：① 跑 `npx vitest run tests/confirm-repost.test.ts tests/ask-timed.test.ts` → 退出码 0；② 断言读数：宽限到期回执 pending=true 且带 ticket、注册表里该票仍活、凭 ticket 取回执可取；重投（redispatch）后注册表计数不变、已落章的 confirmedAt 不被重写；③ 端到端可 curl：POST http://127.0.0.1:19387/dashboard/api/reqboard/confirm/repost，body {"id":"<REQ-id>","ticket":"pc-xxxx"}，看返回 data.action ∈ still-open / gone / unavailable。

## 实施方案（implementation）
AskConfirm 阻塞等待与 Capture 两段弹框改走 askTimed（超时回执 pending+ticket，不再 interrupted 丢票）；Submit 自动门保持纯投递零等待并核验；gate-request reused 分支增 redispatch（同 ticket 重发通知，零台账写入）；HTTP 增 POST /confirms/:ticket/repost（窗口内票才受理）。

## 上游产出摘要（dependsSummary）
- 弹框通道限时等待 askTimed

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:06:54.723Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

这一步做完，等弹框等到点不再等于「出事」：超时只回一句「还没等到」并告诉你还有哪两条路能走；看板上那张票也能被查一次——还在等就说还在等，失效了就说失效，绝不假装重投过。

### 完成项

- 立项弹框两段等待改走 askWithBudget：等待死在工具预算之前（1 小时预算 → 等到减 2 秒安全边），到点回中性回执「等待超时」并给出可行出路，不再让调用被外部砍掉
- 新增 POST /confirm/repost：如实查票——仍在等 → still-open（告诉人「复用同一道门」或「看板作答」两条真路），已失效 → gone（引导重新发起），读口未装配 → unavailable（不冒充「没有人在等」）
- route 与 processor 接线完成（routes.ts 分发 + requirements 路由器导出）
- 核验既有 AskConfirm 路径：默认宽限 = 工具预算 − 60s 边距、自动确认走 2000ms 非阻塞 + fire-and-forget 投递，均已在预算内——本卡无需再改（如实记录）
- 偏离说明（如实）：设计 IF-4 写的是「redispatch 同 ticket 重发弹框」，实现改为**如实查询 + 出路指引**——看板 HTTP 面无会话投递通道（弹框必须落在需求所属窗口的 agent 上），与其造「看起来弹了、其实没人收到」的假动作，不如把两条真能走的路说清楚；真正的再弹仍由 agent 调 ask_confirm 复用同一道门（gate-request 判定序①保证不新建第二道门）

### 改动文件

- `src/application/use-cases/CaptureRequirement.ts`
- `src/http/routers/requirements.ts`
- `src/http/routes.ts`
- `tests/confirm-repost.test.ts`

### 下一步

t5 卡：取消留痕与连续取消引导（同窗口 30 分钟内连续取消 3 次 → 不再弹框、提议走看板）。

---
