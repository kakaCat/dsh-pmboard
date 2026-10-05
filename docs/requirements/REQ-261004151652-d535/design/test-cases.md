---
serves: FR-4, FR-1, FR-2, FR-3
---

# REQ-261004151652-d535 设计 · 测试策略（能红的断言）

## 总策略（serves: FR-4）

| 层 | 断言对象 | 工具 | 跑法 |
|---|---|---|---|
| 常量层 | `FLOW_TIERS` 新值与等式 | vitest 纯断言 | `vitest run tests/header-progress-responsive.test.ts` |
| 结构层 | meta 纵排、徽章默认隐藏 + 窄档显示 | vitest 读源码/CSS 文本 | 同上 |
| 渲染层（真容器查询） | 各宽度档**实际可见集** + 两条新规则 | headless Chrome 探针 | `tsx scripts/header-progress-probe.mts` |
| 降级层 | 无容器语义时全明细可见、徽章隐藏 | 探针 `--fallback` | 同上加 `--fallback` |
| 构建层 | 客户端产物可重建 | `pnpm build:client`（C-12） | — |

**为什么必须有渲染层**：本需求改的全是 CSS 显隐与排版，模型层单测读不到「用户是否看得见、数字是否在自己名字下面」——原发病正是「规则写在文件里但用户看不到」。

## TC-1 探针：新档位期望表（serves: FR-2, FR-3）

改造 `scripts/header-progress-probe.mts`：档位期望表按新规则重写（标本 = 实施中、当前节点 `implementing` 有快照）：

| 标本框宽 | 容器 C | 期望可见名数 | 期望可见节点数 | 期望连线 | 期望徽章 |
|---|---|---|---|---|---|
| 1280 | 1232 | 7 | 2 | 6 | 隐 |
| 1024 | 976 | 7 | 2 | 6 | 隐 |
| 900 | 852 | 7 | 2 | 6 | 隐 |
| 768 | 720 | 1（当前） | **1** | 0 | 隐 |
| 640 | 592 | 0 | 0 | 0 | **显** |
| 480 | 452 | 0 | 0 | 0 | **显** |

**两条新断言（并入 `problems`）**：
① `visLabels > 0 && visTokens < 1` → `TOKENS_HIDDEN_BESIDE_LABELS`（有名字没数）；
② `visLabels === 0 && visBadges < 1` → `TOTAL_MISSING`（明细不可见却没有总数）；
③ 反向：`visLabels > 0 && visBadges > 0` → `TOTAL_DUPLICATED`（明细在时不该再显总数）。
**DIAG 行**沿用两段读数 `tokens=<节点级>+<徽章>`，并新增 `labels=<可见名数>`（已有）。

**能红吗（证伪性）**：把 `FLOW_TIERS.token` 改回 1000 → 768/720 档变「1 名 0 数」→ 断言①红；把徽章改回常显 → 宽档断言③红。红态输出必须与绿态一起存档。

## TC-2 单测：常量、排版与显隐规则（serves: FR-1, FR-2, FR-3）

在 `tests/header-progress-responsive.test.ts` 补/改：

| 用例 | 断言 |
|---|---|
| TC-2g | `FLOW_TIERS` 与三段 `@container` 阈值逐一相等（既有机制，值更新为 600/780/600） |
| TC-2h | `FLOW_TIERS.token === FLOW_TIERS.label`（等式是刻意的，不许被单独改掉） |
| TC-2i | `TOKEN_CSS` 含 `.dsh-pm-flow-meta` 的 `flex-direction: column`（纵排结构在场） |
| TC-2j | `TOKEN_CSS` 里 `.dsh-pm-cprog-token-total` 默认 `display: none`；`BOARD_CSS` 的 label 档块内有 `.dsh-pm-cprog-token-total { display: inline-flex`（让位规则在场） |
| TC-2k | `BOARD_CSS` 内**不存在**把节点级 `.dsh-pm-flow-token` 整块隐藏的规则与 `label` 档分离的第二个断点（防「等式被悄悄拆开」） |

## TC-3 构建与回归（serves: FR-4）

- `pnpm build:client` 退出码 0 且输出含 `[verify-client] OK`；
- `vitest run tests/header-progress-responsive.test.ts tests/header-progress-e2e.test.ts` 全绿；
- 全量回归失败集合与改动面零交集（沿用上一需求的对照法：失败文件清单 diff 为空）。

## TC-4 视觉证据（serves: FR-1, FR-2）

用标本页生成器（真 CSS + 真模型 + 真 Chrome）出**三档**截图，存 `evidence/`：

| 截图 | 视口 | 要看什么 |
|---|---|---|
| 宽 | 1280 | 每个数字都在其名字正下方、连线在、无徽章 |
| 中 | 700 | 只有当前节点名，**它下面有数字**、无徽章 |
| 窄 | 560 | 圆点 + 计数 + 徽章（数字型），无名字无数 |

人工复核命令（重载宿主后）：
```bash
curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/session/<sid>/progress" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print({n['key']: (n.get('tokens') or {}).get('total') for n in d.get('nodes',[]) if n.get('tokens')})"
# 期望：只列有快照的节点及其数值；再对照页面里每个节点名字下方是否出现同一个数
```

## 验收命令与期望输出（serves: FR-4）

```bash
./node_modules/.bin/tsx scripts/header-progress-probe.mts            # 6 档 problems=NONE + 新断言，退出码 0
./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback # 降级态：全明细可见 + 徽章隐藏，退出码 0
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts tests/header-progress-e2e.test.ts
pnpm build:client                                                    # C-12：[verify-client] OK
pnpm typecheck                                                       # 错误数 ≤ 146（本需求文件 0 个）
```

**规范引用**：C-12（改客户端源码必重建 bundle）、C-14（提交前跑测试与基线比对）、C-15（改源码必跑类型检查）。
