# REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

> 档位：轻档（改动面小、无新决策点）· 类型：feature（实为会话头部流程图样式归属缺陷修复）

## TL;DR

会话框右上角那张「流程节点」流程图（立项→需求分析→设计→拆分→实施→验收→归档）在本插件
**刷新/热替换之后样式全丢**：节点竖排、圆点/四态配色/连线全无，只剩一串裸文字。

根因不是 CSS 写错，而是**样式表的归属没登记**：本插件注入的 `<style data-plugin-css="dsh-pmboard/styles.css">`
不带 `data-plugin` 章，且注入时机在 `apply()`（模块 materialize 之后）。DSH 的 client-modules 在
**每次模块 materialize** 时执行 `claimStyles(ownerId)`，把文档里所有 `style:not([data-plugin])`
认领给当前 materialize 的那个插件；卸载 / HMR 替换 / 图行裁剪时按 `data-plugin` 调
`removeOwnedStyles(ownerId)` 整批删除。于是本表被**下一个 materialize 的别的插件**认领走，
那个插件一被替换就被连带删除；而本插件的 `apply()` 不会因此重跑 —— 样式再也回不来。

```
缺陷链（修复前）
本插件 apply() 注入无主 <style> ──► 别的插件 materialize：claimStyles(它) 认领走
        ▲                                      │
        │ 不会重跑                              ▼
   本插件模块没被动过 ◄── 样式被整批删除 ◄── 它被 HMR 替换 / 图行裁剪
```

改法三件事：**自己盖归属章** + **注入提前到工厂执行期** + **在屏自愈**（外加一条发版门禁）。

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 归属章在场 | 真实 GUI 里查 `style[data-plugin-css="dsh-pmboard/styles.css"]` | `data-plugin === "dsh-pmboard"`（修复前为 `null`） |
| A2 认领不走 | 复刻 shell 算法：`claimStyles(别的插件)` → `removeOwnedStyles(别的插件)` | 本表仍在文档里，`.dsh-pm-flow` 的 `display` 仍为 `flex`、7 个节点仍在 |
| A3 删了能自愈 | 手动删除本表 → 等一次轮询（15s）/ 打开看板页 | 本表以正确归属重新出现，流程图恢复横向样式 |
| A4 HMR 无空窗 | 开着页面触发 `pnpm build:client` | 先 `remove` 本表、**数毫秒内**重新 `append`，归属与 CSS 长度不变 |
| A5 发版门禁 | `pnpm build:client` | 产物缺归属章即非零退出；`styles/*.ts` 分片截断即非零退出 |
| A6 单测可证伪 | `npx vitest run tests/client-styles-ownership.test.ts` | 6/6 通过；**对修复前实现 5/6 失败** |
| A7 几何零回归 | `npx tsx scripts/header-progress-probe.mts` | 六档视口 `problems=NONE` |

## 产品定义

「会话头部流程节点」回答 **「这个会话绑定的需求走到哪一步、做完几件事」**：七个圆点四态
（完成 ✓ / 当前 ● / 未到序号 / 分类跳过 —）+ 节点名 + 节点 token + 连线 + `done/total` 计数；
点任意位置展开详情面板。它是本插件**常驻在屏**的 UI，也是用户「长任务跑一半回头看」的主要抓手。

它由**一张注入到 `<head>` 的样式表**驱动（本插件全部界面共用这一张，约 123 KB / 997 条规则）。
这张表在 DSH 的 client-modules 里是**有主之物**，归属错了就会被别人的装卸流程连带删除 ——
本需求修的就是这条归属链，与 CSS 内容本身无关。

受影响场景：任何刷新 / 热替换 / 别的插件装卸之后；一旦丢失，在屏期间**不会自愈**，
用户只能靠再次刷新撞时机。

## 用户与角色

- **会话里的用户（PM / 需求方）**：流程图是唯一一眼看进度的地方；样式一丢，节点竖排成十几行，
  标题行被撑高、会话内容被挤下去，等于该功能当场失效。
