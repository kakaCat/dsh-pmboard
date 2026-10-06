# t-a5be8d 服务端契约：verify 端点 + 对话分页游标·复核

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
服务端契约：verify 端点 + 对话分页游标·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T08:25:06.538Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

复核完成：对抗性审查发现 P1×1（取根候选序）+P2×4；P1 与 P2-3 已修并补回归测试，P2-2 已勘正文档，P2-1/P2-4 登记为验收遗留。修复后 28/28 绿、tsc 零错。

### 完成项

- 对照 design/interfaces.md 逐条核对：六段契约逐字一致、pendingCount 单点同值、RTM 绝不抛、游标语义正确、端点同模式、测试 T-20/21/22 对应、不改表不改 schema 成立
- 复核发现 1 条 P1 已返工修复：QueryVerify 取根改 req.workspaceRoot 优先（跨工作区查看静默缺 RTM），补回归测试 1 例
- P2-3 顺手修复：materials 的 summary/evidence 加坏台账防护（TypeError→500 路径堵上）
- P2-2 文档勘正：interfaces.md 对话 page 改必填并注明兼容由客户端 pageKnown 承担
- 修复后 npx vitest run tests/query-verify tests/query-dialogue 28/28 全绿；tsc --noEmit 零错

### 改动文件

- `src/application/query/QueryVerify.ts`
- `tests/query-verify.test.ts`
- `docs/requirements/REQ-261006130057-7a43/design/interfaces.md`

### 下一步

测试子卡：全量回归；遗留项进验收单——P2-1 同毫秒页边界丢失（设计裁定时间戳游标）、P2-4 前后端拆包时游标语义切换警觉

---
