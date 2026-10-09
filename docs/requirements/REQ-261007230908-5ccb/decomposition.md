# 拆分计划（REQ-261007230908-5ccb）

> 体检第 4 批·治理设施 + 收官。依据：requirement.md（FR-1~FR-5、D-1~D-5）+ design/ 六份。
> 批次脉络：t1 注册表先行 → t2/t3/t4/t6 并行生长 → t5 双拼独立线 → t7 收官 → t8 总验收。

## 目标与做法

- **目标**：错误码常量注册表 + 扫描硬门 + prompt 校验 + 双拼归一单源 + §4.3 十项收官对照。
- **做法**：收敛存量 error-code-scan 生态（D-2），注册表为纯数据登记层（不迁移字面量）；
  双拼归一抽 `src/shared/dual-field.ts`，4 处读取点改调用且语义逐字保持（data-model.md 语义表）。

## 接口清单对照（design/interfaces.md IF-1~IF-5 → 卡）

| 接口 id | 形态 | 接收卡 key |
|---------|------|-----------|
| IF-1 注册表模块 | src/shared/error-code-registry.ts | t1 |
| IF-2 注册表硬门 | tests/error-code-registry.test.ts | t2 |
| IF-3 prompt 校验 | tests/prompt-error-codes.test.ts | t3 |
| IF-4 dual-field 模块 | src/shared/dual-field.ts | t5 |
| IF-5 client 映射派生 | src/client/toolviews/shared.ts | t4 |

清单 5 项全有落点，无清单外造卡。

## 任务表

| 计划 key | 标题 | phase | side | 依赖 | 验收 | 工作量 |
|---------|------|-------|------|------|------|--------|
| t1 | 建错误码注册表常量模块 | implement | backend | — | registry 存在；条目数=扫描码数；typecheck 0 | 1 新文件 ~136 条 |
| t2 | 注册表一致性硬门 | test | backend | t1 | error-code-registry.test.ts 绿 + N1/N2/N4 负例钻 | 1 新测试 + helpers 导出一行 |
| t3 | prompt 列码校验 | test | backend | t1 | prompt-error-codes.test.ts 绿 + N3 钻 | 1 新测试 |
| t4 | client 映射改注册表派生 | implement | backend | t1 | build:client OK + T5 断言绿 | 改 1 文件 + T5 |
| t5 | 双拼归一单源化 | implement | backend | — | T6/T7/T8 绿；4 处直连写法归零 | 1 新模块 + 4 处改写 + 1 测试 |
| t6 | G5 补全四工具 prompt 漏码 | implement | backend | t1 | T4 绿；四工具 prompt⇆实现比对表 | 4 个 prompt.ts 文案 |
| t7 | 收官对照表 closure-audit.md | doc | backend | t6 | 十行齐全、去向/核验非空 | 1 文档 |
| t8 | 全量回归与验收材料 | test | backend | t2 t3 t4 t5 t7 | pnpm test 全绿 + typecheck 0 + build:client OK | 跑命令 + 汇总 |

依赖理由（零文件交集边）：t2/t3/t4/t6 ← t1 = 守卫与文案都以注册表常量为事实源，码未收录则校验无从谈起；t7 ← t6 = G5 去向行须按补全后的实落地形态填写；t8 ← 各卡 = 总验收须待全部交付件在场。

## 条款覆盖对照

| FR | 承接卡 |
|----|--------|
| FR-1 注册表单源 | t1、t4、t8 |
| FR-2 扫描硬门 | t2、t8 |
| FR-3 prompt 校验 | t3、t6、t8 |
| FR-4 双拼归一 | t5、t8 |
| FR-5 收官盘点 | t6、t7、t8 |

## 回滚单元

t1+t2、t3、t4、t5、t6、t7 各自独立 commit；t8 无代码改动（只跑验证与汇总）。
