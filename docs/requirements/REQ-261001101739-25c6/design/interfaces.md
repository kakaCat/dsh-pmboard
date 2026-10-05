# REQ-261001101739-25c6 接口设计 · 注入契约 / 宿主契约 / 门禁契约 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

> 本需求**没有网络接口、没有新增函数签名、没有错误码**。对外契约只有四类：
> 本插件的注入函数、与 DSH client-modules 的归属契约、自愈调用点契约、构建门禁契约。
> 每条都写成可被单测 / 命令断言的形式。

## I-1 · `injectStyles()` 契约（唯一注入入口，幂等）`serves: FR-1, FR-2, FR-3`

文件：`src/client/styles.ts`

```ts
const PLUGIN_ID = 'dsh-pmboard'                 // 装载身份 = 包名（≠ UI 身份 PANEL_NAME，刻意不复用）
const CSS_TAG   = 'dsh-pmboard/styles.css'

export function injectStyles(): void {
  if (typeof document === 'undefined') return                      // 无文档环境：静默 no-op
  const existing = document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`)
  if (existing !== null) {
    if (existing.getAttribute('data-plugin') !== PLUGIN_ID) {      // 归属纠正（不重复插表）
      existing.setAttribute('data-plugin', PLUGIN_ID)
    }
    return
  }
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID                                   // ★ 归属章（本次修复的核心）
  tag.dataset.pluginCss = CSS_TAG
  tag.textContent = CSS
  document.head.appendChild(tag)
}

injectStyles()   // ★ 模块求值期调用 = bundle 工厂执行期（materialize 时被 claimStyles 登记）
```

| 输入 | 返回 | 副作用 | 前置 | 错误语义 |
|---|---|---|---|---|
| 无参数 | `void` | 至多追加一个 `<style>` 到 `document.head`；或把一个归属错误的既有表改回本插件 | `document` 存在 | **不抛**：无 `document` 直接返回；DOM 异常由调用方（宿主）处理，本函数不吞不转 |

不变量（单测锁定）：

| 编号 | 不变量 | 断言方式 |
|---|---|---|
| INV-1 | 任意多次调用后，`style[data-plugin-css="dsh-pmboard/styles.css"]` 恰好 1 个 | 连续调用 + 计数 |
| INV-2 | 新表必带 `data-plugin === 'dsh-pmboard'` | 属性断言 |
| INV-3 | 归属错误的既有表被**就地纠正**（表数量不变） | 预置无主表 → 调用 → 计数仍为 1 且归属正确 |
| INV-4 | 表被删除后再调用会补回一张，且归属正确 | 删除 → 调用 → 计数 1 |

## I-2 · 与 DSH client-modules 的归属契约（宿主侧，不可改，必须遵守）`serves: FR-1, FR-3`

出处：DSH `packages/client/modules/src/client/system.ts`（`claimStyles`）、
`packages/client/modules/src/client/entry-lifecycle.ts`（`removeOwnedStyles`）、
`packages/client/tsdown.client.ts`（官方 `styleInjectionModule`）。

| 宿主行为 | 语义 | 本插件的义务 |
|---|---|---|
| `claimStyles(ownerId)` | materialize 时把所有 `style:not([data-plugin])` 打上 `data-plugin=ownerId`，并把 `data-plugin-css` 记入该模块 owned 清单 | **必须自带 `data-plugin`**，否则被下一个 materialize 的插件认领 |
| `removeOwnedStyles(ownerId)` | 插件替换 / 裁剪时删除所有 `style[data-plugin=ownerId]` | **必须在工厂执行期完成首次注入**，否则模块替换后无人重建本表 |

`ownerId` 取值 = boot 图的 entry id = **包名**（DSH 源码注释原文：`@param id - entry id (package name)`），
本插件即 `dsh-pmboard`（与 `scripts/wrap-client.mjs` 写入的 `__ModuleLoader__.load({ id })` 同源）。

修复前 vs 修复后（同一算法下的行为差）：

| 步骤 | 修复前 | 修复后 |
|---|---|---|
| 本插件 materialize | 未注入（`apply()` 晚于此处）→ owned 清单为空 | 工厂已注入 → 本表登记为**本插件所有** |
| 别的插件 materialize | `claimStyles(它)` 把本表认领走 | 本表已有 `data-plugin`，跳过 |
| 别的插件被替换 | `removeOwnedStyles(它)` **删掉本表** | 与本表无关，不删 |
| 本插件被替换 | `removeOwnedStyles(本插件)` 删不到本表 → 新旧两张表并存（样式表泄漏） | 正确删除本表；新工厂重跑立即重建（≈5ms） |

## I-3 · 自愈调用点契约 `serves: FR-4`

| 调用点 | 时机 | 频率 | 幂等代价 |
|---|---|---|---|
| `src/client/index.ts` `apply()` | 插件激活 | 每次激活 1 次 | 1 次 `querySelector` |
| `src/client/conversation-progress.ts` | 会话头部流程图在屏期间，**每次数据刷新后**（挂载 / 15s 轮询 / 会话切换触发的 state 更新） | ≤ 每 15s 1 次 | 同上 |
| `src/client/page/host.ts` | 看板页面挂载 | 每次挂载 1 次 | 同上 |

契约：自愈调用**不得**（a）重复插表、（b）改动既有表内容、（c）在渲染路径上同步抛错。
因此实现上只在 `useEffect` 里调用（不在 render 期间做 DOM 副作用），且 `injectStyles()` 本身幂等且不抛。

## I-4 · 构建门禁契约 `serves: FR-5, FR-6`

文件：`scripts/verify-client-build.mjs`（`pnpm build:client` 的最后一环）

| 检查 | 判据 | 失败行为 |
|---|---|---|
| 关键符号（既有） | 产物含 10 个 `dsh-pm-*` class 锚点 | 非零退出并列出缺失符号 |
| **归属章（新增）** | 产物同时含 `dataset.plugin=` 与 `dataset.pluginCss=` | 非零退出，指名「产物缺少样式归属章（刷新后样式全丢）」 |
| CSS 分片完整（改造） | `src/client/styles/*.ts` 每份以模板字符串收尾（`` ` `` 或 `` `; ``） | 非零退出并指名分片 |
| `styles.ts` 接口在位（新增） | 仍含 `injectStyles(` 调用 | 非零退出（t7 事故的另一种形态：接口被删） |
| wrap 污染（既有） | 产物含顶格 `/*WRAP_SENTINEL_MARKER*/` | 非零退出 |

单测契约：`tests/client-styles-ownership.test.ts` 用最小 DOM 替身**逐条复刻** `claimStyles` / `removeOwnedStyles`，
断言 I-1 的四条不变量与 I-2 的「认领不走 / 删除删不掉」；
对修复前实现应 **5/6 失败**（可证伪，见 `test-cases.md` T-6）。
