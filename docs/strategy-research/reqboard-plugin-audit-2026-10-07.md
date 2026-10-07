# reqboard 插件工具面体检（2026-10-07 · REQ-261007165643-4275 沉淀）

> 全文证据版：[REQ-261007165643-4275/design/research-report.md](../requirements/REQ-261007165643-4275/design/research-report.md)。
> 本篇只留**长期有效的结论与待裁决项**，供后续整治需求立项时引用。

## 一句话结论

插件主流程健康（状态机主表无缺边、幂等扎实、失败隔离到位）；
问题集中在**边界路径与工具面治理**。

## 高危问题（建议按序立项）

| # | 问题 | 位置 |
|---|------|------|
| H1 | 人工门否定作答无反馈 → 返回体含 undefined，触发宿主 lossless-JSON 硬错误 | src/application/use-cases/AskConfirm.ts:449 |
| H2 | HTTP 路由 actor 自报无鉴权，本地任意进程可 curl 绕过人工门；看板可推子卡进非法态 | src/http/routers/tasks.ts:118、requirements.ts:148,587 |
| H3 | 跨进程写无锁（lost update / 分片日志误收编 / 双链并跑）——需先裁决单进程假设 | src/repositories/QueueTaskStore.ts:335、ShardedRequirementWriter.ts:285-303,414 |

中低危清单（M1~M6 / L1~L7）见全文报告 §2.2、§2.3。

## 工具面治理结论

- 注册工具 27 个；**可精简至 21（保守）/ 19（激进）**：删弃用别名 task_execute、confirm_receipt 并入 ask_confirm、
  四查询面并为二、五个修缮工具合一。
- 27 个工具描述合计 21,588 字符/轮常驻；reqboard_submit 一家占 27%（5,881）。
- 136 个大写错误码散落 123 个文件、无注册表；双拼字段 3 对集中在 submit 的 tasks[]。
- 文案漂移：立项问数六处不一致、7 处死路径引用（agent-dh 旧 monorepo 遗留）、submit prompt「五类」漏 prototype。

## 待裁决项（当时未决）

1. 是否按修复优先级立项整治（H1 一行修先行）；
2. 工具面精简走保守档还是激进档；
3. 部署拓扑是否为单进程假设（决定 H3）。
