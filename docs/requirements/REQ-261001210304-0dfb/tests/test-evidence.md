# REQ-261001210304-0dfb 测试证据（新增/迁移用例 + 红绿翻转 + 全量回归）

> 全部命令可原样重跑；输出摘要是实测值，不是预期值。

## 1. 本需求新增/迁移的测试文件

| 文件 | 用例数 | 覆盖 |
|------|--------|------|
| `tests/dag-view-state.test.ts`（新） | 12 | 记忆表语义（合并写 / 拷贝隔离 / 滚动值收敛 / 容量 16 FIFO + 读命中刷新插入序 / clear / clearByPrefix）+ **二次挂载回填**（A1-2）+ 工具条 `is-on` 对齐（A1-3）+ 键隔离（A5）+ 兼容（不传 opts 不写表） |
| `tests/panel-hydrate.test.ts`（新） | 10 | A3-1 新鲜度补丁（文本 / `data-fetched-at` / `is-stale` 翻转 / 从未成功 / 幂等不换元素 / 找不到钩子静默）+ A3-2 相对时间（刚刚 / 5 分钟前 / 日期 / relSlot 形状 / 非法值）+ A3-3 页签恢复（tab=list 与不传 tab） |
| `tests/panel-freshness-render.test.ts`（迁移 + 新增） | 12 | 原 TC-I/TC-K/TC-M 断言从「字符串含数据时间」迁移为「含稳定占位、不含时间戳」；**新增 A2-1/A2-2**：两轮仅 `fetchedAt` 差 5000 → `__html` 逐字节相同 + 承载 DAG 片段相同 + 串内无「刚刚/分钟前/时间戳」 |

## 2. 单卡验收命令与结果

| 卡 | 命令 | 结果 |
|----|------|------|
| t1 | `npx vitest run tests/dag-view-state.test.ts` | **9 passed**（当时仅 A1-1/A5） |
| t2 | `npx vitest run tests/dag-view-state.test.ts tests/dag-view.test.ts` | **41 passed**（12 + 29；后者含既有实例表隔离/释放/事件委托，验证"不传 opts 行为不变"） |
| t3 | `npx vitest run tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts tests/node-panel.test.ts tests/card-layer.test.ts tests/stage-colors.test.ts tests/stage-colors-e2e.test.ts` | **76 passed** |
| t4 | `npx vitest run tests/panel-refresh-wiring.test.ts tests/client-view.test.ts tests/node-panel.test.ts tests/card-layer.test.ts tests/stage-colors.test.ts tests/panel-hydrate.test.ts tests/dag-view-state.test.ts` + `tests/header-progress-responsive.test.ts tests/compat-regression.test.ts tests/panel-refresh.test.ts tests/panel-freshness-render.test.ts` | **137 + 43 passed** |
| t5 | 见 §4/§5 | **102 passed / tsc 零新增 / build 绿** |

## 3. 红 → 绿翻转（同一现象的三个观察点）

| 时点 | 观察 | 结果 |
|------|------|------|
| 立项时（**修前**，见 `requirement.md` 证据节） | `npx tsx evidence/probe-dag-reset.mts`（旧版探针） | `A-2 = {"dir":"vertical","crit":false,"focus":false,"pinned":null}`（状态归零）、`B-1 = false`（两轮 `__html` 不同，首个差异点 `data-fetched-at`） |
| t3 收工（**部分修复**） | 同上探针 | `B-1` 断言 `assert.notEqual` **失败** = 两轮字符串已**逐字节相同**（FR-3 达标）；A 段仍复现（记忆尚未接线，属 t4 范围——设计如此） |
| t5 收工（**修复完成**） | 同上探针（期望已翻转为"保活"） | exit 0：`A-2 = {"dir":"horizontal","crit":true,"focus":true,"pinned":"t-b"}`、`A-3 滚动 top=180 left=12`、`B-1 = true` |

## 4. 六套必跑用例（t5）

```bash
npx vitest run tests/dag-view-state.test.ts tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts \
  tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-refresh.test.ts
```

```
Test Files  6 passed (6)
     Tests  102 passed (102)
```

## 5. 全量回归与基线（t5）

