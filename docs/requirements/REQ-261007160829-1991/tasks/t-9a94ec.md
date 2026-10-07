# t-9a94ec 契约与文案单点的机械钉死·研发

> 需求：REQ-261007160829-1991 修复：needsHuman 验收项经弹框永远无法通过（多问只渲染第一问）

## 在做什么
契约与文案单点的机械钉死·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/accept-verdict-reason-contract.test.ts tests/accept-result-question-wording.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T09:09:23.192Z，窗口 session-38ae86c9-f5e0-4468-b77d-d9426842eebe）

研发段：契约与文案单点的机械钉死落地（33 用例，生产代码零改动）。

### 完成项

- 新建 tests/accept-verdict-reason-contract.test.ts：10 用例覆盖镜像一致、值域两值、可选性
- 镜像与值域用类型层精确相等断言，并用编译期互赋值函数证明双向可赋值
- 可选性双保险：两个必填清单字面量不含该字段 + 两处声明都带问号
- tests/accept-result-question-wording.test.ts 追加 4 条源码级断言（两处真调用 + 反向禁第二份文案 + 阳性对照）
- 断言前先做非空性自检，防「读空了⇒恒绿」
- pnpm typecheck 退出码 0

### 改动文件

- `tests/accept-verdict-reason-contract.test.ts`
- `tests/accept-result-question-wording.test.ts`

### 下一步

复核段：读测试实现核断言强度。

---
