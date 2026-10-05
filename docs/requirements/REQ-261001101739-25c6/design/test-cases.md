# REQ-261001101739-25c6 测试策略与用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

> 判定口径与 `requirement.md` 的 A1–A7 一一对应。可复跑部分（单测 / 门禁 / 几何探针）不依赖 GUI；
> 实时 GUI 部分给出 DevTools 复刻片段（详见 `evidence/README.md`）。

## T-1 · 归属契约单测（主证据 · 无需 GUI）`serves: FR-1, FR-2, FR-3, FR-5, FR-6`

```bash
./node_modules/.bin/vitest run tests/client-styles-ownership.test.ts
```

| 用例 | 断言 | 对应用 |
|---|---|---|
| 模块求值期注入 + 自带归属章 | 文档里恰好 1 张表，`data-plugin === 'dsh-pmboard'`，`textContent.length > 1000` | A1 / FR-1、FR-3 |
| 别的插件认领不走 | `claimStyles(别的插件)` 后本表归属不变；`removeOwnedStyles(别的插件)` 后本表仍在 | A2 / FR-1 |
| 本插件 HMR 替换（先删后重建） | `removeOwnedStyles(本插件)` 后表数 0；重新 import 后表数 1；再次调用仍为 1 | A4 / FR-3 |
| 存量无主表 | 预置 `data-plugin-css` 但无 `data-plugin` 的表 → 调用后表数仍 1 且归属被纠正 | A1 / FR-2 |
| 删表后自愈 | 删表 → 调用 → 表以正确归属补回 | A3 / FR-4 |
| 无 `document` 静默 | `document === undefined` 时不抛 | FR-3 |

**可证伪**：把 `src/client/styles.ts` 还原到修复前（无 `data-plugin`、`apply()` 阶段注入）→ 6 条中 **5 条失败**。
（实测记录见 `requirement.md`「实施现状」表。）

## T-2 · 发版门禁（产物必须带归属章）`serves: FR-5`

```bash
pnpm build:client
# 期望末行：[verify-client] OK  bundle=… 关键符号齐全, 样式归属章在场, CSS 分片完整（退出码 0）
```

反例（应非零退出并指名原因）：

| 制造方式 | 期望输出 |
|---|---|
| 删掉 `tag.dataset.plugin = PLUGIN_ID` | `产物缺少样式归属章（dataset.plugin=, …）` |
| 截断任一 `src/client/styles/*.ts`（去掉末尾反引号） | `styles/xx.ts 未以模板字符串收尾（反引号）：疑似被截断` |
| 删掉 `styles.ts` 里的 `injectStyles()` 调用 | `styles.ts 丢失 injectStyles 调用` |

## T-3 · 几何零回归（本需求不动 CSS）`serves: FR-1`

```bash
./node_modules/.bin/tsx scripts/header-progress-probe.mts   # 期望：六档 DIAG + PROBE PASS（退出码 0）
```

证明「样式内容没被碰坏」：六档视口下 `.titleRow` 不溢出、档位可见集正确、当前节点恒可见、面板不越界。

## T-4 · 实时 GUI：归属章与认领隔离 `serves: FR-1, FR-2`

前置：`pnpm build:client` 后刷新 GUI（⌘R），打开任一**绑定了需求**的会话（流程图会渲染）。

```js
// 1) 归属章应为 "dsh-pmboard"（修复前是 null）
document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]')?.getAttribute('data-plugin')

// 2) 复刻宿主算法：别的插件认领 + 它被替换（整批删除）
for (const el of document.querySelectorAll('style:not([data-plugin])')) el.setAttribute('data-plugin', 'foreign-plugin')
for (const el of document.querySelectorAll('style[data-plugin="foreign-plugin"]')) el.remove()

// 3) 期望：本表仍在，流程图仍是横向 flex（修复前：表被删、节点竖排成十几行）
getComputedStyle(document.querySelector('.dsh-pm-flow')).display   // "flex"
```

截图对照：`evidence/header-flow-compare.png`（上＝故障态，下＝修复后）。

## T-5 · 实时 GUI：自愈 `serves: FR-4`

```js
// 删掉本表，等一次 15s 轮询（或打开「项目看板」页，挂载即触发）
document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]')?.remove()
// ≤15s 后期望：表以正确归属重新出现，流程图恢复横向样式
```

## T-6 · 实时 GUI：HMR 无空窗 `serves: FR-3, FR-4`

开着页面执行 `pnpm build:client`，用 `MutationObserver` 记录该表的 `remove` / `append` 时间戳：

| 期望 | 实测（2026-10-01） |
|---|---|
| 先 `remove`（宿主按归属删除，正确行为） | ✔ |
| 数毫秒内 `append`（新工厂执行期重新注入） | ✔ **5 ms** |
| 归属与 `textContent.length` 不变 | ✔ `dsh-pmboard` / 123466 |

## T-7 · 失败要响亮（不得静默降级）`serves: FR-5`

| 情形 | 期望 |
|---|---|
| 门禁发现产物缺归属章 | 非零退出 + 指名缺什么（不静默发旧包） |
| 单测里出现生产代码未覆盖的选择器 | 替身 DOM **抛错**（防止契约测试悄悄失效） |
| 探针环境找不到 Chrome | 退出码 2（响亮失败，不跳过） |
