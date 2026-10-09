# t-93c7cf 收口验收：全量读数与基线集合差

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
收口验收：全量读数与基线集合差

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
pnpm test 的失败清单里不含本需求 28 文件且剩余红逐条有归属；pnpm kb:check 与 pnpm typecheck 退出码均为 0；npx tsx scripts/test-baseline.mts --check 输出差集为空并 exit 0，docs/reviews/test-baseline.md 刷新历史表新增一行、理由非空。

## 实施方案（implementation）
收口四步：① 逐文件 npx vitest run 本需求 28 个文件 → 全绿；② pnpm test → 28 文件不再出现，剩余红逐条归属（另案 7 文件 / 11 用例 + B 类 5 文件 / 10 用例）；③ pnpm kb:check 与 pnpm typecheck → 均 exit 0；④ npx tsx scripts/test-baseline.mts --refresh 后 --check → 差集为空 exit 0，刷新历史表新增一行且理由非空，逐条解释 11 条「新增失败」与 11 条「不再失败」的归属。

## 上游产出摘要（dependsSummary）
- 补齐门禁与文档质量类测试夹具
- 把人工门放行断言改走人路径
- 跟进文案、徽章与地址段断言
- 跟进回执字段与状态推进读数
- 跟进拆分落库路径与卡回执断言
- 补齐会话驱动组装的必填依赖夹具
- 跟进投递面与告警写入断言
- 跟进夹具细节与 ID 形态断言
- 修好缺宿主包与探针锚点两处环境问题
- 重生成知识层并更新两条基线断言
- 清理打包树里的 Python 字节码产物
- 落定逐文件定性台账与另案点名清单

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:32:03.180Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

收口验收：全量红从 37 文件 / 67 用例收到 12 文件 / 21 用例，逐条有归属；两项未达成待裁决。

### 完成项

- 父卡收尾汇报：三段子卡（验证脚本/复核/验证）全部完成
- 收口读数：pnpm test 由 37 文件 / 67 用例降到 12 文件 / 21 用例；剩下的 21 条 = 另案 11 + B 类 10，逐条有归属
- 13 张卡全部收口：25 个目标文件全绿，3 个文件只剩另案臂（卡面既定）
- 两项未达成如实报出待裁决：① pnpm kb:check exit 1（K1/K3/K14 三条改前即红、授权外）② 基线集合差为空（机械 refresh 破坏分诊不变量，已按仓规回滚；另有 2 条顺序相关 flaky）
- 另案新增一条：src/index.ts:567 漏传 store ⇒ NODE_ISOLATION 真实链路静默失败（t9 发现，未改 src）

### 改动文件

- `docs/reviews/test-baseline.md`
- `docs/reviews/test-baseline.failures.txt`

---
