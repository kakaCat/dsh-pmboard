# t-ddec08 探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记）·测试

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T14:29:41.442Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

测试段：探针全绿、五块面板逐块 PASS、全仓失败数与基线持平

### 完成项

- npx tsx scripts/req-report-probe.mts 退出码 0（A1～A13 全过，A13 五块面板逐块 PASS）
- 全仓 npx vitest run：68 failed / 5622 passed / 22 skipped，与开工前基线持平
- npx tsc --noEmit：报错行中无 scripts/req-report-probe.mts 与 fixture
- grep 判据：sr-only 命中 ≥ 1；退出码语义 0/1/2 未变
- pnpm build:client 退出码 0（[verify-client] OK）

### 改动文件

- `scripts/req-report-probe.mts`
- `scripts/fixtures/req-detail-specimen.mts`

### 下一步

父卡收尾

---
