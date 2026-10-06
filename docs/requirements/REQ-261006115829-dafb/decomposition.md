# 拆分计划（REQ-261006115829-dafb）

> 目标：把「桌面端插件包 404 / `plugins/events` ERR_FAILED」这条判据落成一份可查的排查条目，
> 并从两处入口挂上回链；**只改 `docs/`**，不动任何运行时代码。
> 依据：`requirement.md`（FR-1 / FR-2 / FR-3 + 裁定 D-1 / D-2 / D-3）与 `design/` 五份
> （architecture / interfaces / data-model / test-cases / use-cases）。
> 容量：缺省 16 DU；`detailUnits = files×1 + anchors×0.5 + chars÷2000`。本计划 **3 张卡全部 ≤ 16 DU，无超容量卡**。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | `requirement.md` 功能点表 | 需求条款（本需求 FR-1 / FR-2 / FR-3） |
| D-x | `requirement.md`「讨论与裁定记录（D-x）」 | 需求阶段裁定（D-1 先判噪声/真缺陷、D-2 404 = 包 rev 过期、D-3 产物 = 排查条目） |
| TC-x | `design/test-cases.md` | 测试用例（TC-1…TC-4） |
| C-x | `design/interfaces.md`「判据命令契约」 | 判据命令（C-1……C-3） |
| t-x | 本文档任务表 | 任务 |

**本需求没有 I-x / P-x / S-x 编号**（纯文档需求：设计里没有接口清单、页面组件、服务模块可编号），
故「落点」一列一律写「设计节 + 具体文件路径」——仍然是可查的指针，不写"相关模块"。

## 一、改动盘点（对照设计逐份）

| 设计文档 | 新增 | 修改 | 删除 |
|---|---|---|---|
| architecture.md | `docs/guides/plugin-reload-troubleshooting.md` | — | — |
| interfaces.md | —（契约由 t1 落实为页面结构，不产生代码） | — | — |
| data-model.md | —（判定：无表 / 无 schema / 无台账） | — | — |
| test-cases.md | —（交付后回填实测值 C-1…C-3） | 本文档 TC-3 的定标表 | — |
| use-cases.md | — | — | — |
| （入口两页） | `project-manual.md` 索引区一行；`plugin-runtime-prerequisites.md` 追加一句机制 + 回链 | 同左 | — |

**迁移与兼容卡：无需单列**——`design/data-model.md` 判定为「无数据迁移」，
回滚 = `git revert`；兼容性由「只增不改」保证（t2 的验收断言删除行数为 0）。
**契约先行卡：无需单列**——本需求无运行时接口契约；文档契约（五段结构 + 判据命令）已在
`design/interfaces.md` 定死，由 t1 直接落实。

## 二、任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（设计节 + 文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 写排查条目页并落实判据契约 | FR-1、FR-3 | `design/interfaces.md` §条目页骨架 / §判据命令契约 + `docs/guides/plugin-reload-troubleshooting.md` | — | D-1、D-2 | doc | doc | — | S | ① 五段各命中 1 次（`grep -c "^## .*<段名>"`）；② `wc -l` ≤ 120；③ 含 `text/event-stream`，且 `rev` 出现 ≥ 3 次；④ 全文 0 处「应该能」「一般会」 | dev,review |
| t2 | （落库后回填） | 两处入口回链（说明书索引 + 运行前提页机制一句） | FR-2 | `design/interfaces.md` §入口链接契约 + `docs/architecture/project-manual.md`、`docs/architecture/plugin-runtime-prerequisites.md` | — | D-3 | doc | doc | t1 | S | ① `grep -rn "plugin-reload-troubleshooting" docs/architecture/ \| wc -l` ≥ 2；② 命中分别落在两页；③ 运行前提页那一行含 `rev`；④ `git diff --numstat` 该页删除行数 = 0 | dev,review |
| t3 | （落库后回填） | 判据实测定标 + 文档自检并回写读数 | FR-1、FR-2、FR-3 | `design/test-cases.md` TC-1…TC-4 + `docs/guides/plugin-reload-troubleshooting.md` | — | D-1 | test | doc | t1, t2 | S | ① C-1 输出含 `200` 与 `text/event-stream`；② C-2 输出 `200`；③ C-3（改错 rev）输出 `404`；④ 条目里写的 rev 与 C-2 实测一致；⑤ TC-1 / TC-2 / TC-4 断言全过；⑥ `pnpm kb:check` 退出码 0 | dev,review,test |

