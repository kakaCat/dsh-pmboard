# REQ-261001101739-25c6 架构设计 · 样式表归属生命周期 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 轻档：本需求无新组件、无新依赖、无网络接口；架构上只有一条**生命周期归属链**要修正。
> 每章标题行带 `serves: FR-x`；判定口径见 `test-cases.md`。

## TL;DR `serves: FR-1, FR-3`

本插件在 `<head>` 里注入的一张样式表（约 123 KB / 997 条规则，插件全部界面共用），
在 DSH 的 client-modules 里是**有主之物**：宿主按 `data-plugin` 归属登记与删除它。
此前我们既不带归属章、又在 `apply()`（materialize 之后）才注入，于是它一直「无主」，
被下一个 materialize 的别的插件认领走，随后被那个插件装卸时的整批删除连带删掉 ——
而本插件的 `apply()` 不会因此重跑，样式**永不恢复**。

修法 = 把「注入 → 归属 → 删除 → 重建」这条链对齐宿主契约：

```
修复前                                  修复后
apply() 注入无主 <style>                工厂执行期注入，自带 data-plugin=dsh-pmboard
   │                                       │
   ▼ claimStyles(别的插件) 认领走           ▼ claimStyles 跳过（已有主），登记为本插件所有
别的插件 HMR 替换 → removeOwnedStyles(它)  本插件 HMR 替换 → removeOwnedStyles(本插件)
   │                                       │
   ▼ 本表被删，apply() 不重跑               ▼ 新工厂重跑 → 立即重新注入（≈5ms）
   样式永久丢失（只能刷新撞时机）            样式无空窗；另有在屏自愈兜底
```

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

```
        ┌─────────────────────────── 本插件 client bundle（工厂执行期） ──────────────────────────┐
        │  styles.ts                                                                             │
        │    PLUGIN_ID = 'dsh-pmboard'  ──┐                                                      │
        │    injectStyles()               ├─► <style data-plugin="dsh-pmboard"                   │
        │      ├─ 无表 → 建表 + 盖归属章 ─┘        data-plugin-css="dsh-pmboard/styles.css">      │
        │      └─ 有表但归属错 → 就地纠正归属（不重复插表）                                       │
        │    injectStyles()  ← 模块求值期调用（= 工厂执行期）                                     │
        └────────────────────────────────────────────────────────────────────────────────────────┘
                     ▲                                   ▲                              ▲
                     │ 幂等自愈                           │ 幂等自愈                      │ 幂等调用
        conversation-progress.ts（流程图，15s 轮询 effect）  page/host.ts（看板挂载）      index.ts apply()
                     │                                   │                              │
        ┌────────────┴───────────────────────────────────┴──────────────────────────────┴────────┐
        │ DSH client-modules：materialize → claimStyles(owner)   替换/裁剪 → removeOwnedStyles(owner) │
        └────────────────────────────────────────────────────────────────────────────────────────┘
                     ▲
                     │ 发版前静态门禁
        scripts/verify-client-build.mjs（产物必须含 dataset.plugin= / dataset.pluginCss=）
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/client/styles.ts` | 改 | 新增 `PLUGIN_ID`；新建表时写 `data-plugin`；已存在但归属不符时就地纠正；文件末尾（模块求值期）调用 `injectStyles()` | FR-1、FR-2、FR-3 | 插件全部界面的样式注入；旧无主表被接管 |
| `src/client/conversation-progress.ts` | 改 | 新增一个 effect：数据每次刷新后确认样式表在场 | FR-4 | 会话头部流程图在屏期间 |
| `src/client/page/host.ts` | 改 | 看板页面挂载时调用一次 `injectStyles()` | FR-4 | 看板页面在屏期间 |
| `src/client/index.ts` | 不改 | `apply()` 里原有的 `injectStyles()` 保留（幂等） | FR-3 | 无行为变化 |
| `scripts/verify-client-build.mjs` | 改 | 新增「产物必须含归属章」硬阻断；CSS 截断信号改挂到 `styles/*.ts` 分片 | FR-5 | 发版链路（`pnpm build:client`） |
| `tests/client-styles-ownership.test.ts` | 新增 | 逐条复刻宿主认领/删除算法的契约单测 | FR-6 | 单测套件 |
| `src/client/styles/*.ts` | 不动 | CSS 规则、四态配色、节点尺寸、`@container` 档位一律不变 | —— | 视觉零回归 |

## 归属生命周期（对齐宿主契约）`serves: FR-1, FR-2, FR-3`

宿主侧事实（DSH 源码，非本插件可改）：

| 时机 | 宿主动作 | 对无主表的后果 |
|---|---|---|
| 任意模块 materialize | `claimStyles(ownerId)`：把所有 `style:not([data-plugin])` 打上 `data-plugin=ownerId`，并把 `data-plugin-css` 记入该模块的 owned 清单 | **被误认领**（root cause） |
| 插件 HMR 替换 / 图行裁剪 / 卸载 | `removeOwnedStyles(ownerId)`：删除所有 `style[data-plugin=ownerId]` | **被连带删除** |

本插件侧义务（本次实现的三条）：

1. **always 盖章**：本表永远带 `data-plugin = 'dsh-pmboard'`（装载 id = 包名，与 `__ModuleLoader__.load({ id })` 同源）→ `claimStyles` 的第一轮循环（`style:not([data-plugin])`）跳过本表，谁也认领不走；
2. **工厂执行期注入**：在 bundle 工厂执行时注入，`claimStyles` 的第二轮循环把本表登记为**本插件所有**（`record.styles`）→ 本插件自己的替换流程才会（正确地）删除并重建它；
3. **幂等 + 可纠正 + 自愈**：表存在且归属正确 → 什么都不做；归属错误 → 就地纠正；表被任何来源删除 → 下一次注入调用补回。

## 兼容与迁移 `serves: FR-2`

| 场景 | 处理 |
|---|---|
| 文档里残留**旧的无主表**（修复前 bundle 注入的） | `injectStyles()` 按 `data-plugin-css` 找到它 → 归属纠正为本插件，**不重复插表**；表数量恒为 1 |
| 旧表内容与新表同源（本需求未改 CSS） | 无需刷新即可被后续自愈接管；若确有内容差异，本插件自己的替换流程会删旧建新 |
| 归属 id 与宿主装载 id 不一致（用户改了入口名） | 只影响「本插件替换时能否删到本表」；本表仍有主（不会被别的插件连带删除），且工厂重跑时按 `data-plugin-css` 判存在 → 不会重复插表，样式始终在场 |
| 无 `document` 环境（node 单测 / host 半） | `typeof document === 'undefined'` → 静默 no-op |

## 回滚路径 `serves: FR-1`

改动只落在 3 个 client 文件 + 1 个构建门禁脚本；回滚 = 还原这 4 个文件（`git checkout -- src/client/styles.ts src/client/conversation-progress.ts src/client/page/host.ts scripts/verify-client-build.mjs`），
无数据迁移、无持久化状态、无接口破坏。
