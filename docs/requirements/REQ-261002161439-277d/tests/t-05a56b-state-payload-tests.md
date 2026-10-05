# 测试证据 · 看板载荷瘦身（t-05a56b / t-ccc9d5）

> 全部命令在仓库根实跑；输出为**实跑摘要**。
> 覆盖标注：`covers: t-05a56b`、`covers: t-cfc576`、`covers: t-dbf951`、`covers: t-79e1d9`、`covers: t-ccc9d5`

## 一、验收①：`npx vitest run tests/reqboard/state-payload.test.ts`

```bash
$ npx vitest run tests/reqboard/state-payload.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

七条用例与验收原文逐条对应：

| 用例 | 验收原文 | 结果 |
|---|---|---|
| A9 载荷体积 | 35 条夹具（33 归档）字节相对改造前基线下降 ≥10× | ✅ **2,768,960 → 5,416 字节 = 511×** |
| A9 不随归档增长 | 归档 33 → 200 时字节不增长 | ✅ 每条增量 < 600 字节 |
| A10 扫描移出 | GET / 触发 0 次、POST /artifacts/scan 触发 1 次 | ✅（模块级 mock 计数器） |
| 键集 | 元素不含 comments/artifacts/verification/plan/archive | ✅ 逐元素断言 |
| 详情 | GET /requirements/<已归档 id> → 200 且含全文 | ✅ 8 条评论 + 6 条产物 |
| 详情未命中 | 不存在 → 404 | ✅ code=`REQBOARD_NOT_FOUND` |
| cursor 边界 | 末页 nextCursor 缺省；越界 cursor 空页不抛 | ✅ 4 页 35 条不重不漏 |

### A9 基线字节的来源（可复核）

```
测法：改造前用同一夹具（35 条、33 归档，评论 8×80 字、产物 6 条）+ 同一 handler
      跑一次 GET /state，量 res 的字节数 ⇒ 2,768,960 字节（≈2.7MB，全部来自 requirements）
存法：作为常量 A9_BASELINE_BYTES 写进 state-payload.test.ts，断言「当前载荷字节 × 10 ≤ 基线」
      （失败信息里直接带三个数：摘要字节 / 基线 / 倍数，便于验收人复核）
口径说明：度量对象是**载荷本体 requirements**（改造前该响应里只有 requirements 是大的），
          故与基线同口径可比；`tasks` 不属于本卡改动面。
```

## 二、客户端验收：首屏渲染 0 次详情请求

```bash
$ npx vitest run tests/state-payload-client.test.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
```
本仓无 DOM 测试环境（无 jsdom/happy-dom），故在 **api 契约层**用 `vi.stubGlobal('fetch', …)` 记录请求集：
首屏 `fetchState()` 恰 1 次请求且命中 `/state`；详情端点（`/requirements/<id>`）命中 **0** 次。

## 三、验收②：回归

```bash
$ pnpm test
      Tests  98 failed | 3301 passed | 20 skipped (3419)
$ npx tsc --noEmit | grep -c 'error TS'
150
```
- 失败 **98 = 开工前基线 98**（不高于基线）✅
- 唯一"新增"仍是**上一张卡遗留**的 `kb-archive-deposit` 冷写守卫（§90/§99 已定性为生产守卫疑 bug），**非本卡引入**
- tsc **150 ≤ 基线 172** ✅

## 四、验收③：构建产物

```bash
$ pnpm build:client
wrapped dsh-pmboard -> lib/client.js 313753 bytes
[verify-client] OK  bundle=335946 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

## 五、相关读点等价性与契约（联调一并复跑）

```bash
$ npx vitest run tests/reqboard/state-payload.test.ts tests/state-payload-client.test.ts \
                 tests/reqboard/store-contract.test.ts tests/t16-http-queue-integration.test.ts \
                 tests/read-sites-equivalence.test.ts tests/token-endpoint.test.ts
 Test Files  6 passed (6)
      Tests  95 passed (95)
```

- `read-sites-equivalence` 的 d 用例：其原主体是「响应逐字节等于台账全文」，本卡按验收**有意改掉**
  ⇒ 改为「响应元素逐字段等于该记录的摘要投影 + 页内 ready 映射」，并**新增**「五个全文键不得出现」断言。
- `token-endpoint`：`tokenTotals` 保留（改为只对本页 id 有界计算）⇒ 原用例原样通过。

## 六、测试证据结论

```
验收① 7/7 ✓   客户端 0 详情请求 2/2 ✓   验收② 98 failed = 基线、tsc 150 ✓   验收③ build verify OK ✓
相关契约与读点等价性 95/95 ✓
唯一新增失败与"客户端类型分层"遗留均已在 reviews/t-05a56b-state-payload-review.md 记录并建议单开卡。
```
