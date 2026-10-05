# t-0b1df0 文档读根与会话同源

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文档读根与会话同源

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：fullstack

## 得到什么结果
curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state 的 workspaceRoot 等于会话工作区（不是插件宿主 cwd）；curl -s -X POST .../docs/resolve -d '{"paths":["README.md","docs/knowledge/INDEX.md"]}' 两条均 openable:true；pnpm build:client 退出码 0 且 lib/client.js 含新逻辑；右侧栏打开 README.md 渲染出正文（人工确认）。

## 实施方案（implementation）
服务端：src/index.ts 惰性注入 sessions，把会话工作区解析器（ctx.sessions.get(sessionId)?.header.cwd，冷会话回落 sessionPersistence.stat；见 packages/api/session-controller/src/index.ts:202-220 的 workspaceFileScope 写法）经 src/http/routes.ts 交给路由；改 src/http/routers/artifacts.ts:54 的 workspaceRoot() 不再用 process.cwd()，classify() 的根取「会话根 → 需求根（保留 artifacts.ts:114-126 的既有回退）→ legacy cwd」，并在 /state 返回 sessionWorkspaceRoot 与 docsRootSource。客户端：改 src/client/open-doc.ts:68-77 的 absolutizeDocPath 在无需求段时回落会话根、两者都无则不拼绝对路径并给诊断；src/client/board-mount.ts:302-306 传参补 sessionWorkspaceRoot。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T14:39:56.916Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

父卡收尾：「文档打不开」这件事从代码层解决了——读根换成发起阅读的会话工作区，预检与打开同一个根，客户端也带着会话 id 来。四段子卡都过，零回归。两件需要你出手：重载一次插件让真机生效（我给出两条命令），以及决定那 98 条既有失败怎么处置。

### 完成项

- 四段子卡（研发/联调/复核/测试）全部完成，各自汇报已登记
- 交付物：服务端共享解析器 resolveDocRoot、四条读工作区文件入口改按会话根、/state 下发 sessionWorkspaceRoot 与 docsRootSource、客户端带会话 id 并按同根绝对化、新增 6 例路由集成测试
- 修掉两处真问题：路由 deps 白名单漏转发 sessionWorkspace（会让整条修复静默失效）、三处「只修一半门」的同类读根
- 零回归：类型错误 149 与开工前逐字相同；全量 98 失败与失败集合逐字相同；构建退出码 0

### 改动文件

- `src/http/routers/shared.ts`
- `src/http/routers/artifacts.ts`
- `src/http/routers/stages.ts`
- `src/http/routes.ts`
- `src/index.ts`
- `src/client/api.ts`
- `src/client/open-doc.ts`
- `src/client/board-mount.ts`
- `src/client/types.ts`
- `tests/doc-root-session.test.ts`

### 下一步

剩下两件都要人出手：① 重载 DSH 后跑那两条 curl，我把输出补进验收材料；② 决定既有红基线（typecheck 149 / test 98）怎么处置——另立清理卡，或把 t14 验收改成「相对基线不新增失败」。

---
## 汇报 2（2026-10-03T15:06:56.963Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

你报的那个「文件不存在，可能已被移动或删除」在真机上彻底好了：重启之后，README、知识层索引、交棒底稿三条以前全灭的文档现在都能打开，读全文也通；而且不带会话 id 时仍判不存在——这条对照说明「能开」是换根换来的，不是碰巧。另外你的重启也顺带验证了我另一张卡的交付：reqboard_open_window 已经真的上线可用。

### 完成项

- 真机复验（你重启 DSH 之后，活宿主跑的是新 dist）
- ① /state?session=<本窗口> → workspaceRoot 与 sessionWorkspaceRoot 都是会话工作区 /Users/mac/Documents/ai/dsh/dsh-pmboard，docsRootSource=session（改前是插件宿主目录 ~/.dsh/profiles/desktop）
- ② /docs/resolve（带 sessionId）→ README.md、docs/knowledge/INDEX.md、docs/handoff/multi-window-collaboration-draft.md **三条全部 openable:true**（改前三条全 not_found）
- ③ /file?path=README.md&session=… → success:true，正文首行「# dsh-pmboard」，证明读全文与预检同根
- ④ 对照（不带 sessionId）→ README.md 仍判「文件不存在」——证明「能打开」确实是换根换来的，不是别的什么顺手生效
- ⑤ 顺带确认另一张卡的交付也上线了：本窗口工具清单里已出现 reqboard_open_window（t4 的工具真机可用）

### 下一步

t12 的真机验收闭环。FR-11 在真机上完成，不再是「等重载」。

---
