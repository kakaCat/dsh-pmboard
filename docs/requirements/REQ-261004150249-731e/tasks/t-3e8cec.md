# t-3e8cec 交接写原子化：席位升降 + sourceSessionId + 留痕

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
交接写原子化：席位升降 + sourceSessionId + 留痕

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/handoff-owner.test.ts：① 交接后 seats 含 owner=toWindow、observer=fromWindow 且 sourceSessionId===toWindow；② mutate 内注入异常 → seats 与 sourceSessionId 三处都不变（无半个交接）；③ 无 seats 的存量记录被物化为两条；④ 重复调用 changed=false 且评论数不变。

## 实施方案（implementation）
新建 src/application/internal/handoff-write.ts：handoffOwner(req, { toWindow, fromWindow, actor, at, commentId, reason }) 在一次 mutate 内完成 ① 新窗口入席 owner ② 原窗口（若有席位）降 observer ③ req.sourceSessionId = toWindow ④ 追一条留痕评论（from→to、角色变化、reason）。前置校验：当前 owner 必须等于 fromWindow（并发保护）、toWindow ≠ fromWindow、不得产出空 owner（INV-1）；席位与 sourceSessionId 必须同指一窗（INV-2）。幂等：三处都已对 → 返回 changed=false，不新增评论。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T07:51:20.530Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

t2 收口在即：交接写成为唯一写入口，席位与绑定不再可能各说各话。

### 完成项

- 交接写原子化落地（席位 + 绑定 + 留痕一次完成）
- tests/handoff-owner.test.ts 覆盖正常/物化/幂等/不变量/半截交接
- 与 binding-trace 静态断言兼容（直写仍只在该文件）

### 改动文件

- `src/application/internal/binding-write.ts`
- `tests/handoff-owner.test.ts`

### 下一步

子卡链四段收尾后父卡收口

---
