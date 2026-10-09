# t-f0ad8d 重生成知识层并更新两条基线断言·修复

> 需求：REQ-261008004324-81df reqboard 红测试收口：A 类夹具跟进 + C 类环境基线

## 在做什么
重生成知识层并更新两条基线断言·修复

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/kb-generate.test.ts tests/kb-invalidation.test.ts tests/kb-operations.test.ts` → 转绿（贴命令与输出），且根因单独写明

---
## 汇报 1（2026-10-07T17:18:01.088Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

修复段：两条基线断言改成结构判据 + 集合差，并点名两条新入口。

### 完成项

- kb-invalidation:121-143 断言由「不可判定数 == 分母」改为「分母 ≥ 60 + 双向集合差为空」，两个失败入口各自点名差异条目
- kb-invalidation:34-53 新增 BASELINE_UNDECIDABLE（63 条显式名单）+ 刷新纪律注释；:6-11 模块头口径注记同步为 74/63/11
- kb-operations:51 用例名 12→14；:68-70 点名 report-style-snapshot.mts 与 report-style-ownership.mts；:76 toHaveLength(12)→(14)
- kb-generate 未改（重生成后 diverged 本就为 []）；kb-build --write 幂等空转（五份输出全 skip），本窗未落笔 docs/knowledge

### 改动文件

- `tests/kb-invalidation.test.ts`
- `tests/kb-operations.test.ts`

---
