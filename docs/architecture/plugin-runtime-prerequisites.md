# 插件运行前提（L2 领域篇）

> **TL;DR**：本插件（`dsh-pmboard`）能否在宿主里被加载，取决于**三个外部前提**：profile 的 bundles
> 列了它、`package.json` 声明了 `dsh.bundle.patch`、**且该 patch 文件真实可读**——第三条缺失时
> 加载器会**静默跳过整个 bundle**（工具、看板路由、提示词注入全不注册）。另外，**重建 `dist` 不会
> 自动生效**：宿主在启动时加载模块，重建后必须重启，且"是否真的加载了新构建"要显式核对。

## 一、加载链（任一环断 → 插件整体消失）

```
profile 的 dsh.profile.bundles  ──►  包的 package.json  ──►  patch 文件可读  ──►  插件行进入有效条目
     列出 dsh-pmboard              声明 dsh.bundle.patch      cordis.patch.yml         （工具/路由/注入注册）

任断一环的后果：skippedBundles ← 只有 stderr 一行：
  dsh: skipping profile bundle "dsh-pmboard": failed to read overlay …/cordis.patch.yml: ENOENT
```

**为什么值得单列**：这条链断掉时，agent 侧的表现是"工具凭空消失"（`unknown tool`），而板子与宿主都还活着；
2026-09-30 就因此排查了约 25 分钟——**重启无效**，因为文件仍然不存在。

### 一句话核对（不重启即可判定）

```bash
# 用 DSH 自己的加载器复现组合过程：skippedBundles 里不该有本插件，且有效条目里应有 pmboard 行
node --input-type=module -e "
const m = await import('<dsh-checkout>/packages/boot/app-boot/lib/index.js')
const p = m.loadProfileDirectory('dsh', '<profile 目录>', '<app 的 dsh/package.json>')
console.log(p.skippedBundles, m.composeEntries([...p.layers.map(l=>l.patches), p.patches]).find(e=>e.id==='pmboard'))
"
```

## 二、构建产物 ≠ 已加载模块（"重启了但没生效"）

| 事实 | 核对方式 |
|---|---|
| 宿主在**启动时**加载 `dist/index.mjs`；重建不会自动生效 | 比对宿主进程启动时间与 `dist/index.mjs` 的 mtime |
| "新构建是否真被加载"不能靠感觉 | `grep -c '<本轮新增的符号>' dist/index.mjs` 确认产物含改动；再看宿主启动时间是否晚于该 mtime |
| 同一个仓库里"重启"可能加载到**更旧**的构建 | 事故实例：`dist` 20:23 重建，宿主 19:44 启动 → 重启静默无效，验收单仍呈旧行为 |

**产品级可见信号**：旧构建生成的验收单会呈现被修复前的形态（跳号、多行同名）——"单据本身"是最直观的对照证据。

## 三、源码树与构建产物必须自洽（2026-09-30 三连事故）

| 事故 | 现象 | 判据 |
|---|---|---|
| 缺 4 个被 import 的源码模块 | 测试**加载失败**（不是断言失败） | `Failed to load url ../internal/auto-confirm.js` |
| 缺 patch 文件 | 插件被整体跳过 | `skipping profile bundle …: ENOENT` |
| 文件语法损坏（两行语句挤一行） | `tsdown` 直接 PARSE_ERROR；`tsc` 报 TS1005 | 构建日志 `[PARSE_ERROR] … AcceptSheet.ts:160` |

**共同根因**：多个会话共用同一工作树 + 覆写式同步删除未被跟踪的文件。**防复发**：
① 关键文件（patch 文件、`docs/`、新建源码/测试）纳入 git；② 每个会话用独立 worktree（`.worktrees/REQ-xxx`）；
③ 复原缺失模块时可从 `dist/index.mjs` 的 `//#region src/...` 源码段逐字取回（构建产物是源码的忠实镜像）。
