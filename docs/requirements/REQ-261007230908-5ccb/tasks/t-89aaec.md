# t-89aaec client toolviews 映射改从注册表派生

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
client toolviews 映射改从注册表派生

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
pnpm build:client 退出码 0 且 verify-client OK；T5 断言绿（shared.ts 无 REQBOARD_[A-Z] 字面量键）；既有 client 测试绿

## 实施方案（implementation）
改 src/client/toolviews/shared.ts：import 注册表、大写码段改派生、小写码段保留；pnpm build:client 验证

## 上游产出摘要（dependsSummary）
- 建错误码注册表常量模块 error-code-registry.ts

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T15:54:02.755Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t4 完成：client 映射单源派生，三判据全过，bundle 已重建

### 完成项

- IF-5 落地：toolviews/shared.ts 大写码映射从注册表派生，小写码 9 键原样保留
- T5 无回流断言绿；client 面 52/52 绿
- pnpm build:client 退出码 0 + verify-client OK（778062 bytes）
- 四张子卡（研发/联调/复核/测试）全部完成

### 改动文件

- `src/client/toolviews/shared.ts`

### 下一步

t3 prompt 列码校验

---