- **实施 agent**：截图是本项目常用证据，样式丢失时截图不可用作验收证据（历史事件同款）。
- **前端维护者（本插件）**：需要一条**与 DSH 装载契约对齐**的样式注入约定，而不是每次样式丢了再补一条 hack。

## 接口与数据契约

- **对外接口**：无新增接口、无新增槽位、无接口签名变化；`injectStyles()` 仍是唯一注入入口（幂等，可重复调用）。
- **数据契约**：请求 `/dashboard/api/reqboard/session/:id/progress` 的出入参与节点模型**一律不变**。
- **与宿主的契约（本次的核心）**：样式表必须带 `data-plugin = 本插件装载 id（包名 dsh-pmboard）`，
  并在 **bundle 工厂执行期**完成注入（materialize 时被 `claimStyles` 登记）。
- **迁移与兼容**：文档里可能残留**旧的无主样式表**（修复前的 bundle 注入）——`injectStyles()` 发现后
  只**纠正归属**、不重复插表；旧表内容与新表同源，无需刷新即可被后续自愈接管。
- **回滚**：仅改本插件三个 client 文件 + 一个构建门禁脚本；回滚即还原这三个文件，无数据迁移、无状态残留。

## 功能点

- **FR-1: 样式表自带归属章** —— 新建 `<style>` 时写入 `data-plugin = 'dsh-pmboard'`（装载身份 = 包名，与 `__ModuleLoader__.load({id})` 同源），使别的插件 `materialize` 时的 `claimStyles` 认领不走本表
- **FR-2: 归属纠正（不重复插表）** —— 已存在 `data-plugin-css` 等于本插件的样式表但归属不是本插件时，就地改回本插件；断言表数量恒为 1
- **FR-3: 注入时机提前到工厂执行期** —— 模块求值期即调用 `injectStyles()`（与官方 `tsdown.client.ts` 的 `styleInjectionModule` 同时机），`materialize` 时被登记为本插件所有；`apply()` 仍保留一次幂等调用
- **FR-4: 在屏自愈** —— 会话头部流程图组件在每次数据刷新（15s 轮询 / 会话切换）与看板页面挂载时各确认一次样式表在场（幂等，代价一次 `querySelector`），任何来源的移除都能在一次刷新周期内恢复
- **FR-5: 发版门禁** —— `scripts/verify-client-build.mjs` 新增「产物必须含 `dataset.plugin=` / `dataset.pluginCss=` 归属章」硬阻断；并把「CSS 截断信号」从已分层的 `styles.ts` 改挂到真正的 CSS 载体（`src/client/styles/*.ts` 分片必须以模板字符串收尾）
- **FR-6: 可证伪的归属契约单测** —— `tests/client-styles-ownership.test.ts` 逐条复刻 shell 的 `claimStyles` / `removeOwnedStyles` 算法，锁住「认领不走 / 删除删不掉 / 纠正不重复插表 / 删后自愈 / 无 document 静默」

## 边界

**做**：

1. 样式注入与归属：`src/client/styles.ts`（归属章、归属纠正、工厂执行期注入）
2. 在屏自愈：`src/client/conversation-progress.ts`（流程图组件）、`src/client/page/host.ts`（看板页面宿主）
3. 门禁与用例：`scripts/verify-client-build.mjs`、`tests/client-styles-ownership.test.ts`

**不做**：

1. 不改 CSS 内容与视觉：`src/client/styles/*.ts` 分片的规则、四态配色、节点尺寸、`@container` 档位一律不动
2. 不改 DSH 宿主 / 其它插件：不碰 `client-modules` 的认领与删除语义，不要求别的插件让路，不改官方槽位
3. 不改数据来源与交互：progress 请求、15s 轮询、SSE、详情面板、看板入口一律不动

## 档位依据（轻档）