**并行批次（DAG 层级）**：L0 = t1 → L1 = t2 → L2 = t3（链式，无并行）。

**footprint 与容量核算**（`files / anchors / chars → DU`）：

| key | files | anchors | chars | DU = files + anchors×0.5 + chars÷2000 | ≤16 |
|---|---|---|---|---|---|
| t1 | 1 | 5 | 3200 | 1 + 2.5 + 1.6 = **5.1** | ✅ |
| t2 | 2 | 2 | 900 | 2 + 1.0 + 0.45 = **3.45** | ✅ |
| t3 | 2 | 4 | 1200 | 2 + 2.0 + 0.6 = **4.6** | ✅ |

- `files` 与 implementation 点到的路径数核对：t1 = 1 个文件（≥ 1 ✔）；t2 = 2 个文件（≥ 2 ✔）；
  t3 = 2 个文件（条目页 + test-cases.md，≥ 2 ✔）——不缩水。
- `skipIntegration: true`（3 张卡都没有接口可联调）；`stages` 按上表显式给出（覆盖默认模板）。

## 三、逐卡 implementation / acceptance

### t1 写排查条目页并落实判据契约（doc）

**implementation**：

1. 新建 `docs/guides/plugin-reload-troubleshooting.md`，按 `design/interfaces.md`「条目页骨架」写五段 H2：
   `症状` / `判据` / `机制` / `处置` / `非目标`；
2. **症状段**照抄两条红字的原文形态：`Failed to load resource: the server responded with a status of 404 (Not Found)`
   （地址形如 `dsh-app://app/plugins/??<包>/client.js&rev=<rev>`）与
   `Failed to load resource: net::ERR_FAILED`（地址 `dsh-app://app/plugins/events`），
   并写明「第一条是包地址，第二条是 HMR 通道，两个成因不同」；
3. **判据段**写 `design/interfaces.md` 的 C-1 / C-2 / C-3 三条命令，端口与 rev 一律写成 `<host>` / `<rev>` 占位，
   并注明「逐次实测取值」；每条给期望输出与不符时的分诊一句话；
4. **机制段**写清：宿主按入口产物的 mtime / ctime / size 合成 `rev`，重建即让旧 `rev` 失效（旧地址 404）；
   `/plugins/events` 是 `@deepseek-ai/dsh-client-hmr` 的 SSE 通道，宿主重启或页面卸载即断，EventSource 自动重连；
   桌面壳只把 `/`、`/index.html`、`/assets/**`、`/favicon.svg`、`/manifest.webmanifest` 当静态文件，
   其余路径一律转发宿主（所以 `plugins/events` 的 404 不可能来自"壳里没这个文件"）；
5. **处置段**：先刷新页面；仍红 → 取证（DevTools → Network 按状态码筛 404，保留完整 URL）并交回排查；
6. **非目标段**：非包地址的 404、宿主不可达、无 `rev` 的地址，各自去哪查。

**acceptance**：

```bash
F=docs/guides/plugin-reload-troubleshooting.md
test -f "$F" && for s in 症状 判据 机制 处置 非目标; do printf '%s=' "$s"; grep -c "^## .*$s" "$F"; done
wc -l "$F"; grep -c "text/event-stream" "$F"; grep -c "rev" "$F"
grep -cE "应该能|一般会" "$F" || true
```

