# 测试证据 · 收口：三实现契约、规模断言、回归基线与构建（t-07b058 / t-94bddc）

> 覆盖标注：`covers: t-07b058`、`covers: t-9a6a8e`、`covers: t-7be668`、`covers: t-94bddc`

## 一、验收⑥：三实现跑同一份契约

```bash
$ npx vitest run tests/reqboard/store-contract.test.ts
 Test Files  1 passed (1)
      Tests  83 passed (83)        # 改造前 68 条（两实现）；新增只读替身后 +15 条读侧
```

三个实现（`IMPLEMENTATIONS` 三行，同一组 `it` 由 `suites` 驱动）：

| 实现 | 套件 | 说明 |
|---|---|---|
| `InMemoryRequirementStore` | read + write | 内存替身（含故障注入） |
| `ShardedRequirementStore` | read + write | 生产实现的假 fs 版 |
| `FakeSqlReadOnlyStore` | **read** | 本次新增：行表 + 只经端口暴露；写方法一律抛（只读响亮） |

替身的三条纪律（避免与另两实现漂移）：
① 投影一律走 domain 的 `summarize`/`factsOf`；② 游标一律走仓储层同一对 `encodeSummaryCursor`/`decodeSummaryCursor`；
③ 内部行表不直接交出（`get` 返回 `structuredClone`）。注册表自检保留原意，仅对刻意只读的替身加白名单并写明理由。

## 二、验收②：类型面

```bash
$ pnpm typecheck | grep -c 'error TS'
150                               # 验收线 223；开工基线 172
```

## 三、验收③：构建

```bash
$ pnpm build
exit=0
wrapped dsh-pmboard -> lib/client.js 313753 bytes
[verify-client] OK  bundle=335946 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

$ ls -la dist/index.mjs lib/client.js
1312243 Oct  3 18:17 dist/index.mjs
 335946 Oct  3 18:17 lib/client.js     # 两者均为本次构建的新产物
```

## 四、验收④：知识层自检

```bash
$ pnpm kb:check
exit=0
✅ K9 符号表 2040 行 = 源码口径 2040 条
✅ K10 覆盖 8 项全部有条目、四要素齐全、清单零漂移
✅ K11 8 条规范期望可判定、豁免均带基线
kb-probe: 全部通过（11 项检查）
```

## 五、验收⑤：规模断言（≥200 条夹具）

```bash
$ npx vitest run tests/reqboard/store-amplification.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)   # A1：100 与 1000 条需求各追加 1 条评论 → 落盘字节相等
                            # A4：100 与 500 条评论时 record.json 字节相同（±2）且 ≤ 8KB

$ npx vitest run tests/reqboard/state-payload.test.ts
      Tests  7 passed (7)   # A9：35 条（33 归档）载荷为改造前基线的 1/511；
                            #     归档 33 → 200 时每条增量 < 600 字节（不随归档增长）
```

## 六、验收①：回归与基线比对

```bash
$ pnpm test
      Tests  98 failed | 3316 passed | 20 skipped (3434)

$ comm -23 <现在失败集> <HEAD 基线失败集> | wc -l      # 新增
1
```
- 失败数 **98 ≤ 106**（验收线）且 **= 开工基线 98** ✅
- 逐条比对**仍有 1 条新增**：`tests/kb-archive-deposit.test.ts > 同源重复提交幂等`
  —— 冷写守卫 `isColdWriteExempt` 在同源重复提交时未判为"归档收尾"而拒写。
  **不在本需求的改动面**（`ColdWrite.ts` 是 t8 阶段的裁定产物），已定性为生产守卫疑 bug，
  经裁决按专项卡处置 ⇒ 本条的"新增失败为 0"**按范围外已知缺陷结案**，不伪装成达成。

## 七、结论

```
② 150 ≤ 223 ✓   ③ build exit 0 且产物新鲜 ✓   ④ kb:check exit 0 ✓
⑤ A1/A4/A9 规模断言成立 ✓            ⑥ 三实现同断言 83/83 ✓
① 失败数 98 ≤ 106 ✓；『新增失败为 0』被 1 条范围外已知缺陷阻塞（有卡跟踪，如实记录）
```
