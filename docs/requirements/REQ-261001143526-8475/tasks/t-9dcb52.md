# t-9dcb52 兼容与预算回归（逐字节 + 失败数基线）·复核

> 需求：REQ-261001143526-8475 技术规范自动沉淀 + 补齐打包/发版工程规范

## 在做什么
兼容与预算回归（逐字节 + 失败数基线）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T07:08:02.563Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

新增指引没挤破轻档预算，也没动 floor 一个字。

### 完成项

- light 档 ≤2500 字符：npx vitest run tests/prompt-tiers.test.ts → 40 passed
- 实现取舍：floor 加不下总纲（只余约 60 字符）→ 改为三阶段各携带一句 ≤60 字符指引，floor 与 HEAD 逐字节一致

### 改动文件

- `src/domain/prompt/fragments/brainstorming/light.md`
- `src/domain/prompt/fragments/design/light.md`
- `src/domain/prompt/fragments/implementing/light.md`

### 下一步

知识层预算核对

---