期望：五段各 `=1`；行数 ≤ 120；`text/event-stream` ≥ 1；`rev` ≥ 3；末行输出 `0`。

### t2 两处入口回链（doc）

**implementation**：

1. `docs/architecture/project-manual.md` 索引区新增一行：现象（控制台出现插件包 404 / `plugins/events` ERR_FAILED）→
   条目相对链接 `../guides/plugin-reload-troubleshooting.md`；**只增行**；
2. `docs/architecture/plugin-runtime-prerequisites.md` 的「二、构建产物 ≠ 已加载模块」节末尾追加一句机制
   （包地址带 `rev`，宿主只服务当前 `rev`，过期即 404）+ 指向条目的链接；**不是裸链接**，**只追加**；
3. 不改两页既有结论、表格结构与标题层级。

**acceptance**：

```bash
grep -rn "plugin-reload-troubleshooting" docs/architecture/
git diff --numstat docs/architecture/plugin-runtime-prerequisites.md docs/architecture/project-manual.md
```

期望：命中 ≥ 2 行且分别来自两页；`plugin-runtime-prerequisites.md` 的命中行含 `rev`；
`--numstat` 的删除列（第二列）为 `0`。

### t3 判据实测定标 + 文档自检并回写读数（test）

**implementation**：

1. 按交付当日实测取 `<host>` 与当前 `rev`（从 `/plugins/events` 的图帧里抄 `dsh-pmboard/client.js&rev=…`）；
2. 依次跑 C-1 / C-2 / C-3，把实测值（状态码 + 响应字节）回写两处：
   `docs/guides/plugin-reload-troubleshooting.md` 的期望输出列、`design/test-cases.md` 的 TC-3 定标表；
3. 跑 TC-1 / TC-2 / TC-4 的断言命令并留输出；
4. 跑 `pnpm kb:check`：若因新增页面出现漂移，按 C-13 先 `pnpm kb:build` 再复核；
5. 把本次交付的文件清单与命令输出写进任务汇报。

**acceptance**：C-1 → `200` + `text/event-stream`；C-2 → `200`；C-3（把 `rev` 改错）→ `404`；
条目里出现的 `rev` 与 C-2 实测值逐字一致；TC-1 / TC-2 / TC-4 全过；`pnpm kb:check` 退出码 0。

## 四、覆盖对照

| 需求条款 | 接口（interfaces） | 落点（文件 / 设计节） | 测试用例 | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | —（**纯文档条款**：本需求没有任何运行时接口） | `docs/guides/plugin-reload-troubleshooting.md`（`design/interfaces.md` §条目页契约总览） | TC-1、TC-4 | t1、t3 | ✅ |
| FR-2 | —（同上） | `docs/architecture/project-manual.md` + `docs/architecture/plugin-runtime-prerequisites.md`（§入口链接契约） | TC-2、TC-4 | t2、t3 | ✅ |
| FR-3 | —（同上） | `docs/guides/plugin-reload-troubleshooting.md` 判据段（§判据命令契约） | TC-3、TC-4 | t1、t3 | ✅ |
| **合计** | 0 接口（纯文档） | 3 文件 / 2 页 | 4 用例（TC-1…TC-4） | 3 任务 | **3/3 条款有主** |

**反向检查**：`design/` 五份里的 `serves` 只出现 FR-1 / FR-2 / FR-3，无超范围设计；
`test-cases.md` 的 TC-1…TC-4 全部在表中被认领，无用例无人接。

## 五、覆盖完整性规则（本计划的适用说明）

1. 「接口 / 页面模块」两格不是空的，而是写「—（纯文档条款：本需求不改运行时）」——符合规则里
   「除非该行是纯文档条款（写 "—" + 一句话理由）」的豁免口径；
2. 反向检查已在上节给出（设计/用例无超范围编号）；
3. 三个 FR 全部有接收任务，无孤儿条款。
