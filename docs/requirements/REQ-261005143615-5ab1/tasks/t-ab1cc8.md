# t-ab1cc8 服务端按需求自身工作区判存在，并给出绝对路径·测试

> 需求：REQ-261005143615-5ab1 详情页文档路径绝对化 + 缺失判据按需求自身工作区

## 在做什么
服务端按需求自身工作区判存在，并给出绝对路径·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T06:48:34.761Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

测试段完成：144 例全绿，四个验收场景各自有用例钉住，类型检查 0 错误。

### 完成项

- npx vitest run tests/query-docs-roots.test.ts tests/query-docs.test.ts tests/query-docs-contract.test.ts tests/docs-panel.test.ts tests/query-report.test.ts tests/query-trunk.test.ts tests/reqboard/board-plan-approve.test.ts → 144 passed / 0 failed
- npx tsc --noEmit → 0 error（退出码 0）
- 四条验收用例各自可辨认：需求根命中、会话根回退、诚实缺失、未判定且无 absPath

### 下一步

t3 客户端渲染卡

---
