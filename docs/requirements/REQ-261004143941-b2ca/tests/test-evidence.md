# 测试证据（REQ-261004143941-b2ca · 2026-10-04）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0（`node_modules/.bin/vitest`）；探针 `node_modules/.bin/tsx`；类型检查 tsc 5.3.3
- 真实数据根（仅取证用，不写入）：`~/.dsh/reqboard`；运行中 GUI：`http://127.0.0.1:19387`
- **无 commit 可指**：本工作区在本需求开始前就带大量未提交的在途改动，故一律采用「改动前后对比」而非 commit 对比。
- ⚠️ 宿主加载的是启动时的 `dist/index.mjs`；本次源码改动在其之后 ⇒ 实时 HTTP 证据止步于「旧形状仍在」，
  新字段的证据走**进程内真数据探针**（原因与缓解见文末「未跑项」）。

## 跑了什么

```bash
node_modules/.bin/vitest run tests/session-progress.test.ts tests/progress-nodes-fallback.test.ts   # 接口层
node_modules/.bin/vitest run tests/header-progress-responsive.test.ts                              # 模型/结构层
node_modules/.bin/vitest run tests/token-tab.test.ts tests/token-endpoint.test.ts tests/header-progress-e2e.test.ts  # 基线（刻意不动的链路）
node_modules/.bin/tsx scripts/header-progress-probe.mts                                            # 渲染层（真容器查询 6 档）
node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback                                 # 渲染层降级态
node_modules/.bin/tsx docs/requirements/REQ-261004143941-b2ca/evidence/probe-live-progress.mts     # 接口层（真数据根 + 真队列 + 真路由）
pnpm test                                                                                          # 全量回归
pnpm typecheck                                                                                     # 类型
pnpm build                                                                                         # 构建（C-11/C-12）
```

## 结果摘要

| 层 | 命令/证据 | 结果 |
|---|---|---|
| 接口层 | vitest 9 用例（TC-3a 自洽 / 3b 缺席 / 3c 兜底） | ✅ 全绿 |
| 接口层·真数据 | `probe-live-progress.mts`：tokenTotal 25321586 === Σnodes 25321586 | ✅ PASS |
| 模型层 | `header-progress-responsive.test.ts` 19 用例（含 TC-2a~2f） | ✅ 全绿 |
| 渲染层 | 探针 6 档：`tokens=2+1 / 0+1 / 0+1 / 0+1 / 0+1 / 0+1`，problems=NONE | ✅ PROBE PASS，退出码 0 |
| 渲染层·降级 | 探针 `--fallback` 5 档 | ✅ PROBE PASS |
| 渲染层·可证伪 | 去掉累计读数 → B/C/D 档 `0+0` → TOKENS_HIDDEN → 退出码 1 | ✅ 红态可复现（`evidence/t3-probe-red.txt`） |
| 基线 | token-tab + token-endpoint + header-progress-e2e 共 15 条 | ✅ 全绿 |
| 全量回归 | 4035 用例：3919 → 3925 通过（+6 = 新增用例）；失败集合与改动面零交集 | ✅ 零新增红 |
| 类型 | 146 个错误，与基线相同；本需求文件 0 个 | ✅ 持平 |
| 构建 | `pnpm build` 退出码 0，`[verify-client] OK` | ✅ |

## 证据文件索引

- `evidence/t1-evidence.md`、`evidence/probe-live-progress.mts`、`evidence/t1-live-progress.txt`（接口层 + 真数据自洽）
- `evidence/t3-evidence.md`、`evidence/t3-probe-green.txt`、`evidence/t3-probe-fallback-green.txt`、`evidence/t3-probe-red.txt`（渲染层红/绿对照）
- `evidence/t4-evidence.md`、`evidence/t4-probe-final.txt`、`evidence/header-token-total-1280.png`、`evidence/header-token-total-1024.png`、`evidence/shot-specimen.mts`（收口 + 视觉证据）
- `evidence/full-suite-after-t1.txt`、`evidence/full-suite-after-t2.txt`、`evidence/typecheck-baseline.txt`（全量与类型对照）

## 用例 ↔ 任务卡对应（覆盖率门禁读这段 `covers:` 标注）

### 组 1 · 进度接口（需求累计 token：自洽 / 缺席 / 兜底）
covers: t-efa6dc
covers: t-b01dfd
covers: t-c4c264
covers: t-ea39c8
covers: t-c44a6b

用例：`tests/session-progress.test.ts` 的 TC-3a/TC-3b；`tests/progress-nodes-fallback.test.ts` 的 TC-3c；
外加进程内真数据探针 `evidence/probe-live-progress.mts`（真 store + 真队列 + 真路由）。

### 组 2 · 客户端渲染与档位（模型落模 / 徽章 / 结构守卫）
covers: t-fd24aa
covers: t-652af2
covers: t-f6f257
covers: t-84eecd
covers: t-341231

用例：`tests/header-progress-responsive.test.ts` 的 TC-2a~TC-2f；客户端产物核对（构建后 bundle 含徽章与档位规则）。

### 组 3 · 渲染层探针（各档可见 token ≥ 1，红态可复现）
covers: t-1aa47e
covers: t-4982e7
covers: t-ef4402
covers: t-81a42c

用例：`scripts/header-progress-probe.mts`（6 档 + 降级 5 档）；
红态对照 `evidence/t3-probe-red.txt`（去掉累计读数 → 退出码 1）。

### 组 4 · 兼容/回滚与构建收口
covers: t-d59056
covers: t-4895a1

用例：兼容三态逐条（TC-3b / TC-2b~2d / 结构性依据）；回滚路径核对；
`pnpm build` 与 `pnpm build:client` 的 `[verify-client] OK`；宽窄两档截图。

## 未跑项 / 失败项（响亮记录，不静默）

1. **实时接口复跑**：运行中宿主未重载插件 ⇒ `curl .../session/<sid>/progress` 仍返回旧形状（无 `tokenTotal`）。
   我无权重载（审批被禁用）。人工重载后按 `evidence/t4-evidence.md` 末尾命令复核即可看到字段。
2. **真机 GUI 点击复核**：同上原因，视觉证据用标本页（真 CSS + 真流程图模型 + 真 Chrome）替代。
3. **全量测试的开工前基线**：未在改前实测（我的疏漏）。不宣称「失败数 ≤ 基线」这个数字，
   改用等价证据：46 个失败文件与改动面**零交集**，且唯一会执行进度路由的测试文件全部通过。
4. **既有红（范围外）**：`tests/routes-rollup.test.ts` 两条用例因该文件缺 v9 必需的 `taskStore` 而红，
   与本次改动无关，未修（越界）。
