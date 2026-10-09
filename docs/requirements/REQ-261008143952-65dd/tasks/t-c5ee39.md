# t-c5ee39 重刷 P1 基线快照·测试

> 需求：REQ-261008143952-65dd 更新 vendor superpowers 分片到本地最新版

## 在做什么
重刷 P1 基线快照·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-08T10:45:15.411Z，窗口 session-d7422892-bcde-406a-a95e-3c0868cdd93c）

测试子卡：基线与哨兵两项验收通过；prompt 全系 265 条全绿，tsc 0 错误。

### 完成项

- 验收①：prompt-baseline 15 passed 全绿
- 验收②：逐键比对只有 implementing/heavy 变，哨兵通过
- prompt 全系回归：5 文件 265 passed（tiers/baseline/gates/categories/stage-prompts），旧有 2 条红已全部消除
- npx tsc --noEmit → exit 0，0 错误
- 如实登记：全量 pnpm test 基线未采集，由 t8 承载

### 改动文件

- `tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

t8 全量回归与注入抽检。

---
