# t-5fd2f8 四实现同形与载荷上界断言

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
四实现同形与载荷上界断言

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
两条命令全绿：pnpm vitest run tests/reqboard/store-contract.test.ts tests/state-payload-client.test.ts；人为让一条实现漏装配读数 ⇒ 同形断言必红（逆验证取证）。

## 实施方案（implementation）
改 tests/reqboard/store-contract.test.ts 加「门读数同形」断言（InMemory / 分片 / SQLite / 假 SQL 只读四条实现对含多份 design 产物的同一需求逐字段相等）；改 tests/state-payload-client.test.ts 断言 gates.length ≤ 5 且与 BIG_FIELD_KEYS 无交集。

## 上游产出摘要（dependsSummary）
- 分片读侧接线（含存在性探针）
- SQLite 与两条测试辅助接线

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:45:52.850Z，窗口 session-5678dda2-4511-465c-bae1-0b321cd1c0fc）

t5 完成：四条实现的读数同形断言 + 载荷有界断言落地；同形断言当场抓出 t4 漏扫的一处实现（已修），逆验证③证明它确有证伪力。129 条用例全绿。

### 完成项

- store-contract.test.ts 新增「门读数同形」两节：逐实现与期望字面量比对 + 四实现读数彼此相等
- 夹具覆盖三种判定形态（已落章 / 成组确认待确认 / 缺失）与两枚读数（planState approved、archivePrepared true）
- state-payload-client.test.ts 新增载荷断言：gates ≤ 5、三态值域合法、count 为整数、六个大字段键一个不出现
- 同形断言当场抓出真问题：store-contract 内自带的假 SQL 替身仍直调 summarize（t4 那轮漏扫这个文件）——已改走 boardSummaryOfAuthoritative
- 逆验证③：把该替身退回直调 summarize ⇒ 同形断言 2 条红；复原后 120 passed 且文件逐字节一致
- 命令证据：vitest run tests/reqboard/store-contract.test.ts tests/state-payload-client.test.ts → 129 passed
- 取证落盘：evidence/inverse-verification.md 追加「逆验证 ③」一节

### 改动文件

- `tests/reqboard/store-contract.test.ts`
- `tests/state-payload-client.test.ts`
- `docs/requirements/REQ-261006175040-12d4/evidence/inverse-verification.md`

### 下一步

t9：E2E 出图脚本与三态证据

---
