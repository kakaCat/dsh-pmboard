# t-ac64a2 服务端按需求自身工作区判存在，并给出绝对路径

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
服务端按需求自身工作区判存在，并给出绝对路径

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/query-docs-roots.test.ts 全绿，四个用例分别钉住：TC-1 需求根命中（absPath 以需求根开头且 file-missing 计数 0）、TC-2 需求根缺、会话根命中（absPath 以会话根开头）、TC-3 根可用而文件不在→file-missing、TC-4 根全不可用→全 unknown 且无 absPath 键。

## 实施方案（implementation）
src/application/query/QueryDocs.ts：取 req 后调 deps.docRootsOf?(req) 建根表（缺省回旧单根），逐条产物按序命中即定 state 与 absPath=repo.resolve(path)；候选非空而全不命中→file-missing，候选为空→unknown；generatedOf / prototypeRolesOf / unregistered 行同根同类判定。src/http/routers/panels.ts：depsForSession 注入两口（候选序=需求根→会话根→cwd，去空去重 + existsSync 过滤；docsAt=new FileDocRepository({workspaceRoot:root})）。新增 tests/query-docs-roots.test.ts 覆盖 TC-1…TC-4（假根 + 假仓储，不碰真盘）。

## 上游产出摘要（dependsSummary）
- 定契约：未判定态与 absPath 加性字段 + 多根读取口

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T06:48:59.055Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

这一步做完，服务端判「文件在不在」不再看是谁在看——先认这条需求自己声明的工作区，命中哪个根就报哪个根的绝对路径；一个可用根都没有时说未判定，文件真不在时才说缺失。

### 完成项

- QueryDocs 多候选根判定落地（命中 / 诚实缺失 / 未判定三分支）
- 生成物、原型权威清单、未登记设计文档行统一走命中根
- panels 路由注入候选根与按根建仓储的工厂
- 新增 tests/query-docs-roots.test.ts 六例；相关用例集 144 例全绿
- tsc --noEmit 0 错误

### 改动文件

- `src/application/query/QueryDocs.ts`
- `src/http/routers/panels.ts`
- `tests/query-docs-roots.test.ts`

### 下一步

t3 客户端渲染：路径格显示绝对路径、未判定不划线

---
