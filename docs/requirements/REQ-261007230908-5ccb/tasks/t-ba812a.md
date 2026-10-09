# t-ba812a 双拼归一单源化 dual-field.ts + 4 处改写·测试

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
双拼归一单源化 dual-field.ts + 4 处改写·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T15:51:06.377Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

测试段：T6 10/10、T7 80/80、T8 残留 0、typecheck 0 错，三条判据全过

### 完成项

- T6：npx vitest run tests/dual-field.test.ts → 10/10 绿
- T7：plan-granularity / plan-doc-table / plan-depends-e2e / plan-footprint → 全绿（5 套件 80 项）
- T8：grep 4 处直连双键写法 → 残留 0（归一到 dual-field 单点）
- pnpm typecheck → 0 错；全仓失败项集中在其他窗口在飞文件（如 plan-mode 的 requirement_status undefined），本卡相关套件零失败

### 下一步

t5 父卡收尾

---
