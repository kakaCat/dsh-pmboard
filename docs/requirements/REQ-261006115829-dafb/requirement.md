---
requirement_refs: [FR-1, FR-2, FR-3]
sides: [doc]
---

# 需求说明（REQ-261006115829-dafb 桌面端「插件包 rev 过期」报错：判据沉淀为排查条目）

> 本文档面向：下一个看到这条控制台报错的人（含未来的自己）。
> 它**不是**一份改代码的需求——排查结论是「插件没坏」，要交付的是**把判据留下来**。

## TL;DR <!-- serves: FR-1 -->

- **这是什么**：把「桌面端控制台出现 `plugins/??…&rev=…` 404 与 `plugins/events` net::ERR_FAILED」这条现象，
  沉淀成一条**可当场判定**的排查条目（症状 → 判据 → 机制 → 处置）。
- **为什么现在做**：这两条看着像插件坏了（2026-10-06 用户就是这样报的），实测是「重建/重启期间页面拿着过期 rev」
  的一次性竞态，页面会自愈；但仓里**没有任何地方记录这条判据**，下次还得从宿主路由重查一遍。
- **做完得到什么**：照着条目跑三条命令（几十秒）就能判定「噪声还是真缺陷」；条目里连着机制出处与处置动作。

## 业务流程图 <!-- serves: FR-1 -->

```
报错的人 ──看到控制台红字──▶ 翻 docs/guides/plugin-reload-troubleshooting.md
                                  │
                                  ├─ 症状区：认得这两条（包 rev 过期 404 / HMR SSE 断线重连）
                                  ├─ 判据区：三条命令 → 200 / 404 / 200（当场复核）
                                  ├─ 机制区：rev 怎么来、为什么会过期、谁负责重试
                                  └─ 处置区：先刷新页面；仍红再按「取证」留 URL 与 Network 记录
```

## 产品定义 <!-- serves: FR-1 -->

**一句话**：一份「插件没坏，是页面手里的 rev 过期了」的排查条目——把读者从「怀疑插件坏了」带到「刷新页面即可」，
全程有可跑命令兜底，不靠猜。

**三要素检查**：

- **是什么**：`docs/guides/` 下的一个故障排查条目页（本仓故障排查的落点）。
- **核心价值**：把一次「从头查宿主路由与构建产物」的排查（2026-10-06 实测约十几分钟）压缩成几十秒的判定。
- **与现状的区别**：现状是**没有这条记录**——同样的两条报错，第二次、第三次出现仍然要重新推导。

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 本插件开发者 | 改了 `src/client/**` → `pnpm build:client` + 重启宿主，而页面一直开着 | 控制台冒出 404/ERR_FAILED，第一反应是「我把插件改坏了」，实际是 rev 过期 |
| 用户 / PM（报障方） | 看到控制台红字来报「报错了」 | 没有判据可自查，只能把两条文本丢给 agent 从头查 |
| 下一个接手的人 | 排查「页面没拿到新代码」这类问题 | 仓内没有「rev 过期 → 404」这条判据，也不知道 404 与 ERR_FAILED 是两件事 |

## 功能点（需求条款） <!-- serves: FR-1 -->

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 新增排查条目页：读者翻 `docs/guides/plugin-reload-troubleshooting.md` 就能按四段（症状/判据/机制/处置）判定这两条报错 | P0 |
| FR-2 | 条目挂进入口：从说明书与插件运行前提页各能一步点到，不留孤儿页 | P0 |
| FR-3 | 判据可跑：条目给出三条命令与期望输出，把「噪声 vs 真缺陷」当场判定 | P0 |

---

### FR-1: 新增排查条目页

**功能描述**：读者打开 `docs/guides/plugin-reload-troubleshooting.md`，按「症状 → 判据 → 机制 → 处置」四段读完，就能判定手上那两条报错是什么。

**详细说明**：

- **使用场景**：桌面端（`dsh-app://app/`）控制台出现插件包 404 或 `plugins/events` ERR_FAILED，且不确定是不是插件坏了。
- **操作流程**：
  1. 读者在 `docs/guides/` 下找到条目页（或从 FR-2 的入口链过来）；
  2. 症状区比对两条文本（`plugins/??<包>/client.js&rev=…` 404 / `plugins/events` net::ERR_FAILED）；
  3. 判据区按 FR-3 的三条命令当场复核；
  4. 处置区按结论动作：刷新页面（噪声）或按「取证」继续（仍红）。