- **L1 一句话目标 + 可证伪判定**：让本插件样式表在 DSH 的归属体系里**有主、可纠、可自愈**——判定见上方 A1–A7。
- **L2 范围边界**：见上「做」3 条、「不做」3 条，名单之外即本次不做。
- **L3 轻路径依据**：改动面 = 3 个 client 文件 + 1 个构建门禁脚本 + 1 个单测；归属语义已由 DSH 源码定死（`claimStyles` / `removeOwnedStyles` / 官方预设自带 `dataset.plugin`），无第二个未定决策。
- **L4 批准闸门 + 下一步**：下一步 = design；本文件落盘 → `reqboard_submit(kind=requirement)` 登记 → `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认，未获批准不得进入设计。
- **L5 轻档 ≠ 无产物**：本 `requirement.md` 即产物，落盘 + 登记 + 确认三步照走。
- **单向升级**：出现「要改 DSH `client-modules` 源码」「要引入第二张样式表 / 样式作用域隔离（shadow DOM）」「要把样式搬进构建期产物（HTML 预置）」任一信号，立即停手升级重档，不反向降级。

## 实施现状（已完成并通过全部实测，供记录与验收复核）

代码改动已在本次会话内落地、构建并通过下列实测（命令与结果摘要）：

| 项 | 命令 / 动作 | 结果 |
|----|------------|------|
| 单测（含可证伪） | `npx vitest run tests/client-styles-ownership.test.ts` | 6 passed；对修复前实现 5/6 **失败** |
| 类型检查（本包改动文件） | `npx tsc --noEmit -p tsconfig.json` | 改动文件 0 错误（仓内另有历史遗留错误，与本改动无关） |
| 构建门禁 | `pnpm build:client` | `[verify-client] OK … 样式归属章在场, CSS 分片完整` |
| 几何探针 | `npx tsx scripts/header-progress-probe.mts` | 六档 `problems=NONE`，`PROBE PASS` |
| 真实 GUI：归属章 | headless Chromium + 现有 GUI（1440×900） | `owners=["dsh-pmboard"]`（修复前 `null`） |
| 真实 GUI：认领+删除 | 复刻 `claimStyles` / `removeOwnedStyles` | 本表存活、`.dsh-pm-flow` 仍 `flex`、7 节点在 |
| 真实 GUI：自愈 | 手动删表 → 等 15s 轮询 | 表以正确归属恢复，流程图恢复横向样式 |
| 真实 GUI：HMR | 开着页面执行 `pnpm build:client` | 先 `remove`、**5ms 后** `append`，归属与 CSS 长度不变 |

证据截图：`evidence/header-flow-fixed.png`（修复后：横向胶囊 + 七圆点 + token + `24/24`）、
`evidence/header-flow-broken.png`（复刻的用户故障态：节点竖排）、
`evidence/header-flow-after-hmr.png`（HMR 重建后仍为横向胶囊）；
复跑步骤与 shell 算法复刻片段见 `evidence/README.md`。

## 总览

| 项 | 内容 |
|----|------|
| 现象 | 刷新 / 热替换后会话框右上流程图样式全丢（节点竖排、圆点与配色连线消失），且不自愈 |
| 根因 | 样式表无 `data-plugin` 归属章 + `apply()` 阶段才注入 → 被别的插件 `claimStyles` 认领，随后被其 `removeOwnedStyles` 连带删除 |
| 修复 | 归属章 + 归属纠正 + 工厂执行期注入 + 在屏自愈（+ 发版门禁与契约单测） |
| 契约来源 | DSH `packages/client/modules/src/client/system.ts`（claimStyles）、`entry-lifecycle.ts`（removeOwnedStyles）、`packages/client/tsdown.client.ts`（官方注入时机与 `dataset.plugin`） |
| 判定入口 | `npx vitest run tests/client-styles-ownership.test.ts` · `pnpm build:client` · `npx tsx scripts/header-progress-probe.mts` |
| 兼容/回滚 | 旧无主表按归属纠正接管，不重复插表；回滚 = 还原 3 个 client 文件（无数据迁移） |

## 下一步

design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t6 |
| FR-2 | ✅ 已接收 | t6、t2 |
| FR-3 | ✅ 已接收 | t1、t6 |
| FR-4 | ✅ 已接收 | t6、t3 |
| FR-5 | ✅ 已接收 | t6、t4 |
| FR-6 | ✅ 已接收 | t6、t5 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
