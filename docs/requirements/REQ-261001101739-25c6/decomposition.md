# REQ-261001101739-25c6 拆分计划 · 样式表归属修复 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

> 拆分阶段产物：改动盘点 + 任务表。批准后自动落库任务卡并进入实施。
> 对照设计文档逐份盘点：`design/architecture.md`（归属生命周期）、`design/interfaces.md`（I-1~I-4 契约）、
> `design/data-model.md`（D-1 属性契约）、`design/test-cases.md`（T-1~T-7）、`design/use-cases.md`（UC-1~UC-5）。

## TL;DR

一次**小改动、零接口变更**的修复：让本插件注入的样式表在 DSH 的归属体系里**有主、可纠、可自愈**。
改动面 = 3 个 client 文件 + 1 个构建门禁脚本 + 1 个单测；CSS 内容、槽位注册、数据契约一律不动。

```
修复前：apply() 注入无主表 ──► 别的插件 claimStyles 认领 ──► 它被替换时整批删除 ──► 样式永久丢失
修复后：工厂执行期注入 + 自带归属章 ──► 谁也认领不走 ──► 本插件替换时正确删/建（5ms 空窗）
                                        └─ 在屏自愈：任何来源的删除 ≤15s 内补回
```

## 改动盘点（对照设计）

| # | 文件 | 类型 | 改动 | 设计出处 | serves |
|---|---|---|---|---|---|
| 1 | `src/client/styles.ts` | 改 | `PLUGIN_ID` + 建表盖归属章 + 归属纠正 + 模块求值期注入 | interfaces I-1、architecture「归属生命周期」 | FR-1、FR-2、FR-3 |
| 2 | `src/client/conversation-progress.ts` | 改 | 数据刷新 effect 里幂等确认样式表在场 | interfaces I-3、use-cases UC-1 | FR-4 |
| 3 | `src/client/page/host.ts` | 改 | 看板挂载时幂等确认样式表在场 | interfaces I-3 | FR-4 |
| 4 | `src/client/index.ts` | 不改 | `apply()` 原有调用保留（幂等） | interfaces I-1 | FR-3 |
| 5 | `scripts/verify-client-build.mjs` | 改 | 产物归属章硬阻断；CSS 截断信号改挂 `styles/*.ts` | interfaces I-4 | FR-5 |
| 6 | `tests/client-styles-ownership.test.ts` | 新增 | 复刻宿主认领/删除算法的契约单测 | test-cases T-1 | FR-6 |
| 7 | `src/client/styles/*.ts` | 不动 | CSS 规则 / 四态配色 / `@container` 档位零改动 | data-model D-INV-3 | —— |

## 任务表

| key | 标题 | phase | side | depends_on | 落点 FR |
|---|---|---|---|---|---|
| t1 | 样式表自带归属章并在工厂执行期注入 | implement | frontend | —— | FR-1、FR-3 |
| t2 | 存量无主表的兼容与归属纠正 | implement | frontend | t1 | FR-2 |
| t3 | 流程图与看板页的样式在屏自愈接线 | implement | frontend | t1 | FR-4 |
| t4 | 发版门禁：产物归属章 + CSS 分片截断信号 | implement | frontend | t1 | FR-5 |
| t5 | 归属契约单测（可证伪） | test | frontend | t1 | FR-6 |
| t6 | 端到端复验与证据归档（真实 GUI + 探针 + 门禁） | test | frontend | t2、t3、t4、t5 | FR-1~FR-6 |

### t1 · 样式表自带归属章并在工厂执行期注入 `serves: FR-1, FR-3`

- **implementation**：`src/client/styles.ts` 新增 `PLUGIN_ID = 'dsh-pmboard'`（装载身份 = 包名，刻意不复用 UI 身份的 `PANEL_NAME`）；
  `injectStyles()` 建表时写 `tag.dataset.plugin = PLUGIN_ID`（保留既有 `data-plugin-css`）；
  文件末尾（模块求值期 = bundle 工厂执行期）调用 `injectStyles()`；`src/client/index.ts` 的 `apply()` 调用保留。
- **acceptance**：
  1. `npx vitest run tests/client-styles-ownership.test.ts -t "模块求值期"` → 通过；
  2. `pnpm build:client` 后产物含字面量 `dataset.plugin=`（`grep -c 'dataset.plugin=' lib/client.cjs` ≥ 1）；
  3. 真实 GUI（刷新后）DevTools：`document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]').getAttribute('data-plugin')` → `"dsh-pmboard"`（修复前为 `null`）。

