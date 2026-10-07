# t-ef8d4c 归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型）·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:22:19.310Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

研发段完成：归档条按项目来源渲染三态，详情提示块接线，新增选择器恰好 4 条。

### 完成项

- 改 board.ts 的 renderArchivedBar：按 origin 三态渲染 data-src 与来源标注
- origins 缺键或缺整参 → 逐字降级不渲染标注；值域外归一为 unknown
- 改 styles/base.ts：新增选择器恰好 4 条，令牌只用既有，unknown 态用虚线边框不只靠颜色
- elsewhere 缺项目名写「未命名项目」，不编造名字也不当本仓
- 详情两处接线复刻提示块，复用既有分片零新增选择器
- tests/board-archived-origins.test.ts 28 条断言全绿

### 改动文件

- `src/client/views/board.ts`
- `src/client/styles/base.ts`
- `src/client/board-mount.ts`
- `src/client/views/stage-detail.ts`
- `src/client/views/report-tabs.ts`
- `src/client/types.ts`
- `tests/board-archived-origins.test.ts`

### 下一步

联调段：复跑 client 构建与 /state 契约对接

---
