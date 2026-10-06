# t-e827bd 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
`npx vitest run tests/live-tasks-single-source.test.ts` 全绿；断言：全仓命中集合里**基线之外的新增条目 `=== 0`**（不要求全仓零手写）；`collected` 里每个 (file, symbol) 体零手写比较且含单点调用；每个清单文件被读到且 `status` 命中数 > 0（范围自检）；两个 RTM 入口函数体都含 `liveTasksOf(`。逆验证三条各必红：① 在 `src/application/query/QueryStageDetail.ts` 的 `assemble()` 里插一行 `t.status !== 'canceled'`；② 在 `src/shared/protocol.ts` 的 `readyTasks` 里插一行 `doneIds.has(dep)`；③ 从清单文件删掉一条 `baseline` 条目。`npx vitest run tests/layer-boundary.test.ts` **不作本卡门禁**（其基线本就红，如实记录）。`pnpm typecheck` 退出码 0。

## 实施方案（implementation）
① 新增基线清单 `tests/fixtures/canceled-literal-baseline.json`：形状 `{ "collected": [{file, line}], "baseline": [{file, line, reason}] }`，采集口径 = 全仓（**排除 `tests/`**）命中 `/status\s*(?:!==|===)\s*['\"]canceled['\"]/` 的行；`baseline` = **实施后**实测命中集合**减去**收编点出现过的行（收编点原行原文存进 `collected` ⇒ 「把收编点改回手写」必然落进「新增」分支）；每条 `baseline` 必须带 `reason`，取值 ∈ {req-status, write-side-guard, status-label, definition-site}（缺理由即用例红；需求级 `req.status` 比较属 req-status，不得顺手替换）。② 新增**独立**用例 `tests/live-tasks-single-source.test.ts`（**不挂进既有 `layer-boundary` 用例**——它当前本就红，挂进去等于把新网埋在已知失败里）：a) 全仓命中集合 ⊆ `baseline`（新增即红）；b) 对**收编点清单**逐个断言「该符号体内零手写比较 + 含单点调用」——清单 = 清单文件里的 `collected` 去重后的 (file, symbol)，符号名取自 `design/interfaces.md` §4.1/§8 与 `design/backend.md` §断言域文件清单；c) 范围自检（防假绿）：清单每个文件必须读到内容、且该文件 `status` 字样命中数 > 0（路径写错即红）；d) 两个 RTM 入口函数体都含 `liveTasksOf(`、V-5 体内含 `isDependencySatisfied(`；e) `liveCountOf(t) === liveTasksOf(t).length`。验证：`npx vitest run tests/live-tasks-single-source.test.ts`。依据 design/interfaces.md §8 与 architecture.md §防漂移设计。

## 上游产出摘要（dependsSummary）
- 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）
- 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）
- 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T17:20:12.171Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

t9 收口：判据漂移从此有网——新增手写点即红、删掉基线条目也即红，且退化路径（不含 canceled 字样）同样被拦。

### 完成项

- 手写字面量基线：39 条 / 25 文件 + 18 个收编点，reason 四类齐全
- 断言双向：新增即红 + 删条目即红（卡面单向会让逆验证永远绿）
- 堵住不含 canceled 字面量的退化：四处就绪实现禁 .has( 与禁 done 比较
- 不挂进本就红的 layer-boundary，自带范围自检防假绿
- 三条逆验证各自必红、逐字节还原；两处偏离已获裁定通过

### 改动文件

- `tests/fixtures/canceled-literal-baseline.json`
- `tests/live-tasks-single-source.test.ts`

### 下一步

t11 收口后开 t12/t13

---