| 时点 | Test Files | Tests |
|------|-----------|-------|
| 开工前基线 | 49 failed / 246 passed / 3 skipped | **98 failed** / 2924 passed / 20 skipped |
| t3 收工 | 49 failed / 247 passed / 3 skipped | **98 failed** / 2936 passed / 20 skipped |
| t5 收工 | 49 failed / 247 passed / 3 skipped | **98 failed** / 2936 passed / 20 skipped |

```bash
npx vitest run --reporter=dot
```

- **失败数 98 = 基线 98**：无新增失败；抽样确认全部为仓库存量问题（`RandomIdFactory` 期望 `REQ-[0-9a-f]{6}`、
  `failure-alert` 适配器等），与本需求无关。
- 通过数 +12 来自本需求新增用例（10 hydrate + 2 A2）；`tests/dag-view-state.test.ts` 的 12 条在该轮统计口径中记为新增文件。

## 6. 类型检查与构建（t5）

```bash
npx tsc --noEmit -p tsconfig.json          # 本次 8 个改动/新增文件零错误；仓库 191 条历史错误非本次引入
pnpm build:client                          # 退出码 0
```

```
✔ Build complete in 1340ms
wrapped dsh-pmboard -> lib/client.js 311933 bytes
[verify-client] OK  bundle=333950 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

## 7. 未自动化项（如实标注）

`requirement.md` 的 **A4**（真实刷新节奏下的滚动/页签观感）按 `design/test-cases.md` 的策略走人工验证：
步骤与判定口径见 `evidence/run-log.md` §6。注意：本 GUI 当前加载修复前构建，需 `pnpm build:client` 后刷新页面。

## 8. 任务覆盖对照（`covers:` 标注，供测试覆盖度门禁核对）

每个任务卡的测试落点（父卡与其研发/复核/测试/校验子卡共用同一批用例——子卡是同一张卡的不同阶段，
不新增可执行产物，故落点相同）：

- covers: t-8e8fdc — `tests/dag-view-state.test.ts`（记忆表 12 用例：A1-1/A1-2/A1-3/A5 + 兼容）
- covers: t-f14885 — `tests/dag-view-state.test.ts`（研发子卡：A1-1/A5，记忆表语义）
- covers: t-dde296 — `tests/dag-view-state.test.ts` + `docs/requirements/REQ-261001210304-0dfb/reviews/implementation-review.md`（复核子卡）
- covers: t-9b6948 — `tests/dag-view-state.test.ts`（A1-2/A1-3）+ `tests/dag-view.test.ts`（29 条既有用例验证"不传 opts 行为不变"）
- covers: t-20229c — `tests/dag-view-state.test.ts`（研发子卡：二次挂载回填与工具条对齐）
- covers: t-c1ce4f — `tests/dag-view-state.test.ts` + `tests/dag-view.test.ts`（复核子卡）
- covers: t-6e3dda — `npx vitest run` 全量回归与 tsc 基线比对（测试子卡，见 §5/§6）
- covers: t-21de17 — `tests/panel-hydrate.test.ts` + `tests/panel-freshness-render.test.ts`
- covers: t-918fd6 — `tests/panel-hydrate.test.ts`（研发子卡：补丁函数 10 用例）
- covers: t-adb83e — `docs/requirements/REQ-261001210304-0dfb/reviews/implementation-review.md`（复核子卡：静态复核 + 探针翻转）
- covers: t-118a86 — `npx vitest run` 全量回归与 tsc 基线比对（测试子卡，见 §5/§6）
- covers: t-2406b6 — `tests/panel-refresh-wiring.test.ts` + `tests/client-view.test.ts` + `tests/header-progress-responsive.test.ts` + `tests/compat-regression.test.ts`（接线与既有消费者回归）
- covers: t-8e45ea — `tests/panel-refresh-wiring.test.ts` + `tests/client-view.test.ts`（研发子卡：两处 stateKey 接线）
- covers: t-5dd17a — `tests/panel-refresh-wiring.test.ts` + `reviews/implementation-review.md`（复核子卡）
- covers: t-5f7644 — `docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts`（探针翻转）+ §4 六套用例
- covers: t-61a6bf — `docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts` + `evidence/run-log.md` + `pnpm build:client`（校验子卡）
