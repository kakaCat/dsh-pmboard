# t4 证据：兼容/回滚 + 构建与基线回归（REQ-261004143941-b2ca）

## 构建（规范 C-11 / C-12）

```
$ pnpm build            # 宿主 + 客户端
✔ Build complete … [verify-client] OK  bundle=342205 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
exit=0
dist/index.mjs  1505881 bytes（新）
lib/client.js   319152 bytes（新）
lib/client.cjs  341.91 kB（新）
```

## 探针（最终产物上重跑）

```
$ ./node_modules/.bin/tsx scripts/header-progress-probe.mts
DIAG … tier=A … tokens=2+1 … problems=NONE
DIAG … tier=B … tokens=0+1 … problems=NONE
DIAG … tier=D … tokens=0+1 … problems=NONE
PROBE PASS      exit=0
```
完整输出：`evidence/t4-probe-final.txt`。读法 `tokens=<节点级>+<累计徽章>`——**B/C/D 档 0+1 就是本次要的结果**。

## 基线回归（失败数对照）

| 测试文件 | 结果 | 是否在既有红名单（46 文件）里 |
|---|---|---|
| `tests/token-tab.test.ts` | ✅ 通过 | 否 |
| `tests/token-endpoint.test.ts` | ✅ 通过（8 用例） | 否 |
| `tests/header-progress-e2e.test.ts` | ✅ 通过（2 用例，真 Chrome） | 否 |

```
Test Files  3 passed (3)      Tests  15 passed (15)
```

全量对照（t1 之后 → t2 之后）：失败文件集合**逐文件相同**（46 个），通过数 3919 → 3925（正好 +6 条新增用例）；
类型检查错误数 146 → 146（与基线持平，本需求文件 0 个）。
**开工前的全量基线我没有实测**（我的疏漏，已在 t1 证据里如实写明），故不宣称「≤ 基线」这个数字，
改用可复核的等价证据：**失败集合与改动面零交集**（唯一碰进度路由的测试文件全部通过）。

## 兼容三态（逐条有据）

| 情形 | 断言 | 依据 |
|---|---|---|
| 无 `tokenTotal` 字段（旧宿主 + 新客户端） | 模型不落该键 → 不渲染徽章（不出现「🪙 0」） | `tests/header-progress-responsive.test.ts` TC-2b/2c/2d |
| 老需求 / 无任何快照 | 宿主**不发该键** | `tests/session-progress.test.ts` TC-3b |
| 旧客户端 + 新宿主 | 忽略未知字段，行为与改造前逐字一致 | 新增字段为可选、只增不改既有键（`requirement` 其余字段未动） |

## 回滚路径

撤两处即可回到现状：① `src/http/routers/stages.ts` 里 `...(tokenTotal > 0 ? { tokenTotal } : {})` 一行；
② `src/client/conversation-progress.ts` 的 `tokenTotalBadge` 渲染块（连带 `flow-chart-model.ts` 的可选字段）。
**无写盘、无 schema 版本变更、无缓存失效、无配置开关**——回滚不需要数据迁移。

## 真机两档截图（视觉证据）

| 文件 | 窗口宽 / 档位 | 看到什么 |
|---|---|---|
| `evidence/header-token-total-1280.png` | 1280 / A（容器 1232） | 每节点 token（设计 10.9M、实施 12.7M）**和**计数旁的累计徽章 🪙 25.3M |
| `evidence/header-token-total-1024.png` | 1024 / B（容器 976） | 节点级 token 按既有设计隐藏，**累计徽章 🪙 25.3M 仍在** |

生成器：`evidence/shot-specimen.mts`（真 CSS 源 + 真流程图模型 + 真 Chrome；token 文案走 `fmtTokens`，与真组件逐字一致）。

**必须说清的偏差（不藏）**：这两张是**标本页**截图，不是运行中 GUI 的截图。
原因是**宿主把插件 dist 常驻内存，重建 dist 不会换掉已加载的模块**——实测重建后
`curl .../session/<sid>/progress` 仍返回旧形状（无 `tokenTotal`）。换新宿主需要重载/重启 DSH，
而本会话的审批被禁用（`plugin_manager` 的启停需要 danger-full-access → 自动拒绝），
**这步我做不了**。宿主侧的正确性由 `evidence/probe-live-progress.mts`（真数据 + 真路由 + 真队列，进程内）证明；
真机截图请人工重载后按下面一条命令复核。

**人工复核命令（重载 DSH 后）**：
```bash
curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/session/<你的会话id>/progress" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; r=d['requirement']; s=sum((n.get('tokens') or {}).get('total',0) for n in d.get('nodes',[])); print('tokenTotal',r.get('tokenTotal'),'Σnodes',s)"
# 期望：两个数字相等且 > 0；会话头部流程图计数旁出现 🪙 <数>
```
