# 测试证据（REQ-261004154937-2ca3 · 2026-10-04）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0；`node_modules/.bin/tsx`（探测脚本）；tsc 5.3.3；zstd CLI（读会话日志）
- 真实数据：`~/.dsh/sessions/<workspace>/<sessionId>/session.v4.jsonl.zstd`（本机索引到 121 个会话）
- ⚠️ 宿主常驻 `dist/index.mjs`：本次改了宿主侧源码（适配器 + 组合根），**需重载 DSH 才在真机生效**；
  客户端文案刷新页面即可。

## 跑了什么

```bash
node_modules/.bin/vitest run tests/lineage-delta.test.ts          # 纯规则：聚合/恒等式/五态差值
node_modules/.bin/vitest run tests/session-probe-lineage.test.ts   # 适配器：闭包/取数/降级
node_modules/.bin/vitest run tests/session-probe-token.test.ts     # 既有：自身快照语义
node_modules/.bin/vitest run tests/apply-wiring.test.ts            # 装配冒烟（服务缺失也不崩）
node_modules/.bin/vitest run tests/chain-budget.test.ts            # 预算闸（本次不该动）
node_modules/.bin/vitest run tests/token-tab.test.ts tests/token-endpoint.test.ts
pnpm test                                                          # 全量回归（逐文件 diff 基线）
pnpm typecheck                                                     # 类型
pnpm build                                                         # 构建（C-11 / C-12）
node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts
```

## 结果摘要

| 层 | 证据 | 结果 |
|---|---|---|
| 纯规则 | `lineage-delta.test.ts` 13 条：主+2 子合计、恒等式、三层血缘、fork 不算、断链不猜、五态差值、顺序无关、脏成员防御 | ✅ 全绿 |
| 适配器 | `session-probe-lineage.test.ts` 7 条：闭包与 depth、聚合恒等式、缺失不补 0、冷读超预算、服务缺失退回自身、未预热如实标 self | ✅ 全绿 |
| 可证伪 | 三条红态：关掉聚合 → 2 条红；新成员只算增量 → 1 条红；水位缺失硬相减 → 1 条红（输出见 `evidence/t1-red-*.txt`） | ✅ 各自可复现 |
| 既有兼容 | `session-probe-token` 6 条 + `apply-wiring` 5 条 + `execution-token-guard` 4 条 + `token-endpoint` 8 条 | ✅ 全绿 |
| 预算闸 | `chain-budget.test.ts` 15 条（**一条未改**） | ✅ 全绿 |
| 真数据 | `probe-lineage-live.mts`：本仓闭包 15 成员 / 独立复算 15 成员，226,420,316 == 226,420,316，差额 0 | ✅ PASS |
| 全量回归 | 失败文件集合与开工前**逐文件零差异**（46 文件 / 96 用例） | ✅ |
| 类型 | 146（与基线持平，本需求文件 0 个） | ✅ |
| 构建 | `pnpm build` → `[verify-client] OK`；宿主产物含血缘聚合、客户端含新口径文案 | ✅ |

## 用例 ↔ 任务卡对应（覆盖率门禁读这段 `covers:` 标注）

### 组 1 · 契约与差值规则（快照带成员 + 五态差值）
covers: t-f5b87a
covers: t-1a6bb7
covers: t-e5eba3
covers: t-d5dbae
covers: t-1c50d3

用例：`tests/lineage-delta.test.ts`（13 条，含 TC-1a~e / TC-2a~h）；红态三份输出。

### 组 2 · 适配器血缘聚合与降级
covers: t-8239b1
covers: t-a55a6f
covers: t-cfd3b6
covers: t-fe0161
covers: t-790a67

用例：`tests/session-probe-lineage.test.ts`（7 条）；`tests/apply-wiring.test.ts`（装配冒烟 5 条）；
`tests/session-probe-token.test.ts`（既有语义 6 条）。

### 组 3 · 两级差值换口径与口径文案
covers: t-63252e
covers: t-03cd57
covers: t-21f214
covers: t-8c58f3
covers: t-ff6131

用例：`tests/token-tab.test.ts`（含新增三要素断言）、`tests/token-endpoint.test.ts`、
`tests/chain-budget.test.ts`（15 条一条未改）；产物核对（宿主/客户端两份产物含新口径）。

### 组 4 · 收口取证与基线
covers: t-ec807b
covers: t-1ce504

证据：`evidence/probe-lineage-live.mts` 与 `evidence/t4-lineage-live.txt`（真数据一致）、
`evidence/full-suite-after-{t1,t2,t3}.txt`（逐文件 diff）。

## 未跑项 / 失败项（响亮记录，不静默）

1. **真机端到端读数**：宿主未重载 ⇒ 运行中插件仍是旧口径。重载后按下面命令复核：
   ```bash
   curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/session/<你的会话id>/progress" \
     | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('需求累计', (d.get('requirement') or {}).get('tokenTotal'))"
   # 再把窗口拉窄到容器 <780：当前节点名字下方应仍有它的数；拉到 <600：名字与数一起消失、计数旁出现累计总数
   ```
2. **投影缓存命中率未在真实进程内测定**：真数据探测走日志折叠（cross-check 规则），不是宿主投影读数；
   命中率低时会出现「本轮某些后代未计入 + 标 degraded」，下一轮冷读预热后补上。
3. **64 成员上限未做压力测试**：超出即截断（防御性上限），影响面写在已知偏差表。
4. **既有红（范围外）**：46 个失败文件与本次改动面零交集（逐文件 diff 已存档），未修。