- **预期结果**：
  - 四段齐全，且「处置」一段在首屏可见（不用滚到底）；
  - 每条报错都能对上一条机制解释（谁发的请求、为什么失败、谁会重试）。
- **边界条件**：
  - 报错 URL 不是插件包地址（例如 `/dashboard/…`、`/api/file?path=…`）→ 页内明说「本条目不覆盖，去查对应路径」；
  - 宿主不可达（curl 连不上）→ 归到「真问题」分支，不判噪声。

**验收标准**：

1. `ls docs/guides/plugin-reload-troubleshooting.md` → 文件存在；
2. `grep -c "plugins/events" docs/guides/plugin-reload-troubleshooting.md` → ≥ 1，且四段标题（症状/判据/机制/处置）各出现一次；
3. `grep -n "rev" docs/guides/plugin-reload-troubleshooting.md` → 命中机制区（说明 rev 的来源与过期判据）。

---

### FR-2: 条目挂进入口

**功能描述**：从说明书与插件运行前提页各有一条链指向新条目，读者不必先知道文件名。

**详细说明**：

- **使用场景**：读者从项目说明书（`docs/architecture/project-manual.md`）或插件运行前提页（`docs/architecture/plugin-runtime-prerequisites.md`）出发找排查路径。
- **操作流程**：
  1. 在 `docs/architecture/project-manual.md` 的索引区加一行（现象 → 新条目链接）；
  2. 在 `docs/architecture/plugin-runtime-prerequisites.md` 的「构建产物 ≠ 已加载模块」一节加一条回链（含一句机制结论：包地址带 rev，rev 过期即 404）。
- **预期结果**：两处各有一条入链；新条目不是孤儿页。
- **边界条件**：不动这两页的既有结论与表格结构，只做**新增**（增量，不改判据）。

**验收标准**：

1. `grep -rn "plugin-reload-troubleshooting" docs/architecture/` → 命中 ≥ 2 个文件；
2. `grep -n "rev" docs/architecture/plugin-runtime-prerequisites.md` → 回链那一行带机制说明（不是裸链接）。

---

### FR-3: 判据可跑

**功能描述**：条目里给出三条命令及期望输出，读者当场能区分「噪声」与「真缺陷」。

**详细说明**：

- **使用场景**：读者已经看到报错，需要 30 秒内得到结论。
- **操作流程**：
  1. 取当前客户端包地址（宿主 `/plugins/events` 的图帧里带 `dsh-pmboard/client.js&rev=…`）；
  2. 原样请求 → 期望 `200`；
  3. 把 `rev=` 改成一个不存在的值再请求**同一个地址** → 期望 `404`（这就是报错里那条 404 的成因）；
  4. 请求 `/plugins/events` → 期望 `200` 且 `content-type: text/event-stream`（HMR 通道本身是活的）。
- **预期结果**：三条输出的组合能唯一区分「rev 过期（噪声）」与「宿主路由/插件真的没注册（真缺陷）」。
- **边界条件**：
  - 命令里的端口与 rev 必须标明是「当前环境实测值」，逐次实测取值，不得写成常量；
  - 只读命令（不写台账、不改状态），可反复跑。

**验收标准**：

1. 三条命令在 2026-10-06 的环境里实测输出为 `200` / `404` / `200`（与文中一致）；
2. 条目里写明每条的期望输出与「不符时怎么办」；
3. 条目声明了取证方式：DevTools → Network 按状态码筛 404，保留完整 URL。

---

## 边界（不做什么） <!-- serves: FR-1 -->

