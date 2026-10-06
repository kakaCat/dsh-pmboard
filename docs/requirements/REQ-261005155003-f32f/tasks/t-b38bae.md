# t-b38bae 操作条文案收敛并真删 DOM 节点（含两处提示文案同步）·测试

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
操作条文案收敛并真删 DOM 节点（含两处提示文案同步）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T14:23:19.458Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

测试段：定向用例全绿、全仓失败数与基线持平、断言按清单同步且无删除

### 完成项

- 定向用例（report-shell / report-firstscreen-gaps / report-degrade）复跑全绿
- 全仓 npx vitest run：68 failed / 5622 passed / 22 skipped，与开工前基线（68 failed）持平，未劣化
- 本卡改动全部命中既有断言的预期变化点：五处断言按卡面清单同步、两条新增断言（aria-describedby 与行尾标）已落 tests/report-shell.test.ts
- 断言只换判据不删除：grid 里不出现分组标签那条原样保留
- pnpm build:client 退出码 0（[verify-client] OK）

### 改动文件

- `tests/report-shell.test.ts`
- `tests/report-firstscreen-gaps.test.ts`

### 下一步

父卡收尾

---
