# t-be4f48 把「知识库」入口和页面拿掉（含说明书同步）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把「知识库」入口和页面拿掉（含说明书同步）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果

grep -rn "pmboard-knowledge\|KnowledgePanelHost\|KNOWLEDGE_CSS\|registerKnowledgePage" src/ scripts/ tests/ 零命中（exit=1）；pnpm build:client 输出 [verify-client] OK（关键符号齐全、样式归属章在场、CSS 分片完整），且产物 lib/client.js 内 grep -c 'dsh-pm-kb' = 0；npx vitest run tests/client-page-register.test.ts tests/client-page-panel.test.ts tests/client-view.test.ts 全绿。（修订原因：原锚点含 tests/host-panel.test.ts，但本环境未安装 react-dom，该文件在 vitest 加载期即失败——属既有环境缺口，非本次改动，故从锚点移除并如实记录。）

## 实施方案（implementation）
删除 src/client/views/knowledge.ts、src/client/page/register-knowledge.ts、src/client/styles/knowledge.ts、tests/kb-client-page.test.ts、scripts/knowledge-page-probe.mts；修改 src/client/index.ts（删 import 与注册两行）、src/client/styles.ts（删 KNOWLEDGE_CSS import 与拼接项）；同步 docs/architecture/project-manual.md 侧栏插槽表与 README.md 知识层节（补一句自动自举）。保留 /kb 路由、reqboard_kb、KnowledgeRepository。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T10:00:36.455Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，人再也看不到那个多半是空壳的「知识库」页了；而机器读知识的能力原样保留。以后项目缺知识层，是插件自己悄悄补齐，不再需要谁去点一个按钮。

### 完成项

- 知识库入口与页面（含样式、单测、探针）全部下线，源码与产物零残留
- 说明书与 README 同步（侧栏单条入口 + 缺层自动生成说明）
- 保留面（/kb 路由、reqboard_kb、仓储）零改动且测试全绿
- 构建门禁与面板测试通过；一处环境缺口如实记录
- 整卡四段子卡链完成

### 改动文件

- `src/client/index.ts`
- `src/client/styles.ts`
- `docs/architecture/project-manual.md`
- `README.md`
- `docs/requirements/REQ-261004174324-4195/evidence/t5-delete.txt`
- `lib/client.js`

### 下一步

t6：老行为可回退（开关、兼容、基线）验证。

---
