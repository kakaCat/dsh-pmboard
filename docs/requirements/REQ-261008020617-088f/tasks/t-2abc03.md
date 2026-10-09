# t-2abc03 两处绝对路径判定收口到纯函数与宿主端口·复核

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
两处绝对路径判定收口到纯函数与宿主端口·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261008020617-088f/design/` 逐条核对；`npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts tests/layer-boundary.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T18:45:44.606Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

复核段完成：INV-5 四条均有断言，结论「无偏离」；端口新增 existsAbs 已登记待 t9 同步文档。

### 完成项

- 对照 INV-5 四条：非绝对 → undefined/同码、目录不存在 → 同码同文案、host 哨兵 → process.cwd()、session 哨兵 → sessionCwd —— 全部有断言在场
- 对照设计『接口与数据契约变更』：两处签名增 host 形参、调用点传 deps.hostFs —— 一致
- 一处**有意扩展**已如实登记：HostFsPort 增第 7 个方法 existsAbs（为保住 create 侧两句文案的区分），设计文档的端口清单需在 t9 同步
- 结论：无偏离（依据：新增 6 条等价断言 + 31 条既有用例全绿 + 越界 5→1）

### 改动文件

- `src/application/internal/paths.ts`
- `src/application/ports.ts`
- `src/adapters/FileHostFs.ts`

### 下一步

测试段

---
