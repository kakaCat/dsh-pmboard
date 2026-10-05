# 缺陷报告：模型选择器点击后消失（React #130 → 席位退役）

- **状态**：根因已定位并**于 2026-10-04 更正**｜**归属**：**本机对已安装客户端手工打过补丁**（用本地 checkout 构建的 `ui-primitives` 覆盖了官方包），**非本仓、也非厂商安装包自带**
- **报告时间**：2026-10-04 10:0x（本地）；更正时间 2026-10-04 11:0x（用户反馈 `/model` 也不好使后升级取证）
- **需求**：REQ-261004095621-c167（本报告即 FR-3 的「DSH 侧」交付物）
- **一句话**：编辑器里的模型选择器一**点开菜单**就空白消失——因为它的渲染依赖 `MenuGroup` / `observeStickyMenuGroups` 两个 primitives 导出，而**安装包里的 `ui-primitives` 被换成了本机 checkout 的本地构建**（缺这两个导出），React 抛 `#130: element type is invalid (got undefined)`，DSH 插槽随即把该席位退役。

> **更正说明（重要）**：初版报告把归属写成"厂商安装包内部不一致"。用户随后反馈「`/model` 命令也不好使」，
> 触发第二轮取证：安装包里的 `ui-primitives` 与本机 checkout 的本地构建**逐字节相同（0 差异）**，
> 且带**官方两版都没有**的本地新增符号（`IconBellOutlineRegular`）——因此归属更正为**本机手工补丁**。
> 官方安装包本身没问题（npm 上的 rc.1 / rc.2 都不含该符号，也不缺 `MenuGroup`）。

## 1. 现象与复现

| 项 | 内容 |
|---|---|
| 现象 | 点会话编辑器的模型控件 → 控件变空白、工具栏里那一格永久消失（无任何报错提示） |
| 复现 | 桌面端（macOS）任意会话，点模型控件一次即现；刷新页面（⌘R）后控件回来，再点再现 |
| 触发点 | **打开菜单时**（不是选模型时）：菜单里按 provider 分组渲染会用到 `MenuGroup` |
| **同类连带** | **`/model` 命令同样不可用**（2026-10-04 用户反馈）：命令弹层与其它菜单走同一批缺失 API——**换模型的 GUI 通路全断** |


## 2. 运行时证据（用户控制台原文）

```
client.js:618 slot entry crashed in 'conversation.input.model':
  Error: Minified React error #130; ... args[]=undefined&args[]=
    at bi (index-D3lhVe4j.js:56:49799) ... at ia (index-D3lhVe4j.js:56:36178)
componentDidCatch @ client.js:618
```

- React error **#130** = `Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined`；
  参数 `args[]=undefined` = **该元素的 type 是 `undefined`**。
- `slot entry crashed in 'conversation.input.model'` 由 DSH 的 `SlotErrorBoundary.componentDidCatch` 打出；
  非 chain 席位**崩溃一次即退役**（`abdicate`），空席位渲染成空白 `div[data-slot-error]` —— 即用户看到的"消失"。

## 3. 静态证据（安装包内部自相矛盾）

安装包：`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`（app 版本 **0.2.0-rc.2**；客户端包只从 app.asar 提供，profile 下无覆盖）

