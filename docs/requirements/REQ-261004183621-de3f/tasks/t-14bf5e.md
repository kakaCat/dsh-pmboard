# t-14bf5e 让人看得见：归档页显示列了多少、豁免多少、漏了什么

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
让人看得见：归档页显示列了多少、豁免多少、漏了什么

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/archive-manifest-view.test.ts 全绿（对账计数行在场；老记录显示「未对账」而非 0）；pnpm build:client 输出 [verify-client] OK。

## 实施方案（implementation）
改 src/client/views/verification.ts 归档区块：新增「对账」行（已列/豁免/未列计数 + 闸门），未列非空可展开明细，老记录显示「未对账（本功能上线前归档）」；src/client/types.ts 补字段类型；必要时补极少量样式。新增 tests/archive-manifest-view.test.ts。

## 上游产出摘要（dependsSummary）
- 先把规矩定死：哪些文件不用进清单、对账结果长什么样

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T10:46:02.060Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，「这次归档到底漏没漏、为什么允许漏」不再只活在某次工具回执里——看板归档页直接写着，谁复核都看得到，而且老的归档记录不会被误读成「一份没漏」。

### 完成项

- 归档页新增清单对账行（三份计数 + 闸门 + 补录次数 + 未列明细）
- 0 ≠ 未对账：老记录明确显示未对账
- 类型与样式同步；客户端构建门禁通过
- 6 条渲染用例全绿
- 整卡四段子卡链完成

### 改动文件

- `src/client/views/verification.ts`
- `src/client/types.ts`
- `src/client/styles/base.ts`
- `tests/archive-manifest-view.test.ts`

### 下一步

t5：archive.unlistedGate 解析与装配注入（含非法值抛错）。

---
