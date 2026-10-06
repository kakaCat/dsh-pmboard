# t-25ebdf 定契约：未判定态与 absPath 加性字段 + 多根读取口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定契约：未判定态与 absPath 加性字段 + 多根读取口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/query-docs-contract.test.ts 全绿；pnpm typecheck 退出码 0 且错误数不高于基线 223；既有 tests/query-docs*.test.ts 仍全绿（加性未破坏旧形状）。

## 实施方案（implementation）
src/shared/protocol.ts：DocPanelState 加 'unknown'、DocPanelEntry 加可选 absPath、generated[] 加可选 absPath，各带「为什么是加性」注释。src/application/query/contracts.ts：PanelQueryDeps 加可选 docRootsOf?(req) 与 docsAt?(root)，注释写明缺省 = 旧单根行为。新增 tests/query-docs-contract.test.ts 断言枚举含 unknown、两字段可选、两口存在。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T06:44:14.763Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

这一步做完，详情页「文件缺失」这件事有了能表达「判不了」的词：契约层新增了「未判定」态与绝对路径字段，读取口也开好了两扇门（按需求自己的根 / 按根建文档读端口）。页面与台账的口径从这一卡起不再互相矛盾。

### 完成项

- protocol 的文档状态集合新增 unknown，并写明它与 file-missing 的区别
- DocPanelEntry 与 generated 行新增可选 absPath（读时投影、不落库的原因写进注释）
- PanelQueryDeps 新增两个可选口 docRootsOf / docsAt，缺省即旧单根行为
- 客户端状态文案补齐 unknown（未判定）并说明读根不可得
- 新增 tests/query-docs-contract.test.ts 四条契约用例
- 类型检查从 223 个历史错误降到 0（改动文件零错误）
- 既有 tests/query-docs.test.ts 与 tests/docs-panel.test.ts 全绿（加性未破坏旧形状）

### 改动文件

- `src/shared/protocol.ts`
- `src/application/query/contracts.ts`
- `src/client/views/panels/docs.ts`
- `tests/query-docs-contract.test.ts`

### 下一步

t2：服务端按需求自身工作区判存在并给出绝对路径；t3 由此卡的状态文案接续渲染改动

---
