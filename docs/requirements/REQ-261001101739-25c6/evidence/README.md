# REQ-261001101739-25c6 证据与复现

> 本目录是验收材料的一部分。**归属契约**部分不依赖 GUI、可随时复跑；**实时 GUI** 部分记录本机实测步骤与截图。

## 1. 交付物长什么样（三张图）

| 文件 | 是什么 | 怎么来的 |
|------|--------|----------|
| `header-flow-compare.png` | **一图对照**（上＝故障态，下＝修复后），本需求首图 | 由下面两张裁切放大拼接 |
| `header-flow-broken.png` | **故障态**（复刻用户截图）：会话框右上流程图样式全丢，七个节点竖排成一列，只剩 `立项 / 需求分析 1.7M / 设计 2.7M / 拆分 2.1M / 实施 23.8M / ●验收 / 7 / 归档 / 24/24` 的裸文字 | headless Chromium 打开本机 GUI（会话 `session-a989385b`，绑定 REQ-260930230225-71be），按 shell 算法把本插件的样式表认领给别的插件再删除 |
| `header-flow-fixed.png` | **修复态**：横向胶囊芯片，七个圆点（绿 ✓ 完成 / 蓝 ● 当前）+ 节点名 + 节点 token + `24/24` 计数，位于右侧工具组最左 | 同一次会话，修复后的 bundle（`pnpm build:client` 产物） |
| `header-flow-after-hmr.png` | **HMR 态**：开着页面重建 `lib/client.js` 之后，芯片仍为横向胶囊（归属章在场 → 被正确删除后由新工厂补回） | 同上，重建时用 `MutationObserver` 记录样式表生命周期：`remove` → 5ms 后 `append` |

## 2. 怎么复跑

### ① 归属契约单测（主证据，无需 GUI / 浏览器）

```bash
./node_modules/.bin/vitest run tests/client-styles-ownership.test.ts
#    期望：6 passed
#    可证伪：把 src/client/styles.ts 还原到修复前（无 data-plugin 章、apply() 阶段注入）→ 5/6 失败
```

### ② 发版门禁（产物必须带归属章）

```bash
pnpm build:client
#    期望：末行 [verify-client] OK  bundle=… 关键符号齐全, 样式归属章在场, CSS 分片完整，退出码 0
#    把 styles.ts 里的 tag.dataset.plugin = PLUGIN_ID 删掉 → 非零退出并指名「产物缺少样式归属章」
```

### ③ 几何零回归（本需求不动 CSS，此处只证明没碰坏）

```bash
./node_modules/.bin/tsx scripts/header-progress-probe.mts
#    期望：六档 DIAG + PROBE PASS，退出码 0
```

### ④ 实时 GUI 复刻（本机实测步骤）

打开「有绑定需求的会话」（本机：`流程节点大小适配与位置调整` / `session-a989385b…`），
在 DevTools Console 里执行下面两段，对照 `header-flow-broken.png` 与 `header-flow-fixed.png`：

```js
// a) 看归属章（修复后应为 "dsh-pmboard"，修复前是 null）
document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]')?.getAttribute('data-plugin')

// b) 复刻 shell 的认领 + 删除（DSH client-modules 的真实算法）
for (const el of document.querySelectorAll('style:not([data-plugin])')) el.setAttribute('data-plugin', 'foreign-plugin')
for (const el of document.querySelectorAll('style[data-plugin="foreign-plugin"]')) el.remove()
// 修复后：本表仍在，.dsh-pm-flow 仍 display:flex；修复前：本表被删，节点竖排
getComputedStyle(document.querySelector('.dsh-pm-flow')).display

// c) 自愈：删掉本表，等一次 15s 轮询（或打开看板页）后应重新出现且归属正确
document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]')?.remove()
```

## 3. 契约来源（为什么这么改）

| 事实 | 出处 |
|------|------|
| 每次模块 materialize 都会 `claimStyles(ownerId)`：把 `style:not([data-plugin])` 认领给当前插件 | DSH `packages/client/modules/src/client/system.ts` |
| 插件被替换 / 裁剪时 `removeOwnedStyles(ownerId)` 按 `data-plugin` 整批删除 | DSH `packages/client/modules/src/client/entry-lifecycle.ts` |
| 官方预设因此自带 `tag.dataset.plugin = id`，并在**工厂执行期**注入 | DSH `packages/client/tsdown.client.ts`（`styleInjectionModule`） |
| `id` = boot 行的 entry id = 包名 | DSH `packages/client/modules/src/index.ts`（`@param id - entry id (package name)`） |
