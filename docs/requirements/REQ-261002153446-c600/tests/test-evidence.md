# REQ-261002153446-c600 测试证据

> 场景：看板窗口/会话 chip 指向已归档会话时，点击 = 先取消归档、再打开；失败响亮给原因。
> 改动文件：src/client/session-jump.ts、src/client/render/dom-utils.ts、src/client/board-mount.ts
> 测试文件：tests/session-jump.test.ts、tests/board-info-fixes.test.ts

## E1 · 目标用例（t1/t2 验收口径）

```
$ npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts

 ✓ tests/session-jump.test.ts  (11 tests) 10ms
 ✓ tests/board-info-fixes.test.ts  (18 tests) 8ms

 Test Files  2 passed (2)
      Tests  29 passed (29)
```

新增/重写用例（可证伪点）：

| 用例 | 断言 | 结果 |
|---|---|---|
| 已归档会话：先 unarchiveSession 再收面板开会话 | 时间线 = `['unarchive:s-arch','selectPanel:null','openSession:s-arch']`，返回 `opened` | ✅ |
| 取消归档抛错 | 返回 `restore-failed`，时间线 = `['unarchive:s-arch']`（**无** openSession） | ✅ |
| archived 且客户端无该能力 | 返回 `archived`，时间线为空（旧语义保留） | ✅ |
| 未归档会话零副作用 | 时间线 = `['selectPanel:null','openSession:s-target']`（**无** unarchive） | ✅ |
| 已归档 chip 文案 | HTML 含 `data-archived="true"`、`is-archived`，title 含「点击取消归档并打开」 | ✅ |
| 结果文案齐备 | `restore-failed` 含「取消归档失败」「未跳转」；`unavailable` 含「暂不可用」 | ✅ |

**既有基线红一并收口**：`jumpResultMessage('unavailable')` 原先不含「暂不可用」
（HEAD 上 tests/board-info-fixes.test.ts:312 本就红），本次文案对齐后该断言转绿。

## E2 · 客户端面回归（改动可触及的全部用例）

```
$ npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts tests/client-view.test.ts tests/archived-entry.test.ts

 ✓ tests/session-jump.test.ts  (11 tests)
 ✓ tests/archived-entry.test.ts  (14 tests)
 ✓ tests/client-view.test.ts  (52 tests)
 ✓ tests/board-info-fixes.test.ts  (18 tests)

 Test Files  4 passed (4)
      Tests  95 passed (95)
```

## E3 · 全量测试与基线比对（规范 C-14）

```
$ npx vitest run
 Test Files  48 failed | 255 passed | 3 skipped (306)
      Tests  97 failed | 3030 passed | 20 skipped (3147)
```

- 规范 C-14 记录的 HEAD 基线为 **106 failed / 2807 passed**；本次 97 failed，**不高于基线**。
- 失败清单中**没有任何** session-jump / board-info-fixes / dom-utils / board-mount 相关用例：
  `grep -E 'session-jump|board-info-fixes|dom-utils|board-mount' /tmp/vitest-full.txt` 在失败行上零命中。
- 失败集中在 host 侧既有红（gate-handlers、stage-prompts、decompose-tools 等），与本次客户端改动无导入关系。

## E4 · 类型检查（规范 C-15）

```
$ npx tsc --noEmit -p tsconfig.json
error TS 总数：187   （规范记录的 HEAD 基线：223）
grep -E 'session-jump|dom-utils|board-mount|board-info-fixes'  →  0 命中
```

结论：改动文件零类型错误，总数低于基线（无新增错误）。

## E5 · 客户端构建（规范 C-12：改了客户端源码必须重建 bundle）

```
$ npm run build:client
✔ Build complete in 846ms
wrapped dsh-pmboard -> lib/client.js 313753 bytes
[verify-client] OK  bundle=335946 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

## E6 · 手工验收（需刷新页面后执行：客户端 bundle 已重建）

1. 在侧栏归档某个有需求绑定的会话 → 看板该需求的窗口 chip 变灰，title 显示「点击取消归档并打开」。
2. 点击该 chip → 会话恢复（侧栏重新可见）且 GUI 跳到该会话、看板面板收口。
3. 再次归档同一会话 → 行为可重复（幂等、可逆）。
