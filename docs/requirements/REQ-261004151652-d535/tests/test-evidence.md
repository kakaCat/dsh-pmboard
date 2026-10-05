# 测试证据（REQ-261004151652-d535 · 2026-10-04）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0；探针 `node_modules/.bin/tsx` + headless Chrome；类型检查 tsc 5.3.3
- ⚠️ 宿主常驻 `dist/index.mjs`（启动时加载）：改完源码必须重建 + **重载宿主**才在真机生效。
  本会话无权重载（审批禁用），故渲染层证据走探针与标本页；接口层本次未改动。

## 跑了什么

```bash
node_modules/.bin/vitest run tests/header-progress-responsive.test.ts   # 常量 / 结构 / 落模（22 条）
node_modules/.bin/tsx scripts/header-progress-probe.mts                 # 渲染层：真容器查询 6 档
node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback      # 降级路径（无容器语义）
node_modules/.bin/vitest run tests/header-progress-e2e.test.ts          # 端到端（真实浏览器 2 条）
pnpm test                                                              # 全量回归
pnpm typecheck                                                         # 类型
pnpm build                                                             # 构建（C-11 / C-12）
```

## 结果摘要

| 层 | 证据 | 结果 |
|---|---|---|
| 常量/结构 | 22 条单测（含 TC-2g 等式、TC-2h 纵排、TC-2i 不许拆档、TC-2f 徽章显隐与特异性前缀） | ✅ 全绿 |
| 渲染层 | 探针 6 档：`1232/976/852 → 7名+2数+6线+无徽章`；`720 → 1名+1数+0线+无徽章`；`592/452 → 0名+0数+0线+徽章可见`，problems=NONE | ✅ PROBE PASS，退出码 0 |
| 降级 | 探针 `--fallback`：全明细可见 + 徽章隐藏 | ✅ PASS |
| 可证伪 | 红 A（旧阈值 1000 的单藏 token 档）→ `TOKENS_HIDDEN_BESIDE_LABELS`；红 B（徽章常显）→ `TOTAL_DUPLICATED` | ✅ 两红各自退出码 1 |
| 端到端 | `header-progress-e2e`（真实浏览器） | ✅ 2/2 |
| 全量回归 | 失败文件集合与开工前基线**逐文件零差异**（46 文件 / 96 用例） | ✅ 零新增红 |
| 类型 | 146（与基线持平，本需求文件 0 个） | ✅ |
| 构建 | `pnpm build` → `[verify-client] OK`，产物时间戳更新 | ✅ |

## 用例 ↔ 任务卡对应（覆盖率门禁读这段 `covers:` 标注）

### 组 1 · 排版与阈值等式（节点内上下两行 + 有名字就有数 + 徽章让位）
covers: t-81de92
covers: t-460fd9
covers: t-594a4e
covers: t-42fee8
covers: t-5cbe8d

用例：`tests/header-progress-responsive.test.ts` 的 TC-2f/TC-2g/TC-2h/TC-2i/TC-5g；
产物核对（`lib/client.cjs` 含纵排、默认隐藏、窄档显示三条规则）。

### 组 2 · 探针判据重写与三条新断言
covers: t-8da10a
covers: t-b6a6f5
covers: t-c39e3f
covers: t-c128b1

用例：`scripts/header-progress-probe.mts`（6 档 + 降级 5 档）；
红态对照 `evidence/t2-probe-red-token1000.txt`、`evidence/t2-probe-red-badge-always.txt`；
绿态 `evidence/t2-probe-green.txt`、`evidence/t2-probe-fallback-green.txt`。

### 组 3 · 构建、基线回归与三档视觉
covers: t-23acc2
covers: t-c490a8

证据：`evidence/full-suite-final.txt`（失败集合 diff 为零）、`evidence/typecheck` 计数 146、
`evidence/header-node-tokens-{1280,700,560}.png`、生成器 `evidence/shot-specimen.mts`。

## 未跑项 / 失败项（响亮记录，不静默）

1. **真机 GUI 复核**：宿主未重载 ⇒ 运行中的会话头部仍是旧渲染。重载后按下面命令复核：
   ```bash
   curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/session/<sid>/progress" \
     | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print({n['key']:(n.get('tokens') or {}).get('total') for n in d.get('nodes',[]) if n.get('tokens')})"
   # 再把窗口拉窄到容器 <780：当前节点名字下方应仍有它的数；拉到 <600：名字与数一起消失、计数旁出现累计总数
   ```
2. **更窄档未覆盖**：探针覆盖到容器 452；容器更窄时的横向滚动未验证（需求边界外）。
3. **既有红（范围外）**：46 个失败文件与本次改动面零交集（逐文件 diff 已存档），未修。
