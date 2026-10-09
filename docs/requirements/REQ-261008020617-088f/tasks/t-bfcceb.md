# t-bfcceb Dive Service 外壳外移到适配层·研发

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
Dive Service 外壳外移到适配层·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts tests/layer-boundary.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T18:49:09.895Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

研发段完成：Dive Service 外移适配层，越界 1→0，application/ 零越界（RF-1 达成）。

### 完成项

- git mv 外移 ReqboardDiveManager.ts → src/adapters/（保留历史），相对 import 全部重算，@module 与理由注释同步
- 类体、Service 名 dive-manager、static inject、订阅分组与失败留痕一字未改
- 验收：dive 两份用例 + apply-wiring 共 23 用例全绿；越界条数 1 → 0（application/ 零越界，RF-1 达成）
- 层门整文件现只剩 tools/http 那条红（边界外，依 D-1），失败用例 8 通过 / 1 失败

### 改动文件

- `src/adapters/ReqboardDiveManager.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `src/index.ts`
- `tests/dive-wake-wiring.test.ts`
- `tests/dive-manager-wiring.test.ts`
- `tests/apply-wiring.test.ts`

### 下一步

联调段

---
