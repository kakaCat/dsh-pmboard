# t-a5f37a 回归用例：停手、续跑、反向自检

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回归用例：停手、续跑、反向自检

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/dialog-inflight-stop.test.ts 全部用例绿，且 TC-1/TC-2/TC-3/TC-5/TC-6/TC-7/TC-9 在改动前必红（用例内置反向自检，禁止恒真断言）。

## 实施方案（implementation）
新增 tests/dialog-inflight-stop.test.ts，实现 design/test-cases.md 的 TC-1…TC-9（复用仓库既有 fake 端口写法，零真实 IO；每条注明「修前红 / 修前无此路径」）；TC-4 为反向自检：无在途时投递次数与派卡结果与基线逐字一致。

## 上游产出摘要（dependsSummary）
- 回合投递先问「有人在等吗」
- 实施链派卡先问「有人在等吗」
- 补齐四条恢复出口与周期对账

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T06:38:49.010Z，窗口 session-0dc94a2a-9c00-455b-ac58-f96624a21da2）

这一步做完：这九种情形（在途停手、作答恢复、无人等待恢复、反向不停）都有人看着了——「弹框在跑、agent 没停」不会再悄悄回来。

### 完成项

- TC-1…TC-9 全部落地并全绿（14 条断言）
- 修前必红有据：把新逻辑置空后，5 条用例转红
- 反向自检：无在途时投递/派卡与基线逐字一致
- 全量失败数不高于基线；改动文件类型错误 0

### 改动文件

- `tests/dialog-inflight-stop.test.ts`

### 下一步

t7：兼容、回滚与端到端核对

---
