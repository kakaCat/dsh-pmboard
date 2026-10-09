# t-6f6b9c 把镜像档断言与路径探针口径同步到新事实·测试

> 需求：REQ-261008190515-5212 把 implementing 移出 vendor 镜像并改写自写实施档

## 在做什么
把镜像档断言与路径探针口径同步到新事实·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-08T11:29:56.177Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

测试段：三条验收判据逐条实测通过

### 完成项

- 验收①：npx vitest run tests/kb-prompt-wiring.test.ts 9 passed
- 验收②：grep -c task-start scripts/prompt-path-probe.mts 输出 0（说明注释改指代写法，判据字面成立）
- 验收③：pnpm prompts:check 退出码 0（生成 129 分片一致 + 镜像 OK + 路径探针缺口 0）
- 附带读数：npx vitest run tests/task-card.test.ts 4 passed

### 下一步

父卡收口；t6 重刷 P1 基线

---
## 汇报 2（2026-10-08T11:35:02.724Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

测试段：三条判据实测过；全量 18 失败等于开工前那 18 条（本需求引入 0 条），两处自身缺陷已修并复跑

### 完成项

- 验收①：tests/kb-prompt-wiring.test.ts 9 passed
- 验收②：grep -c task-start scripts/prompt-path-probe.mts = 0
- 验收③：pnpm prompts:check 退出码 0；--specimen 五条判据全过（exitCode 0、whitePasses true、agentSurfaceScanned 60）
- 全量套件：18 failed ≤ 基线 68；tsc 退出码 0、error TS 0 条
- 本轮抓到并修掉两个自身缺陷：删条目时留下空对象 {} 导致白名单遍历抛错；task-card 旧编号字面断言
- 诚实说明：本轮全量跑与 t6 的基线刷新有时间重叠，prompt-baseline 已随之转绿

### 下一步

父卡收口

---
