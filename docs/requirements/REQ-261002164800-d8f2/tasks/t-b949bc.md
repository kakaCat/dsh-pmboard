# t-b949bc 迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归·研发

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T09:30:36.473Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

兼容与回滚都有据：旧数据零迁移可读、回填可 --restore 还原，收口证据落进需求 notes

### 完成项

- 新增 tests/reqboard/legacy-refs-compat.test.ts → 5 passed：旧台账不产生新键、旧队列卡按空处理、新字段可选可被旧读者忽略
- 新增收口证据 docs/requirements/REQ-261002164800-d8f2/notes/t8-baseline-evidence.md（命令 + 实测输出摘要 + 回滚演练三条路径）
- 回滚演练：代码回滚靠字段可选、数据回滚靠 --restore（夹具用例已验证）、门禁回滚单点可逆（plan-refs.ts 一处）
- 本需求新增用例合计 8 个文件 / 56 条（见证据文件表格）

### 改动文件

- `tests/reqboard/legacy-refs-compat.test.ts`
- `docs/requirements/REQ-261002164800-d8f2/notes/t8-baseline-evidence.md`

### 下一步

交复核子卡：对照验收标准与三条工程规范核对

---
