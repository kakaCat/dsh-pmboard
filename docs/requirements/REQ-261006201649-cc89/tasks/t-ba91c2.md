# t-ba91c2 登记两个新错误码的三处身份

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
登记两个新错误码的三处身份

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
跑 npx vitest run tests/prototype-new-codes.test.ts 全绿，且必须含：① statusForCode('prototype_placeholder') === 400 且 ('prototype_geometry_unverified') === 400（不是 500）；② ERROR_CATEGORY 两键都在且值非空；③ MoveRequirement 映射表两键成对（内部码 ↔ 传输码）；④ 两个新码的 message 命中 GATE_HOW_ANCHOR 正则；⑤ pnpm build:client 打印 [verify-client] OK。

## 实施方案（implementation）
在 src/http/envelope.ts 的 STATUS_BY_CODE 登记 prototype_placeholder: 400 与 prototype_geometry_unverified: 400（逐条显式登记，无前缀兜底；漏登记会落 500）；在 src/client/toolviews/shared.ts 的 ERROR_CATEGORY 加两键（原型仍是空骨架 / 几何量读数无法复核）；在 src/application/use-cases/MoveRequirement.ts 的会话侧映射表加 REQBOARD_PROTOTYPE_PLACEHOLDER 与 REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED（内部码与传输码成对登记）。新建 tests/prototype-new-codes.test.ts。

## 上游产出摘要（dependsSummary）
- 把非骨架判据接进锚点门并在它之后接几何量证据校验

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:20:52.717Z，窗口 session-786f4cb7-43b2-4437-a439-d6d32b700eed）

t5 收尾：两个新错误码三处身份登记完成，13 条新用例 + 既有 60 条契约用例全绿。

### 完成项

- 两个新码三处身份齐：HTTP 400、中文类别名、会话侧传输码
- 状态断言走真实 fail 路径读真状态码，非读映射表
- 信封锚点由真实门产出文案验证，非手写
- 十三个新用例全绿；既有信封与输出契约 60 条全绿
- client 构建新鲜（verify-client OK），改了 client 源码已重建

### 改动文件

- `src/http/envelope.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/client/toolviews/shared.ts`
- `tests/prototype-new-codes.test.ts`

### 下一步

t5 收尾完成；最后一张卡 t6 契约文档

---
