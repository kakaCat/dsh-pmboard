# t-fd24aa 流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts 全绿，逐条含：TC-2a tokenTotal:1234 → model.tokenTotal===1234；TC-2b 不传 → 'tokenTotal' in model === false；TC-2c tokenTotal:0 → 同 2b；TC-2d NaN/Infinity → 同 2b；TC-2e 源码结构断言 conversation-progress.ts 含 .dsh-pm-cprog-token-total 且该元素不在 .dsh-pm-flow 的渲染分支内。另 pnpm typecheck 退出码 0。

## 实施方案（implementation）
src/client/flow-chart-model.ts：FlowChartInput/FlowChartModel 增可选 tokenTotal，落模型规则 typeof === 'number' && Number.isFinite && > 0（否则不落该键）；src/client/conversation-progress.ts：ProgressPayload.requirement 增 tokenTotal?: number，在 .dsh-pm-cprog-inline 内、计数 span 之后、.dsh-pm-flow 之外渲染 span.dsh-pm-token-badge.dsh-pm-cprog-token-total（内含 span.dsh-pm-cprog-token-ico 的 🪙 与 fmtTokens 数字，title 写口径），缺席/0 不渲染；src/client/styles/token.ts 加徽章视觉（复用既有令牌，不造第二套色板）；src/client/styles/board.ts 在既有 @container (max-width: FLOW_TIERS.label) 块内隐藏 .dsh-pm-cprog-token-ico（D 档只留数字）。不动 FLOW_TIERS 数值、不动 .dsh-pm-flow-token 规则、不把徽章接进 Token tab。

## 上游产出摘要（dependsSummary）
- 进度接口补需求累计 token（与节点同源、缺失即不发）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T06:59:16.399Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，会话右上角的流程图在窄窗口也留着一个 token 数字了：计数旁边常显「需求累计 Token」，且它在结构上不受宽度档位影响（档位只收图标不收数字）。

### 完成项

- 客户端把累计 token 落进流程图模型：有值才落，0 / 非有限一律视为「无」（不出现「🪙 0」）
- 徽章渲染在计数旁边、节点流程图之外——结构上就不在宽度档位的管辖范围里，窄窗口也留得住
- 极窄档只收掉 🪙 图标、保留数字，省约 18px，避免把标题行挤破
- 补 6 条用例：四个落模规则（有值/缺席/0/非有限）+ 两条结构守卫（徽章不在节点循环里、样式里没有把它整块藏掉的规则）
- 19 个用例全绿（13 条既有 + 6 条新增）；本需求客户端文件 0 个类型错

### 改动文件

- `src/client/flow-chart-model.ts`
- `src/client/conversation-progress.ts`
- `src/client/styles/token.ts`
- `src/client/styles/board.ts`
- `tests/header-progress-responsive.test.ts`

---
