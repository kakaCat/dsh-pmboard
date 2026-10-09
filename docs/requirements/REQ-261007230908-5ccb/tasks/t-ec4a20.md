# t-ec4a20 双拼归一单源化 dual-field.ts + 4 处改写·复核

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
双拼归一单源化 dual-field.ts + 4 处改写·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007230908-5ccb/design/` 逐条核对；`npx vitest run tests/dual-field.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T15:50:54.524Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

复核完成：三字段优先级与后处理归属逐条吻合语义表，IF-4 签名一致，无偏离

### 完成项

- 逐条核对 data-model.md 语义表：skip_integration_reason=camel 优先、granularity_exempt=snake 优先、dep_reasons=dualMapMerged 并集，三处实参与表一致
- 核对后处理归属：slice(0,300) 留在 protocol 调用方、plan-granularity 侧不截断（现状差异按设计保留，未拉齐）
- 对照 IF-4 签名：readDual(o,snake,camel,priority) / dualMapMerged(o,snake,camel,coerce) 与接口文档逐字一致
- 结论：无偏离——依据 = 三处实参核对 + 后处理归属核对 + IF-4 签名一致 + 单测 10/10 绿

### 下一步

测试段：跑 T6/T7/T8 三判据

---
