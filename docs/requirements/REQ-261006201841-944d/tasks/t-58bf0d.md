# t-58bf0d /state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
/state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
跑 npx vitest run tests/board-archived-origins.test.ts 全绿，逐条断言：① 记录的根等于当前 docs 根 → kind=local；② 根指向另一个临时项目 → kind=elsewhere 且 projectName 等于该根末段名、root 等于该根；③ 记录无 projectId 也无 workspaceRoot → kind=unknown 且不带 root 键；④ responses 的 origins 键数 ≤ 本页 requirements 条数（不下发全量）；⑤ 源码里无新增 startsWith/字符串相等形态的项目判定（静态断言）。

## 实施方案（implementation）
① 改 src/http/routers/stages.ts 的 GET / 处理：在既有 payload 上追加 origins，逐条用 src/application/internal/support.ts 的 rootOfRequirement 与 src/application/internal/project-root.ts 的 sameProjectRoot 派生 kind（禁止在路由里写路径字符串比较）；projectName 取生效根末段名；root 只在解析成功时下发；② 复用同一处判据，不新写项目身份判定；③ 改 src/client/types.ts 给 BoardState 增可选 origins?: Record<string, RequirementOrigin>（类型逐字用 design/interfaces.md I-8）；④ 新建 tests/board-archived-origins.test.ts 覆盖服务端派生三态与「只算本页」。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:10:11.225Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

t8 全卡完成：看板从此知道每条归档「在不在本仓、在哪个项目」，unknown 态不冒充本仓；判据 13/13、/state 回归 20/20。

### 完成项

- 服务端：项目来源三态在 /state 一处派生（local / elsewhere / unknown），只算本页
- 判据复用既有 rootOfRequirement + sameProjectRoot，未新造项目身份判定
- 客户端类型 RequirementOrigin / BoardState.origins? 已就位（t9 消费）
- 四段子卡均已 done 并各带真实证据（判据 13/13、回归 20/20）

### 改动文件

- `src/application/internal/requirement-origins.ts`
- `src/http/routers/stages.ts`
- `src/client/types.ts`
- `tests/board-archived-origins.test.ts`

### 下一步

t9 客户端三态渲染（进行中）

---