- **不改运行时代码**（`src/**`、`dist/**`、`lib/**`）：根因在宿主与桌面壳，不在本插件；本需求只交付文档。
- **不做页面自动 reload**：会打断用户输入；且插件已有「插件已更新」构建戳提示与陈旧/失败红条（`panel-freshness`）。
- **不新增或修改 host 接口与 SSE 协议**：`/dashboard/api/reqboard/events` 等一律不动。
- **不动 DSH 装机产物**（`app.asar` 只读且越界）：条目只写「机制出处」，不改壳的行为。
- **不做通用「前端报错手册」**：本次只覆盖「插件包 rev 过期 / HMR 通道断线」这一族现象，别的报错留给各自条目。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 用户（2026-10-06 直接消息）：「Failed to load resource: the server responded with a status of 404 (Not Found)」「Failed to load resource: net::ERR_FAILEDdsh-app://app/plugins/events:1」「报错了」 | 把这两条报错当一条需求排查，先判「噪声 vs 真缺陷」，不先动代码 | FR-1 | 验收标准 1 的判定命令集 |
| D-2 | 用户（立项弹框「确认 404 的地址」选中）：「是 plugins/??…&rev=… 这种插件包地址」 | 404 = 插件包 rev 过期（重建/重启竞态），不是本插件缺陷 | FR-1、FR-3 | FR-3 验收标准 1（同一地址 200 / 改 rev 404） |
| D-3 | 用户（产物范围弹框选中）：「结论 + 把判据沉淀成排查条目（文档，推荐）」 | 产物 = 排查条目文档（guides）+ 入口回链；不改运行时代码 | FR-1、FR-2、FR-3 | 验收标准 4（改动只在 docs/） |

## 非功能需求 <!-- serves: FR-1 -->

- **可读**：条目页 ≤ 120 行，30 秒内能定位到「处置」一段。
- **可复跑**：每条命令给出命令原文 + 期望输出（`200` / `404` / `200`），禁用「应该能」「一般会」这类措辞。
- **零依赖**：不新增依赖、不要求联网、不需要构建。

## 验收标准（整体） <!-- serves: FR-1 -->

1. `ls docs/guides/` → 含 `plugin-reload-troubleshooting.md`；`grep -c "plugins/events"` ≥ 1，四段标题齐全。
2. `grep -rn "plugin-reload-troubleshooting" docs/`（排除条目自身）→ 入链 ≥ 2，且分别落在 `project-manual.md` 与 `plugin-runtime-prerequisites.md`。
3. 条目里的三条命令实测与文中一致：当前批量包地址 → `200`；同一地址改错 `rev` → `404`；`/plugins/events` → `200` + `text/event-stream`。
4. `git diff --name-only` 的改动**只有 `docs/**`**（无 `src/`、`dist/`、`lib/`）。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 产物形态 | 改客户端代码，把「页面旧了该刷新」做得更显眼 | 只写文档 | D-3；且面板已有构建戳比对提示与陈旧/失败红条——重复造提示收益低 |
| 落点 | 只往 `docs/architecture/plugin-runtime-prerequisites.md` 追加一节 | 新建 guides 条目 + architecture 页回链 | 仓内规范：故障排查进 `guides/`、机制性根因进 `architecture/`（该页已有「事故 + 判据」的写法） |

## 技术方案与亮点

- **只动文档**，把「判据」写成**对照实验**：同一个包地址不改 `rev` → 200，改错 `rev` → 404——读者不必理解 rev 的合成算法（mtime/ctime/size）也能判定。
- 两条报错**分行解释**：404 是包地址失效，ERR_FAILED 是长连接被掐断（宿主重启/页面卸载），两者成因不同、处置相同（刷新）。
- 详细机制口径写进 `docs/architecture/plugin-runtime-prerequisites.md` 的回链节，需求层面只定结论。

## 依赖与约束 <!-- serves: FR-1 -->

- **依赖（强）**：DSH 桌面壳的转发行为——`dsh-app://app/**` 一律转发给宿主，只有 `/`、`/index.html`、`/assets/**`、`/favicon.svg`、`/manifest.webmanifest` 走壳内静态；
- **依赖（强）**：`@deepseek-ai/dsh-client-hmr` 的 `/plugins/events` 通道（装机版本 0.2.0-rc.2，2026-10-06 实测 200 + `text/event-stream`）；
- **约束**：`docs/` 正文以 `#` 开头、不强制 front-matter（本仓现状）；故障排查的落点是 `docs/guides/`；
- **约束**：命令里的端口与 rev 按「当前环境实测值」写，并在条目里标注「逐次实测取值」。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t3、t-e6d1e3、t-890bc5 |
| FR-2 | ✅ 已接收 | t3、t2、t-4c36ac、t-890bc5 |
| FR-3 | ✅ 已接收 | t1、t3、t-e6d1e3、t-890bc5 |

> 无未接收条款（3 条全部有落点）。

<!-- reqboard:marks:end -->
