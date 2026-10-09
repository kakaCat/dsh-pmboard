# t-5e8f8e 注册表一致性硬门 tests/error-code-registry.test.ts

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
注册表一致性硬门 tests/error-code-registry.test.ts

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
pnpm vitest run tests/error-code-registry.test.ts 退出码 0；负例钻 N1（删条目）/N2（塞死码）/N4（塞 REQBOARD_XXX）各红并点名，输出记录进卡汇报

## 实施方案（implementation）
新建 tests/error-code-registry.test.ts；tests/helpers/error-code-scan.ts 仅追加导出 isPromptFile（一行，扫描逻辑不动）；只 import scanErrorCodes/NOISE_TOKENS，不复制正则

## 上游产出摘要（dependsSummary）
- 建错误码注册表常量模块 error-code-registry.ts

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T15:52:50.699Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t2 完成：注册表双向硬门 11/11 绿，N1/N2/N4 三条负例钻均按预期报红并点名

### 完成项

- IF-2 硬门落地：tests/error-code-registry.test.ts 11 项（双向一致 / 条目形态 / 占位噪声 / client 无回流）
- 判据：pnpm vitest run tests/error-code-registry.test.ts → 11/11 退出码 0
- 负例钻 N1（删 REQBOARD_NO_BOUND_REQ）→ 3 红并点名；N2（塞死码）→ 2 红点名死条目；N4（塞 REQBOARD_XXX）→ 5 红点名占位；还原后 11 绿
- 三张子卡（研发/复核/测试）全部完成

### 改动文件

- `tests/error-code-registry.test.ts`
- `tests/helpers/error-code-scan.ts`

### 下一步

t3 prompt 列码校验（并行线）

---
