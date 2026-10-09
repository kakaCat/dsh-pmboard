# t-a5c4f7 注册表一致性硬门 tests/error-code-registry.test.ts·复核

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
注册表一致性硬门 tests/error-code-registry.test.ts·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007230908-5ccb/design/` 逐条核对；`npx vitest run tests/error-code-registry.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T15:52:33.351Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t2 复核完成：IF-2 五项断言齐备、零复制正则（单源未破），无偏离

### 完成项

- 对照 IF-2 五项断言逐条在场：①扫描⊆注册表 ②注册表⊆扫描 ③条目形态（形态/唯一/有序/message/layer）④NOISE_TOKENS 零交集 ⑤读数打印
- 口径纪律核对：用例零自建正则（grep 无 RE 定义），只 import scanErrorCodes/NOISE_TOKENS/isPromptFile —— 单源未破
- 结论：无偏离——依据 = 五项断言在场 + 无复制正则 + 11/11 绿 + 三负例钻报红

### 下一步

测试段

---
