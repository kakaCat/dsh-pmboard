# t-4adaa1 写只读工具 reqboard_kb 与检索用例（预算有闸）·联调

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
写只读工具 reqboard_kb 与检索用例（预算有闸）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx tsx -e 真实数据冒烟（或复跑 evidence 中的冒烟脚本）→ kind=architecture 返回正文且 JSON 长度 ≤1500；budgetChars=300 时 items[0].body 为 undefined

## 汇报 1（2026-10-01T04:48:43.015Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

工具在真实知识层上跑通：四种典型问法（按类、按关键词+紧预算、按符号查机器索引、按 id 取小节）都如预期——紧预算时给指针而不是半截正文。

### 完成项

- 真实数据冒烟（docs/knowledge 真跑）：kind=architecture → 1151 字符正文（总 1388 ≤1500 预算）
- 预算 300 → 只回指针 + truncated=true（不返回碎片正文）
- kind=map query=slugify → 命中机器索引（code-map.symbols.tsv），返回符号与所在文件
- id=kb-tokens-colors → 取出该小节 1992 字符（预算 8000）
- 证据：evidence/t4-tool-smoke.txt

### 改动文件

- `docs/requirements/REQ-261001110934-3766/evidence/t4-tool-smoke.txt`

### 下一步

复核：预算语义与错误路径

---
