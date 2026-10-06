# t-6bdebe 定契约：未判定态与 absPath 加性字段 + 多根读取口·测试

> 需求：REQ-261005143615-5ab1 详情页文档路径绝对化 + 缺失判据按需求自身工作区

## 在做什么
定契约：未判定态与 absPath 加性字段 + 多根读取口·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T06:44:48.237Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

测试段完成：契约四条用例全绿，两个既有消费方用例集（文档聚合 + 面板渲染共 48 例）全绿，类型检查 0 错误——加性改动没有碰坏旧读法。

### 完成项

- npx vitest run tests/query-docs-contract.test.ts → 4 passed
- npx vitest run tests/query-docs.test.ts → 13 passed
- npx vitest run tests/docs-panel.test.ts → 35 passed
- npx tsc --noEmit → 0 error（退出码 0）

### 下一步

t2 服务端判定卡开工

---
