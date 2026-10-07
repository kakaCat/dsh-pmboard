# t-d0fc41 知识层 K13/K14 两项读数 + 两份基线（基线集合差、台账不可达即不判）·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
知识层 K13/K14 两项读数 + 两份基线（基线集合差、台账不可达即不判）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:21:03.295Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

研发段完成：知识层新增 K13/K14 两项读数与两份基线，覆盖度缺口可红出来。

### 完成项

- 改 scripts/kb-probe.mts：新增 K13 归档沉淀覆盖度与 K14 失效条件可判定两项读数
- K13 只取冷侧 archive/<REQ>/archive.json，热侧 requirements/ 只报数不判红
- 判据 = 缺口集合差：新增则红并点名需求 id，基线多出则提示可刷新
- K14 逐条读条目「## 失效条件」节调 isDecidableInvalidation 判定
- 两份基线文件落地：archive-coverage.baseline.txt 与 unverifiable.baseline.txt
- 新建 tests/kb-coverage-probe.test.ts，7 条断言全绿

### 改动文件

- `scripts/kb-probe.mts`
- `docs/knowledge/archive-coverage.baseline.txt`
- `docs/knowledge/unverifiable.baseline.txt`
- `tests/kb-coverage-probe.test.ts`

### 下一步

联调段：复跑读数并与既有 K 项共存核对

---