### t2 · 存量无主表的兼容与归属纠正 `serves: FR-2`

- **implementation**：`injectStyles()` 命中 `style[data-plugin-css="dsh-pmboard/styles.css"]` 但 `data-plugin !== PLUGIN_ID` 时，
  就地 `setAttribute('data-plugin', PLUGIN_ID)` 并返回（**不追加第二张表**）。
- **acceptance**：
  1. `npx vitest run tests/client-styles-ownership.test.ts -t "存量无主表"` → 通过（预置无主表 → 调用后表数仍为 1 且归属被纠正）；
  2. 真实 GUI：预置一张无主表（`data-plugin-css` 同值、无 `data-plugin`）→ 触发一次自愈 → 表数仍为 1、归属正确。

### t3 · 流程图与看板页的样式在屏自愈接线 `serves: FR-4`

- **implementation**：`src/client/conversation-progress.ts` 增加 `useEffect(() => { injectStyles() }, [data])`（15s 轮询 / 会话切换触发）；
  `src/client/page/host.ts` 的挂载 effect 内先调 `injectStyles()` 再 `attachBoard`。
- **acceptance**：
  1. `npx vitest run tests/client-styles-ownership.test.ts -t "自愈"` → 通过；
  2. 真实 GUI：删除本表 → ≤15s（或打开「项目看板」页瞬时）→ 表以正确归属重新出现，`.dsh-pm-flow` 仍 `display:flex`。

### t4 · 发版门禁：产物归属章 + CSS 分片截断信号 `serves: FR-5`

- **implementation**：`scripts/verify-client-build.mjs` 增加 `ownership = ['dataset.plugin=', 'dataset.pluginCss=']` 检查（缺失即非零退出）；
  把「以 `}` 收尾」的截断信号改挂到 `src/client/styles/*.ts`（每份必须以模板字符串收尾）+ 校验 `styles.ts` 仍含 `injectStyles(`；
  新增 `readdirSync` 导入。
- **acceptance**：
  1. `pnpm build:client` → 末行 `[verify-client] OK … 样式归属章在场, CSS 分片完整`，退出码 0；
  2. 反例：临时删掉 `tag.dataset.plugin = PLUGIN_ID` → 同命令**非零退出**且输出含「产物缺少样式归属章」；
  3. 反例：临时截断任一 `styles/*.ts` 末尾反引号 → 非零退出且指名分片。

### t5 · 归属契约单测（可证伪）`serves: FR-6`

- **implementation**：新增 `tests/client-styles-ownership.test.ts`：最小 DOM 替身（`document.querySelector/All/createElement` + `dataset↔属性` 投影）
  与宿主算法复刻（`claimStyles` / `removeOwnedStyles`），覆盖 I-1 四条不变量与「认领不走 / 删除删不掉 / 归属纠正 / 删后自愈 / 无 document 静默」。
- **acceptance**：
  1. `npx vitest run tests/client-styles-ownership.test.ts` → **6 passed**；
  2. 可证伪：`git stash push -- src/client/styles.ts src/client/conversation-progress.ts src/client/page/host.ts` 后同命令 → **≥5 failed**，随后 `git stash pop` 还原；
  3. 未实现的选择器必须让替身 DOM 抛错（防止契约测试悄悄失效）。

### t6 · 端到端复验与证据归档 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

- **implementation**：在真实 GUI 上复核四条（归属章 / 认领隔离 / 自愈 / HMR 无空窗），跑几何探针与构建门禁，
  把截图与复跑步骤写入 `docs/requirements/REQ-261001101739-25c6/evidence/`。
- **acceptance**：
  1. `npx tsx scripts/header-progress-probe.mts` → `PROBE PASS`（退出码 0）；
  2. `pnpm build:client` → 退出码 0；
  3. `evidence/` 含 `header-flow-compare.png`、`header-flow-broken.png`、`header-flow-fixed.png`、`header-flow-after-hmr.png`、`README.md`（含 DevTools 复刻片段）；
  4. HMR 复验：开着页面执行 `pnpm build:client`，生命周期日志为 `remove` → 毫秒级 `append`，表数恒为 1。

## FR 覆盖表

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1、t6 |
| FR-2 | t2、t6 |
| FR-3 | t1、t6 |
| FR-4 | t3、t6 |
| FR-5 | t4、t6 |
| FR-6 | t5、t6 |

## 下一步

implementing —— 用 `reqboard_ask_confirm(target=plan)` 交棒；未获批准不得落库任务卡。
