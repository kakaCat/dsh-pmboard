# t-dfc52f 补豁免四组合断言与逆验证·测试

> 需求：REQ-261006091755-1c9e 拆分覆盖门补豁免：prototype_exempt 生效时跳过 UI 卡原型锚点维

## 在做什么
补豁免四组合断言与逆验证·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T01:42:48.978Z，窗口 session-dd10c7bd-90d5-4256-8036-cbe2c0a49733）

测试段完成：目标 29 项 + 相关 111 项全绿、tsc 0；全量波动经三轮采样证明来自别的窗口的抖动文件

### 完成项

- 目标文件：npx vitest run tests/plan-prototype-anchor-gate.test.ts → 29 passed（含新增 TC-1～TC-10）
- 相关回归四文件 → 111 passed（锚点维 29 + 转移路径 26 + 三门 28 + 适用性 28）
- npx tsc --noEmit → 退出码 0，输出 0 行（错误数 0 = 基线）
- 全量（t2 后）：69 failed / 5850 passed；通过数 5841/5840 → 5850（+9~+10 = 本次新增用例）
- 基线两次采样：68 failed / 5841 passed 与 69 failed / 5840 passed → 本卡落在同一噪声带
- 逐文件比对：三轮全量各自多出一个「新面孔」，且每轮都不同（canceled-legacy-read / header-progress-e2e / settings-init）
- 三个新面孔全部单跑通过（settings-init 17/17、canceled-legacy-read 15/15、header-progress e2e 2/2 通过）
- 结论：本卡（只改测试文件）不可能影响 reqboard/settings-init 一类文件；多窗口工作区里全量的细粒度前后比对不可作为判据，已如实报出
- 本卡验收取更稳的判据：目标与相关用例绿 + tsc 0 + 新增用例数对得上

### 改动文件

- `tests/plan-prototype-anchor-gate.test.ts`

### 下一步

关闭 t2 父卡；进 t3（兼容、回滚与交付基线）

---
