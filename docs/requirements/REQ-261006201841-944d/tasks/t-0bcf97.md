# t-0bcf97 INDEX 降权排序：可判定条目在前、unverifiable 沉底（零字符增量）·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
INDEX 降权排序：可判定条目在前、unverifiable 沉底（零字符增量）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:21:52.593Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

研发段完成：索引条目行降权排序落地，可判定条目在前、不可判定沉底。

### 完成项

- 改 src/adapters/KnowledgeRepository.ts：INDEX 条目行按可判定性排序
- 排序键 = 可判定在前、unverifiable 沉底，同档按 id
- 不改索引行文法、不新增节，K2 索引行语法仍绿
- INDEX 字符数零增量（排序不引入新字符）
- 新建 tests/kb-index-rank.test.ts，6 条断言全绿

### 改动文件

- `src/adapters/KnowledgeRepository.ts`
- `tests/kb-index-rank.test.ts`

### 下一步

联调段：复跑 INDEX 相关用例与字符预算读数

---
