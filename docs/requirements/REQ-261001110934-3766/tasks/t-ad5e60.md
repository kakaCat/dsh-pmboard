# t-ad5e60 加 HTTP 路由 GET /dashboard/api/reqboard/kb

> serves: FR-5（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加 HTTP 路由 GET /dashboard/api/reqboard/kb

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
curl -s 'http://127.0.0.1:<port>/dashboard/api/reqboard/kb?kind=decision&limit=3' 返回 200 且 items.length<=3、含 pages[]；?budget_chars=0 返回 400 且 error=REQBOARD_INVALID_INPUT；抽样请求既有路由响应体不变。

## 实施方案（implementation）
src/http/routers/knowledge.ts + 组合根注册；参数 query/kind/id/limit/budget_chars；返回与工具同构 JSON 并附 pages[]（4 份页面路径与行数）；非法参数 400 + REQBOARD_INVALID_INPUT；既有路由零改动。

## 上游产出摘要（dependsSummary）
- 写只读工具 reqboard_kb 与检索用例（预算有闸）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T05:22:05.189Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

看板拿到了知识层数据接口：会话里问到的与看板上看到的从此是同一份知识。

### 完成项

- GET /dashboard/api/reqboard/kb 落地（与工具同源、只读）
- 四种请求样例与预期一致；参数非法 400；未装配优雅降级
- 既有路由零改动；6 条路由用例全绿

### 改动文件

- `src/http/routers/knowledge.ts`
- `src/http/routes.ts`
- `tests/kb-route.test.ts`

### 下一步

t6 客户端页收口

---