| # | 检查 | 结果 |
|---|---|---|
| E1 | 安装版 `@deepseek-ai/dsh-client-ui-model-selection/lib/client.js` 是否使用 primitives 的 `MenuGroup` / `observeStickyMenuGroups` | **用了**：`jsx(primitives.MenuGroup, {label, children})`（分组渲染）+ `observeStickyMenuGroups(viewport)`（吸顶分组） |
| E2 | 安装版 `@deepseek-ai/dsh-client-ui-primitives/lib/index.js` 是否提供这两个导出 | **都没有**：`grep -c MenuGroup` = **0**，`grep -c observeStickyMenuGroups` = **0**（该文件 526,775 B，sha256 `74d730cf…`） |
| E3 | 全 app.asar 里除 model-selection 之外还有谁提供这两个符号 | **没有**：`MenuGroup` 命中仅出现在 README、model-selection、ui-commands 等**使用方**；无任何 provider |
| E4 | npm 上**已发布**的 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` 是否提供 | **提供**：`MenuGroup` 7 处（`grep -c` 计 6 行，另有一行含两次）、`observeStickyMenuGroups` ×2（530,719 B，sha256 `6b551f00…`） |
| E5 | 是否存在 profile 局部覆盖（`~/.dsh/profiles/desktop/node_modules`） | **没有**：只有 `dsh-pmboard`、`dsh-notice-webhook` 两个 link 包 |
| E6 | 安装版 primitives 里是否有**官方两版都没有**的本地新增符号 | **有**：`IconBellOutlineRegular` ×2（本机 checkout 未提交改动新增的铃铛图标；官方 rc.1 / rc.2 均为 0） |
| E7 | 安装版 primitives 与本机 checkout 本地构建逐字节比较 | **逐字节相同**：对齐 526,775 字节、差异 **0** 字节（`~/Documents/ai/dsh/deepseek-harness/packages/client/ui-primitives/lib/index.js`，构建于 10-03 12:43:52） |
| E8 | 时间线 | 客户端安装/解包：**09-29 17:55**；`app.asar` 本体被写：**10-03 21:15:52**（晚于安装 4 天，且晚于本地构建 8.5 小时）；官方 feed 最新构建为 **0.2.0-rc.2 / 2026-09-29** |

> **E2 + E6 + E7 联合结论（更正后）**：安装包里的 `ui-primitives` **就是本机 checkout 的本地构建**（rc.1 一脉 + 本地铃铛改动 → 没有 `MenuGroup`），
> 而 `ui-model-selection` 仍是官方 rc.2 新版（需要 `MenuGroup`）——**同一 app.asar 内官方包与本地包混装**。
> E8 的 asar 写入时间与 E7 的逐字节相同，共同指向**本机手工覆盖了 app.asar 内的这个包**（不是厂商安装包自带缺陷）。
> 于是运行时 `primitives.MenuGroup === undefined` → 打开菜单 → `React #130` → 席位退役；任何用到缺失 API 的菜单/弹层（含 `/model`）同样崩。
>
> 另：本脚本对该 asar 的**数据区基址做了自校准**才能正确取文件（`--local` 对照输出里有提示）——非标准打包的旁证。

### 3.1 可复核命令

**一条命令版（推荐，零第三方依赖；提取 + 对标发布版 + 本地补丁检测 + 逐字节对照）**：

```bash
node docs/requirements/REQ-261004095621-c167/evidence/extract-asar.mjs \
  --local ~/Documents/ai/dsh/deepseek-harness/packages/client/ui-primitives/lib/index.js
# 实测输出（2026-10-04）：
#   | MenuGroup               | 使用方 2 | 安装版 0 | 发布版 7 | **缺符号 → 安装自相矛盾** |
#   | observeStickyMenuGroups | 使用方 1 | 安装版 0 | 发布版 2 | **缺符号 → 安装自相矛盾** |
#   | rankByName              | 使用方 1 | 安装版 2 | 发布版 2 | 一致 |
#   ## 本地补丁检测
#   | IconBellOutlineRegular  | 安装版 2 | 发布版 0 | **本地新增符号 → 安装包被本地构建覆盖** |
#   本地构建对照：对齐 526775 字节，差异 0 字节（**逐字节相同 = 安装包里的就是这份本地构建**）
#   结论：本机手工打补丁造成 → 用官方安装包重装/更新；不要再部分覆盖 app.asar
# 换路径：--asar "<其它 app.asar>"；CI 用 --strict（发现问题退出码 1）
```

**手工版（想逐步核对时用）**：

```bash
# 1) 从 app.asar 提取两个包（asar 是未压缩归档，按 header JSON 取 offset/size）
#    见 evidence/extract-asar.mjs 的 asarReader()（同一口径）
# 2) 判定安装包是否提供符号
grep -c MenuGroup          /tmp/asar-ui-primitives.js      # => 0（安装包：缺）
grep -c observeStickyMenuGroups /tmp/asar-ui-primitives.js # => 0（安装包：缺）
grep -c MenuGroup          /tmp/asar-ui-model-selection.js # => 2（使用方：要）
# 3) 与已发布 rc.2 对照
npm pack @deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2
tar -xzf deepseek-ai-dsh-client-ui-primitives-0.2.0-rc.2.tgz
grep -c MenuGroup package/lib/index.js                     # => 6（发布版：有）
# 4) 席位健康度（修复前/后都用这条判定）
#    cordis_inspect_query(platform=client, provider=Slots, method=listSubTree,
#                         input={root:"conversation.input.model"}) => occupants[0].active
```

