# t-6acfda 定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema·测试

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T09:04:36.467Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

测试段：本卡 16 条用例全绿；全量与类型检查都低于基线，未引入新增失败

### 完成项

- npx vitest run tests/reqboard/requirement-refs.test.ts → 16 passed
- npx vitest run（全量）→ 97 failed / 3169 passed，低于基线 106
- npx tsc --noEmit → 187 个错误，低于基线 223；本卡改动文件零错误
- 修前必红有据：改动前同一段调用输出里没有 requirement_refs（字段被白名单丢弃）
- 既有失败未落在本卡改动面：输出契约 3 处落在 TaskAdopt / Knowledge / Regenerate，层边界越界清单也未点名本卡文件

### 改动文件

- `tests/reqboard/requirement-refs.test.ts`

### 下一步

父卡收口：四段子卡全部完成，卡 t-9d4dd7 可结单；下一张 ready 卡为 t-90dc24

---
