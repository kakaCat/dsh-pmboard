# REQ-261001210304-0dfb 运行日志（实施阶段全部命令与输出摘要）

> 记录时间：2026-10-01 · 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 用途：验收材料（`reqboard_submit(kind=verification)`）的可复核证据清单；每条都是**原样可重跑**的命令。

## 0. 改动文件清单（本次需求全部落点）

| 文件 | 增/改 | 内容 |
|------|-------|------|
| `src/client/dag/view-state.ts` | 新增 | 视图状态记忆表（键 `canvasId::需求id`，容量 16 FIFO，纯函数零 DOM） |
| `src/client/views/dag-view.ts` | 改 | `mountDagCanvas` 增 `opts.stateKey`：按记忆回填 initial、同步工具条 `is-on`、恢复滚动、dispose 先写回 |
| `src/client/dag-mount.ts` | 改 | `tryMountDagCanvas` 透传 `opts` |
| `src/client/panel-freshness.ts` | 改 | `freshnessSpan()` 改稳定占位；新增 `hydrateFreshness()` |
| `src/client/node-panel.ts` | 改 | 新增 `relSlot()` / `hydrateRelTimes()`；最近动态·创建时间·已归档改稳定钩子 |
| `src/client/panel-hydrate.ts` | 新增 | `hydrateNodePanel()`（新鲜度 + 相对时间 + 页签恢复） |
| `src/client/conversation-progress.ts` | 改 | 记忆键、补丁 effect、页签写记忆、切需求清理、挂载传 `stateKey` |
| `src/client/board-mount.ts` | 改 | 需求详情挂载传 `stateKey: 'dag-canvas::' + req.id` |
| `tests/dag-view-state.test.ts` | 新增 | A1-1/A1-2/A1-3/A5（12 用例） |
| `tests/panel-hydrate.test.ts` | 新增 | A3-1…A3-3（10 用例） |
| `tests/panel-freshness-render.test.ts` | 改 | 断言迁移 + A2-1/A2-2（12 用例） |
| `docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts` | 改 | 探针期望翻转为「保活」 |

## 1. 复现探针（修前 → 修后翻转）

```bash
npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts
```

修后输出（exit 0）：

```
A-1 用户调过的视图状态       : {"dir":"horizontal","crit":true,"focus":true,"pinned":"t-b"}
A-2 一轮刷新后的视图状态     : {"dir":"horizontal","crit":true,"focus":true,"pinned":"t-b"}
A-3 滚动位置还原             : top=180 left=12
A-4 结论：重建时按记忆回填 initial + 滚动 → 用户的选择保持（已修复）
B-1 两轮 __html 是否逐字节相同 : true
B-2 稳定钩子（新鲜度/相对时间）: fresh-slot=true rel-slot=true
B-3 结论：时间戳不进字符串 → React 不重设 innerHTML → 画布/滚动/页签不会被连累重建（已修复）
```

修前（同一脚本旧版本，本需求立项时的实测）：`A-2 = {"dir":"vertical","crit":false,"focus":false,"pinned":null}`、`B-1 = false`（首个差异点 `data-fetched-at`）。

## 2. 六套必跑用例

```bash
npx vitest run tests/dag-view-state.test.ts tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-refresh.test.ts
```

```
Test Files  6 passed (6)
Tests       102 passed (102)
```

## 3. 全量回归与基线对比

| 时点 | Test Files | Tests |
|------|-----------|-------|
| 开工前基线（t1 收工） | 49 failed / 246 passed / 3 skipped (298) | **98 failed** / 2924 passed / 20 skipped (3042) |
| t3 收工 | 49 failed / 247 passed / 3 skipped (299) | **98 failed** / 2936 passed / 20 skipped (3054) |
| 收尾（本卡） | 见验收材料重跑值 | 失败数 = 98（全部为仓库存量问题，如 RandomIdFactory 的 `REQ-[0-9a-f]{6}` 期望、failure-alert 适配器） |

```bash
npx vitest run --reporter=dot
```

新增通过用例全部来自本需求：`tests/dag-view-state.test.ts`（12）+ `tests/panel-hydrate.test.ts`（10）+ `tests/panel-freshness-render.test.ts` 新增 A2 两条 —— **本需求新增 24 条断言**。

## 4. 类型检查

```bash
npx tsc --noEmit -p tsconfig.json
```

- 本次 8 个改动/新增源文件：**零错误**（按文件名过滤确认为空）。
- 仓库总量：191 条历史错误（非本次引入；工作区含其他窗口未纳入本次范围的改动）。

## 5. 客户端构建

```bash
pnpm build:client
```

```
✔ Build complete in 1340ms
wrapped dsh-pmboard -> lib/client.js 311933 bytes
[verify-client] OK  bundle=333950 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

退出码 0。

## 6. 仍未自动化的一项（人工验证）

`requirement.md` A4（真实刷新节奏下的滚动/页签表现）按设计走**人工浏览器验证**（test-cases.md「人工验证」节给出 5 步）：

1. 打开会话 → 点右上角流程图「实施」节点展开面板；
2. 点「横向」、开「关键路径」、单击某卡钉住、把面板滚到中段；
3. 不做任何操作等 ≥2 个轮询周期（≥12 秒）→ 方向 / 开关 / 钉住 / 滚动位置都应保持；
4. 点「泳道」页签重复第 3 步 → 仍停在泳道；
5. 切换到另一个绑定需求再打开同一节点 → 初始态（不继承上一个需求）。

> 提示：本 GUI 当前加载的是修复前的构建，需在 `pnpm build:client` 之后**刷新页面**才会生效（面板头若出现「插件已更新，点此刷新」即为提示）。
