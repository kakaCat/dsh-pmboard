# t-a429de 文档位置根来源红字徽章

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文档位置根来源红字徽章

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
单测断言：peekLastRootSource() ≠ req-root 时 docLocationHtml 输出含红字「地址可能不准」徽章；= req-root 时不含；`pnpm build:client` OK。

## 实施方案（implementation）
req-doc-location.ts docLocationHtml 读根来源诊断：非 req-root 追加 RootSourceBadge 红字「地址可能不准（根来源：X）」（打开行为不变，只负责不静默）；样式进 styles/files.ts 分片。

## 上游产出摘要（dependsSummary）
- open-doc 根解析诊断

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:21:23.744Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这张卡做完，地址拿不准这件事从「事后翻代码才知道」变成「面板当场红字告诉你根来自哪里」，可信地址则安静不打扰。

### 完成项

- 面板显示的文档地址现在会自证可信度：不是用需求自己的工作区根拼出来的 → 红字「⚠ 地址可能不准（根来源：X）」（X = 需求级根/会话工作区/服务端工作区/无根可回落）
- 来源判定优先用视图自带读数（build 时定死），没有视图时用刚做完的绝对化读数；旧形态视图不加噪音，避免误报
- 打开行为一字未改：仍走现状三级回落，红字只负责不静默
- 证据：tests/doc-root-badge.test.ts 8 例（含卡上判据字面复现 + 反向验证：无条件加红字即红 4 条）；面板相关 71 例全绿；pnpm build:client [verify-client] OK；tsc 0 错

### 改动文件

- `src/client/req-doc-location.ts`
- `src/client/styles/files.ts`
- `tests/doc-root-badge.test.ts`

### 下一步

下一张 ready 卡：t-1ca419 pending 票行组件（t6 投影已就绪）

---
