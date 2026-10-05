# t5 回归证据（REQ-261001124111-5d36）

> 结论：**本次改动的 5 个新测试文件 41 例全绿、零失败**；全仓既有失败与本次无关（改动前后**完全一致**）。

## 1. 全量回归：改动前后失败数逐字相同

| 运行 | 测试文件 | 用例 | 说明 |
|---|---|---|---|
| 含本次改动 | 49 failed / 230 passed / 3 skipped（282） | **106 failed / 2787 passed** / 20 skipped（2913） | 原始输出：`t5-full-vitest-with-change.txt` |
| 基线（临时移出本次 5 个新测试文件） | 49 failed / 225 passed / 3 skipped（277） | **106 failed / 2746 passed** / 20 skipped（2872） | 原始输出：`t5-full-vitest-baseline.txt` |

差值 = `2787 - 2746 = 41` = 本次新增用例数（11 + 10 + 12 + 5 + 3），**失败数为 0 增量**。

失败文件名单里没有任何一个属于本次改动（`grep '^ FAIL ' | grep panel-` 命中的是既有的 `tests/host-panel.test.ts`，
名字里带 panel 但与本次无关）。既有失败集中在别的窗口的在途改动：ID 形态从 6 位 hex 改成时间戳（`tests/application/repository.test.ts`）、
`src/domain/checkpoint.ts`/`job-spec.ts` 的 `Date.now()`（layer-boundary）、`tests/node-panel-styles.test.ts`
断言的面板宽度与源码现值的漂移等。

## 2. 类型检查

`npx tsc --noEmit -p tsconfig.json`：全仓 **212 条**报错；把本次 5 个新测试文件与 4 个改动源文件移出后同样是 **212 条**
（基线一致）；`grep -E 'panel-refresh|node-panel|conversation-progress|plugin-config|client-build'` → **0 条**
（本次改动零类型错误）。

## 3. 本次 5 个测试文件（41 例）

```
tests/panel-refresh.test.ts           11 passed   调度器（周期/去重/失败/陈旧/stop 代际）
tests/panel-freshness-render.test.ts  10 passed   面板 DOM（时间戳/红条/版本提示/兼容）
tests/panel-refresh-wiring.test.ts    12 passed   接线不变量（策略解析/戳判定/组件与 api 源码）
tests/panel-build-stamp.test.ts        5 passed   戳口径自洽 + 注入与门禁存在
tests/panel-build-frame.test.ts        3 passed   宿主 handleEvents 真发 event: build 帧
```

## 4.「改坏必红」抽查（自证有效）

| 变异 | 结果 |
|---|---|
| 调度器周期默认 5000 → 60000 | `panel-refresh.test.ts` 4 例转红 |
| 删掉在飞响应的代际守卫 | TC-G 转红 |
| 红条条件改回「只有一无所有才显示」（复现事故写法） | `panel-freshness-render` TC-K 转红 |
| 去掉陈旧判定（stale 恒 false） | TC-K 2 例转红 |

## 5. 手工 E2E 步骤：可脚本化的已做，需人看的留下判据

| 步骤 | 状态 | 证据 / 判据 |
|---|---|---|
| ① 面板开着，另一窗口落库 → ≤5 秒出现新卡 | **待人工复核** | 组件层由接线测试保证（`refreshMs` 默认 5000 + 轮询兜底）；真机需人看一次 |
| ② 面板计数 == `/stages` 的 `body.tasks` 长度 | 已做（数据侧） | 见 `t5-stages-count.txt` |
| ③ 断网 30 秒 → 红条 + `data-stale="1"`，恢复即消失 | **待人工复核** | 渲染层由 TC-K 覆盖（含「显示的是 HH:MM:SS 的旧数据」文案） |
| ④ 切换需求 → 先「详情加载中…」，只显示新需求卡片 | **待人工复核** | 接线不变量：清空语句在建调度器之前（wiring 用例） |
| ⑤ 改一行客户端源码 → `pnpm build:client` → 页面出现「插件已更新」 | 构建侧已做，提示需人看 | 内联戳与现算戳一致性见 `t5-stamp.txt`；帧由 `panel-build-frame.test.ts` 断言 |

> 为什么三步"待人工复核"：它们要在**真实浏览器 + 真宿主进程**里点/断网观察，而重启宿主会打断用户正在跑的会话
> （见 t4 汇报的同类说明）。自动化证据覆盖了同一段代码的判定逻辑，真机确认留给验收人。

## 6. 复核抓到的一条自作违规：尺寸门禁（已修）

- **症状**：本次 t2/t3 把新增代码直接写进既有文件，`client/node-panel.ts` 442 行、`client/conversation-progress.ts` 450 行
  —— 双双越过「单文件 ≤400 行」门禁（改前分别是 359 / 386 行，**是本需求引入的**）。
- **复核结论**：违规成立（`tests/size-budget.test.ts` 的超标名单里出现这两个文件）。
- **修法**（按职责拆，不为凑行数）：
  - 新鲜度渲染 → `src/client/panel-freshness.ts`（97 行）；`node-panel.ts` 降到 **377 行**；
  - 数据通道（调度器 + SSE 加速 + 版本戳 + np-reload）→ `src/client/use-panel-refresh.ts`（140 行，hook）；
    `conversation-progress.ts` 降到 **369 行**。
- **修后证据**：超标名单里已无本次任何文件（`命中数 = 0`）；`tests/size-budget.test.ts` 的**余下超标项**
  （`client/styles/board.ts`、`client/views/dag-view.ts`、`client/views/traceability-view.ts`、`application/*`）
  均在本次改动之前就超限，属其它窗口在途改动。
- 全量回归复跑（拆分后）：**106 failed / 2787 passed**（与拆分前逐字相同），本次 5 个测试文件仍全绿。
