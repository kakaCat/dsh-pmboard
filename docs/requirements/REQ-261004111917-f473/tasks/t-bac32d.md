# t-bac32d 客户端深链消费：清 hash → 定位 → 切面板

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
客户端深链消费：清 hash → 定位 → 切面板

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/deep-link.test.ts → 全绿，逐条含：解析六态表（design/interfaces.md §解析规则 逐行）；调用序列 clearHash→requestFocus→selectPanel；selectPanel 前 2 次抛第 3 次成功 → 'focused' 且 selectPanel 恰 3 次、clearFocus 0 次；恒抛(maxAttempts=3) → 'failed' 且 clearFocus 1 次且 peekBoardFocus() 为 undefined；'#other' → clearHash/requestFocus/clearFocus/selectPanel 调用次数全 0。（可证伪：删 clearHash → 序列断言红；把 requestFocus 挪到 selectPanel 之后 → 顺序断言红）

## 实施方案（implementation）
新增 src/client/deep-link.ts：parsePmboardDeepLink（ignored/ok/malformed 三态；前缀必须恰好 #pmboard，其后只能串尾或 ?；req 取首、URLSearchParams 解码 + trim；形状 ^REQ-）+ consumePmboardDeepLink(hash, ports, {maxAttempts})（固定时序：clearHash → requestFocus → selectPanel 有界重试（defer 可注入，缺省 setTimeout 16ms）→ 重试耗尽 clearFocus + log；全程 try/catch，绝不向 apply 抛出）。改 src/client/index.ts：注册页面之后调一次消费，端口注入 getPageLayout()、requestBoardFocus/clearBoardFocus、clearHash（history.replaceState + try/catch 回落 location.hash=''）、console。新增 tests/deep-link.test.ts。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T03:43:02.596Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

这张卡做完：点旧深链后页面会自己把需求号从片段里读出来、切到看板并把定位交给看板；面板还没注册时按帧重试到约 0.6 秒，失败只留一条诊断、不残留粘滞状态、不误清别的动线意图。

### 完成项

- 研发段 t-f94b67：deep-link.ts 纯解析 + 注入端口消费（清 hash → 登记定位 → 有界重试切面板），client apply 尾部接线
- 复核段 t-61de2a：独立子代理只读复核，6 条跟进项全处置（重试预算 144ms→640ms、I-8 整体纳入 try、req= 空值口径向文档多数收口、layout 未注入前置短路、失败只清自己登记的意图、maxAttempts 边界入 JSDoc）
- 测试段 t-6742c5：全量 97 failed（与开工基线完全一致，新增失败 0）、本卡文件零 error TS、pnpm build:client 通过 [verify-client] OK
- 用例护栏 21 条（含解析六态、时序不变量、重试与兜底、缺省预算下界、ports=null 不 reject）与 3 组反向演练
- 本卡交付边界已写明：只覆盖「冷启动、面板尚未挂载」顺序；「人已站在看板上即时定位」归 t3 订阅通道 + t5 端到端

### 改动文件

- `src/client/deep-link.ts`
- `src/client/index.ts`
- `tests/deep-link.test.ts`

### 下一步

后续卡：t3（订阅通道，覆盖已挂载看板路径）、t4（工具 schema 文案 + 兼容回归）、t5（构建 + 真机端到端）。

---
