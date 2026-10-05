# t-cd9ea3 跑回归收口（新用例 + 类型检查 + 重建 bundle + 基线比对）·研发

> 需求：REQ-261004195831-0f52 修复看板需求详情页打不开（/state 改摘要后详情未按需取全文）

## 在做什么
跑回归收口（新用例 + 类型检查 + 重建 bundle + 基线比对）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T12:35:11.785Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

研发段完成：重试路径有用例钉住（失败可恢复、连点不叠请求），并把本轮全部可复核证据集中到一份证据文件里。

### 完成项

- TC-7 retry 用例：失败后 retry 强制取数、在途连点不叠加请求（已随 store 分组落地）
- 证据文件落盘：docs/requirements/REQ-261004195831-0f52/evidence/verification.md（命令 + 输出摘要 + 变异表 + 独立复核结论 + 手工验收清单 + 残余风险）
- npx vitest run tests/req-detail-ondemand.test.ts → 35 passed

### 改动文件

- `tests/req-detail-ondemand.test.ts`
- `docs/requirements/REQ-261004195831-0f52/evidence/verification.md`

### 下一步

复核段（t-d0920b）

---
