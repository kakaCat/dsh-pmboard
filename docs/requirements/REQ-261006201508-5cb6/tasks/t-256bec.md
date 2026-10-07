# t-256bec 新增注册日志派生校验用例

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新增注册日志派生校验用例

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① pnpm vitest run tests/registry-log.test.ts 全绿；② 逆验证：把 src/index.ts 的日志改回字面量 (13) 与 19 个名字 → 该用例红，还原后复绿；③ pnpm typecheck 退出码 0。

## 实施方案（implementation）
新建 tests/registry-log.test.ts：复用 tests/apply-wiring.test.ts 的 stub ctx 与日志捕获手法（该文件的 stubCtx 立即派发 inject、effect 立即执行），执行 apply() 后取注册日志行；正则抽 'agent tools registered (\d+):' 的 N 与 ' / ' 分隔的名单，断言 N === TOOL_REGISTRY.length 且名单集合 == TOOL_REGISTRY.map(e => e.toolName)；日志行不存在时失败并提示「注册日志未打印」，不静默跳过。契约见 design/interfaces.md 第 3 节。

## 上游产出摘要（dependsSummary）
- 让注册日志从登记面派生

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T12:51:59.410Z，窗口 session-be51186a-1e9c-49ba-8c20-144c14c224aa）

t4 完成：装配期注册日志有了会红的守卫——真的跑 apply() 捕获日志行，数字与名单都必须等于登记面，写死即红并点名。

### 完成项

- 新建 tests/registry-log.test.ts（3 条用例）：真的执行 apply() 捕获注册日志行，与登记面对账
- 验收①正向 3 passed；②逆验证改回字面量 (13) → 红且报「日志写 13 个 / 登记面 27 条」并点名 25 个缺失工具；还原逐字节一致后复绿
- 子卡链 3/3 完成：研发（t-12da46）、复核（t-b33784）、测试（t-b6c809）均已汇报并关闭
- 复核段记录一处有意严格化：登记面为空时行形态断言会红（选择响亮失败）
- 跨卡回归：本需求两条新用例 8 passed；工具面既有门禁 apply-wiring 7 / tools-dispatch 4 全绿
- 验收③例外（照实报）：pnpm typecheck 退出码 2——4 处错误全在别人的在制文件，本卡两个文件零错误

### 改动文件

- `tests/registry-log.test.ts`

### 下一步

需求层面交棒：全 4 卡完成 → 提交验收材料 reqboard_submit(kind=verification)

---