## 4. 为什么与 dsh-pmboard（本仓）无关

| 判据 | 结论 |
|---|---|
| 席位占用者 | `conversation.input.model` 唯一占用者 registrant = **`mf`（DSH 自带 UI 包）**；本仓 client 源码里没有该 slot 名 |
| 本仓注册面（实测） | 会话头进度条（`conversation.session.header.utilities`）、9 张业务工具卡（`tool.call.toolview`）、`main` 两键、`sidebar.panellist` 两项——**不含编辑器工具栏任何席位** |
| 全局副作用 | 本仓不打自有 React（`require("react")` 共享）、不 patch 服务/fetch、CSS 全 `.dsh-pm-` 前缀、DOM 操作限定自有容器 |
| 时间线 | 崩溃发生在菜单渲染路径里，即使用了本仓也解释不了 `MenuGroup` 缺失 |

（本仓另有一处**已修**的同类缺陷：知识库侧栏图标此前返回裸对象元素 → 同样被席位退役；已改 `createElement` 并加 `$$typeof` 断言，线上 `sidebar.panellist` 的 `pmboard-knowledge` 已由 `active:false` 恢复为 `active:true`。两者是**同类机制的两个独立实例**，不是同一起因。）

## 5. 修复建议

1. **用官方安装包重装/更新 DeepSeek Harness 客户端**（唯一正解）：官方 feed `https://download.deepseek.com/dsh-desk/feeds/mac-arm64/nightly-mac.yml`
   当前构建为 **0.2.0-rc.2 / 2026-09-29**（zip ≈374 MB）——重装即恢复官方包，模型选择器与 `/model` 一并恢复。
2. **不要再把单个本地构建的文件塞进 `app.asar`**：本次故障就是这么来的（本地 `ui-primitives` 覆盖了官方包，而 `ui-model-selection` 仍是官方新版）。
   要改客户端外观/组件，请**整包重建**（所有 client 包同源）或走插件扩展点，不要部分覆盖。
   ⚠️ 在应用内改 `app.asar` 还会破坏签名，且不随更新存活（本机已无原始 asar 备份）。
3. 修复验证（一条命令看结果）：
   `Slots.listSubTree(root='conversation.input.model')` → `occupants[0].active === true`，且连点 3 次不退化为 `false`。
4. **临时规避（本地已实测的边界）**：
   - `/model` 命令**同样不可用**（同一批缺失 API，换模型的 GUI 通路全断）——不要把它当退路；
   - 唯一还能换模型的办法是改 profile 的 `agent-default-model` 配置（`~/.dsh/profiles/desktop/cordis.patch.yml`）后**新建会话**（需重启宿主；只影响新会话，且不修复任何界面）；
   - ⌘R 可让模型控件回来（但再点仍会崩）。
5. **不可行的旁路（已排除，省得白试）**：把发布版 primitives 塞进 profile 做覆盖——DSH 的 client 模块图按 Loader 条目解析包，
   （`@deepseek-ai/dsh-client-modules` README：同名“Distinct active Loader sources resolving to one package name are rejected”）**同名冲突会被拒绝**，profile 覆盖不生效。

## 6. 环境快照

| 项 | 值 |
|---|---|
| 客户端版本 | app.asar 内各 `@deepseek-ai/dsh-client-ui-*` 标称 **0.2.0-rc.2**（官方 feed 最新同为 rc.2 / 2026-09-29） |
| 本仓所在 checkout | `deepseek-harness` HEAD = `b30834f592`（release `0.2.0-rc.1` + 1 docs commit）；工作区含未提交改动（如 primitives 的铃铛图标） |
| 时间线 | 安装/解包 09-29 17:55 → 本地 primitives 构建 10-03 12:43:52 → **app.asar 被写 10-03 21:15:52** |
| 触发依赖 | `MenuGroup`、`observeStickyMenuGroups`（primitives 导出，rc.2 新增；本地 rc.1 一脉构建没有） |
| 报告人 | 本窗口（REQ-261004095621-c167）｜更正轮次：用户反馈 `/model` 不好使后 |
