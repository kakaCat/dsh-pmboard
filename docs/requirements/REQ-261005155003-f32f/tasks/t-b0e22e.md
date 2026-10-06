# t-b0e22e 头部拆两行：动作行独占、身份行另起且窗口靠左·测试

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
头部拆两行：动作行独占、身份行另起且窗口靠左·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T14:21:56.590Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

测试段：定向 229 例全绿、全仓失败数与基线持平、探针与客户端构建均通过

### 完成项

- 定向用例：report-shell / report-firstscreen-gaps / report-degrade / dialogue-panel / client-view / board-info-fixes / probe-hard-criteria / marks-surfaces 全绿（229 passed）
- 全仓 npx vitest run：68 failed / 5622 passed / 22 skipped（开工前基线同为 68 failed，未劣化）
- npx tsx scripts/req-report-probe.mts：退出码 0（A1～A13 全过）
- pnpm build:client：[verify-client] OK bundle=629148 bytes，关键符号齐全、样式归属章在场、CSS 分片完整
- npx tsc --noEmit -p tsconfig.json：报错行中无本次改动文件

### 下一步

父卡收尾：三张子卡全 done

---
