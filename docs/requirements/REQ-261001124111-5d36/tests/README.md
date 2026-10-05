# 测试证据索引（REQ-261001124111-5d36）

> 原始输出都在 `../evidence/`；下面每一行都可以照着重跑。

## 1. 本次交付的测试（41 例）

| 文件 | 例数 | 覆盖 | 重跑命令 |
|---|---|---|---|
| `tests/panel-refresh.test.ts` | 11 | 调度器：立即拉 + 周期、`intervalMs=0`、在飞去重、失败不回调 `onData`、成功清错、31 秒转陈旧、`stop()` 作废在飞、无数据即陈旧 | `npx vitest run tests/panel-refresh.test.ts` |
| `tests/panel-freshness-render.test.ts` | 10 | 面板 DOM：19 张卡不出「暂无任务」、`data-fetched-at`、`is-stale`、失败红条（`role=alert`）、版本提示、渲染顺序、缺省零新增元素 | `npx vitest run tests/panel-freshness-render.test.ts` |
| `tests/panel-refresh-wiring.test.ts` | 12 | 策略解析（含 `refreshMs=0`）、戳判定三态、接线不变量（调度器/清空顺序/SSE 只加速/np-reload/组件传参） | `npx vitest run tests/panel-refresh-wiring.test.ts` |
| `tests/panel-build-stamp.test.ts` | 5 | 宿主戳口径自洽、wrap 注入与构建门禁存在 | `npx vitest run tests/panel-build-stamp.test.ts` |
| `tests/panel-build-frame.test.ts` | 3 | 宿主 `handleEvents` 真写出 `event: build`（含 stamp 与 panel；无策略时不带 panel 键） | `npx vitest run tests/panel-build-frame.test.ts` |

## 2. 回归与门禁

| 项 | 命令 | 结果 | 原始输出 |
|---|---|---|---|
| 全量回归（含本次） | `npx vitest run` | 106 failed / **2787 passed** | `../evidence/t5-full-vitest-with-change.txt` |
| 基线（移出本次 5 个测试文件） | 同上 | 106 failed / **2746 passed** | `../evidence/t5-full-vitest-baseline.txt` |
| 既有面板测试（零改动） | `npx vitest run tests/node-panel.test.ts tests/dag-view.test.ts` | 57 passed | `../evidence/t5-test-stage.txt` |
| 「改坏必红」抽查 | 注释周期轮询后跑 `tests/panel-refresh.test.ts` | 5 例转红；还原 11 绿 | `../evidence/t5-mutation.txt` |
| 构建门禁 | `pnpm build:client` | verify OK（bundle=330378，关键符号齐全） | —— |
| 戳一致性 | 对比 `lib/client.js` 内联戳与 `sha256(lib/client.cjs)[0:12]` | 相等（709cbe7960b0） | `../evidence/t5-stamp.txt` |
| 尺寸门禁 | `npx vitest run tests/size-budget.test.ts` | 本次文件命中 0 | —— |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 全仓 212 条（基线同数）；本次文件 0 条 | —— |
| 数据侧一致性 | `curl -s .../requirements/REQ-261001110934-3766/stages` | 与面板同源（见文件内计数） | `../evidence/t5-stages-count.txt` |

## 3. 未纳入自动化（需人看一次）

① 面板开着时另一窗口落库 → ≤5 秒出现新卡；③ 断网 30 秒 → 红条 + `data-stale="1"`，恢复即消失；
⑤ 改一行客户端源码 + `pnpm build:client` → 已打开页面出现「插件已更新」。判据见 `../verification.md` 的人工复核表。

## 4. 任务卡覆盖（每张卡由哪些测试/命令覆盖）

| 任务卡 | 覆盖测试 / 判据 |
|---|---|
| 刷新调度器（父卡 + 研发 / 复核 / 测试） | `tests/panel-refresh.test.ts`（11 例，假时钟）；变异自证见 `../evidence/t5-mutation.txt` |
| 面板新鲜度渲染（父卡 + 研发 / 复核 / 测试） | `tests/panel-freshness-render.test.ts`（10 例，含顺序断言）+ `tests/node-panel.test.ts`（28 例零改动） |
| 组件接线（父卡 + 研发 / 联调 / 复核 / 测试） | `tests/panel-refresh-wiring.test.ts`（12 例：策略解析 / 戳判定 / 接线不变量）+ `tests/size-budget.test.ts`（本次文件命中 0） |
| 版本戳通道（父卡 + 研发 / 联调 / 复核 / 测试） | `tests/panel-build-stamp.test.ts`（5 例）+ `tests/panel-build-frame.test.ts`（3 例）+ `scripts/verify-client-build.mjs` 门禁 |
| 回归与端到端自检（父卡 + 研发 / 复核 / 测试） | `npx vitest run` 全量比对（`../evidence/t5-full-vitest-*.txt`）+ 既有面板测试 57 例 |
| 文档同步（父卡 + 研发 / 复核） | `grep -n "机制备忘：需求面板的刷新与陈旧可见" docs/architecture/project-manual.md` + 该节 9 个引用路径存在性核对；结论对照 `../reviews/review.md` |

covers: t-e5225f, t-1a818b, t-de821b, t-2fe9ce
covers: t-fd98e6, t-5e5f4d, t-93d485, t-04a842
covers: t-541c1e, t-d3e72c, t-37bcbb, t-ceb311, t-efbcda
covers: t-4eb5fb, t-854cb5, t-8e8682, t-d75737, t-e34adb
covers: t-5db5af, t-34ac12, t-b8656d, t-ba7ad2
covers: t-8396b3, t-196f53, t-faf796
