# t-67da3c 重跑生成器并重刷 P1 基线·测试

> 需求：REQ-261008190515-5212 把 implementing 移出 vendor 镜像并改写自写实施档

## 在做什么
重跑生成器并重刷 P1 基线·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-08T11:35:41.454Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

测试段：四条验收判据逐条实测通过；全量 18 条全为既有失败

### 完成项

- 验收①：node scripts/check-prompt-fragments.mjs 退出码 0
- 验收②：逐键比对 12 键，只有 implementing/heavy 变（23852 → 4656），其余 11 键逐字节相等
- 验收③：npx vitest run tests/prompt-baseline.test.ts 15 passed
- 验收④：pnpm typecheck 通过（tsc 退出码 0、error TS 0 条）
- 全量套件：18 failed ≤ 基线 68，等于开工前那 18 条，本需求引入 0 条

### 下一步

父卡收口；随后提交验收材料

---
