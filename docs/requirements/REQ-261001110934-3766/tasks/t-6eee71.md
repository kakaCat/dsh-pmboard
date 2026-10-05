# t-6eee71 加 HTTP 路由 GET /dashboard/api/reqboard/kb·复核

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
加 HTTP 路由 GET /dashboard/api/reqboard/kb·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/kb-route.test.ts → 6 passed；且 GET /state 仍返回 200（既有路由抽样）

## 汇报 1（2026-10-01T05:18:46.828Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

复核确认：看板的「列全部」用显式参数实现，工具侧契约没有被顺手放宽；状态码仍只有一个映射点。

### 完成项

- 复核 1（已改）：看板需要「列全部」但不能放宽工具契约 → 新增显式 list 参数，仅路由在无选择器时置位
- 复核 2（确认）：参数仍走 use case 同一套校验（不新造状态码）
- 复核 3（确认）：pages[] 由 DocRepository 实读行数，未装配 docs 时为空数组
- 复核 4（确认）：既有路由抽样仍 200（/state）

### 改动文件

- `src/http/routers/knowledge.ts`

### 下一步

测试：路由用例

---
