# t-516ddb 替换 8 处死路径引用并重建 client 产物

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
替换 8 处死路径引用并重建 client 产物

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：fullstack

## 得到什么结果
1) `grep -rn "agent-dh/docs/architecture/requirement-archive\|docs/standards/tool-development" src` 零命中；2) `pnpm build:client` 退出码 0 且 verify-client 输出 OK（kb C-12）；3) `pnpm test` 无新增红

## 实施方案（implementation）
替换 8 处：src/tools/SubmitTool/prompt.ts:35、src/application/internal/capture-section.ts:161、src/client/views/verification.ts:253-254（2 处，GUI 文案）、src/shared/protocol.ts:983（注释）、src/domain/artifact/ArtifactSpec.ts:58,75（注释）的 agent-dh/docs/architecture/requirement-archive.md → docs/architecture/archived-entry.md；src/domain/errors.ts:10 删「见 docs/standards/tool-development.md」路径引用保留约定描述。功能性 agent-dh 路径归一正则（support.ts/conflict-check.ts/ArtifactPath.ts）不动。改完跑 pnpm build:client 验证 GUI 产物

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T13:16:29.974Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

t1 完成：8 处死路径替换 + client 重建 + 断言同步；三条验收判据全部通过（零新增红经 A/B 证明）

### 完成项

- G1 文案面全部落地：8 处死路径引用改指 docs/architecture/archived-entry.md（SubmitTool/prompt.ts、capture-section.ts、client/views/verification.ts 2 处、protocol.ts、ArtifactSpec.ts 2 处、errors.ts 注释）
- client 产物按 kb C-12 重建：pnpm build:client exit 0，verify-client OK
- 测试同步：tests/client-view.test.ts 断言改为新路径
- 验收判据 1：grep 死路径零命中；判据 2：build:client OK；判据 3：全量 vitest A/B 失败集合完全相同（69=69，diff 为空）——无新增红
- 子卡链：研发 t-c702ff done + 复核 t-55c3e1 done（复核结论「无偏离」）

### 改动文件

- `src/tools/SubmitTool/prompt.ts`
- `src/application/internal/capture-section.ts`
- `src/client/views/verification.ts`
- `src/shared/protocol.ts`
- `src/domain/artifact/ArtifactSpec.ts`
- `src/domain/errors.ts`
- `tests/client-view.test.ts`

### 下一步

t2 探针扩面并挂 prompts:check

---
