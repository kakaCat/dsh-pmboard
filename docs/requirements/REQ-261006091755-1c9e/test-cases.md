# 测试用例（REQ-261006091755-1c9e）

> 本文件是**任务 ↔ 用例 ↔ 条款**的追溯标注口（RTM 测试覆盖度门禁只认 `## TC-N:` 标题下的
> `covers:` / `validates:` 标注）。实跑输出见 `tests/test-evidence.md`，设计侧矩阵见 `design/test-cases.md`。

## TC-1: 豁免生效 + 无已登记原型 → 锚点维整维跳过（设计 TC-1、TC-2）

covers: t-6ec9b7, t-620937, t-2c57a8, t-687f7c
validates: FR-1

- 断言要点：只给 requirement.md（无 INDEX / 无 decomposition）也放行；目录里有 `autoDiscovered`
  的骨架（未登记）仍放行——「已登记」才算数。
- 实跑：`npx vitest run tests/plan-prototype-anchor-gate.test.ts` → 29 passed（含本组）。

## TC-2: 豁免未生效 → 照旧拒（设计 TC-3、TC-4、TC-5）

covers: t-78f631, t-12083d
validates: FR-2

- 断言要点：理由为空 → 拒；理由非空但 requirement 产物未落章 → 拒；无 `prototype_exempt` 键 → 拒，
  且 gaps 文案与改动前逐字一致。
- 实跑：同上（同文件内的三条断言）。

## TC-3: 豁免但已登记原型 → 仍须指权威原型（设计 TC-6、TC-7）

covers: t-ed72c5, t-dfc52f
validates: FR-3

- 断言要点：已登记 1 份原型 + 卡无锚点 → 仍拒并点名该卡；补权威路径锚点 → 放行。
- 实跑：同上。

## TC-4: 判据单点与可证伪（设计 TC-10 + 三条逆向验证）

covers: t-63d541, t-a54735, t-ea2670, t-f05596
validates: FR-2, FR-4

- 断言要点：锚点维函数体内只调 `prototypeExemptOf` / `registeredPrototypesOf`，无手写判据；
  三条逆向验证（删前置红 TC-1/2、放宽条件红 TC-6、塞手写判据红 TC-10）与回滚演练（只退源码 → tsc 0；
  整链回滚 → 改动前 19 项）见 `tests/test-evidence.md` 第二、三节。
- 实跑：`npx vitest run tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts`
  → 全绿（未豁免路径零回归）。

## 覆盖度小结

| 任务 id | 覆盖它的用例节 |
|---|---|
| t-6ec9b7, t-620937, t-2c57a8, t-687f7c | TC-1 |
| t-78f631, t-12083d | TC-2 |
| t-ed72c5, t-dfc52f | TC-3 |
| t-63d541, t-a54735, t-ea2670, t-f05596 | TC-4 |

12 / 12 任务有对应测试节（100% ≥ 80% 门禁）。
