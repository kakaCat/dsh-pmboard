# t-a296ad prompt 列码校验 tests/prompt-error-codes.test.ts·复核

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
prompt 列码校验 tests/prompt-error-codes.test.ts·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007230908-5ccb/design/` 逐条核对；`npx vitest run tests/prompt-error-codes.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T15:54:53.291Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t3 复核完成：口径单源复用、子集语义符合 D-3，无偏离

### 完成项

- 对照 IF-3：收集面 import helpers 的 isPromptFile（零自定义正则）；形态为 token 级 + 剔模板拼码与 NOISE_TOKENS
- D-3 核对：子集断言不预设清单非空（G5 两种走向下语义都成立）——已写在用例头注释
- 口径修正复核：首版「引号紧贴」口径只命中 1 码（形同虚设），token 级命中 17 码，修正理由留在用例注释
- 结论：无偏离——依据 = IF-3 三项在场 + 单源未破 + 3/3 绿 + N3 钻报红

### 下一步

测试段

---
