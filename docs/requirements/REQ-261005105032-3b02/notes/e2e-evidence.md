# 端到端证据清单（REQ-261005105032-3b02 · 卡 t-ed8a64 / t23）

> 用途：把本需求 23 张卡的成果串成**一份可复核清单**——每条都给「命令 + 原始输出摘要 + 结论」，
> 供验收材料直接引用。编号与 `notes/execution-decisions.md` 对齐（§5 / §5c / §4e / §6 / §7 / §7b）。
> 纪律：**失败要响亮**。做不到 / 不适用的项如实写「不适用」并给理由，不用"看起来没问题"顶替证据。
> 全部命令都在工作区根（`/Users/mac/Documents/ai/dsh/dsh-pmboard`）执行。

## 0. 一条命令复现（验收复核从这里开始）

| # | 命令 | 期望 | 本轮实得 |
|---|---|---|---|
| 0.1 | `npx tsx scripts/req-report-probe.mts` | exit 0 且打印 `PROBE PASS` | **exit 0**，`PROBE PASS（4/4 组合…）` |
| 0.2 | `CHROME_BIN=/nonexistent npx tsx scripts/req-report-probe.mts` | exit 2（环境不可用，不许静默跳过） | **exit 2**，点名 `CHROME_BIN 指向的路径不存在：/nonexistent` |
| 0.3 | `npx vitest run tests/probe-hard-criteria.test.ts` | 源码级命中数 = 0 | **9 passed**，观测量 21 项全部有失败分支 |
| 0.4 | `npx tsx scripts/reverse-drill-matrix.mts` | 六条逆验证全部判为必红（+ 附一条） | **exit 0，必备六条 6/6 必红** |
| 0.5 | `npx tsx scripts/self-gate-dogfood.mts` | 三次 dogfood 共 9 项判定如预期 | **exit 0，9/9** |
| 0.6 | `npx tsx scripts/template-gate-probe.mts`（R1） | exit 0，缺口 0 | **exit 0**，模板 25 份 OK 25 / 文档自检缺口 0 |
| 0.7 | `npx tsx scripts/doc-section-parity.mts`（R2） | exit 0，双向漂移 0 | **exit 0**，6 类模板双向一致 |
| 0.8 | `npx tsx scripts/prompt-path-probe.mts`（R3） | exit 0，缺口 0 | **exit 0**，20 个 token 全部可达/白名单 |
| 0.9 | `node scripts/check-prompt-fragments.mjs`（R4 只校验不重生成） | exit 0 | **exit 0**，产物与 `fragments/**.md` 逐字节一致 |
| 0.10 | `npx tsx scripts/req-doc-validate.mts --req REQ-261005105032-3b02` | exit 0，9 项判据缺口 0 | **exit 0**（实判 8 / 读数未知 1） |
| 0.11 | `npx tsc --noEmit -p tsconfig.json` | 0 错 | **exit 0** |

## 1. 四条探针（R1~R4）与文档自检 9 项（对应 §6 的判据表）

### R1 模板门禁探针 `scripts/template-gate-probe.mts`（FR-10 · 决议 #26）

- 命令与结论：`npx tsx scripts/template-gate-probe.mts` → **exit 0**
- 原始输出摘要：

  ```
  模板 25 份：OK 25 / FAIL 0；缺口 0；观察 4（不计入判据）；文档自检缺口 0（PASS，需求模板 6 份）；exit 0
  ```
- 覆盖：① 占位符全部登记在 `scripts/template-render-map.json`（未登记 → exit 1 并点名）；② 按文档类分派门禁
  （需求类 → `missingCategoryDocs` + `checkRequirementDocFormatGate`；设计类 → `checkDesignSectionsHaveServes`）；
  ③ 模板必须显式归入文档类；④ **每份需求模板的渲染产物再走一遍 `req-doc-validate` 的 9 项判据集**（t21 接入）。

### R2 节名双向一致 `scripts/doc-section-parity.mts`（FR-10 / D-12）

- 命令与结论：`npx tsx scripts/doc-section-parity.mts` → **exit 0**
- 原始输出摘要：

  ```
  OK   templates/brainstorming/feature.md（门禁必填 5 节 == 登记 required 5 节；模板 H2 12 节，双向一致）
  …（bug / refactor / spike / doc / chore 同）
  需求模板 6 类：OK 6 / FAIL 0；双向漂移 0；exit 0
  ```
- 四条不变量：门禁要求 ⊆ 模板 H2；模板 H2 ⊆ 登记表；`required` 节 == 门禁要求的节（**双向相等**）；
  `optional` 节 ∉ 门禁要求的节。裁定节 `讨论与裁定记录（D-x）` 按 D-12 登记为 **featureOnly**。

### R3 提示词路径可达 `scripts/prompt-path-probe.mts`（FR-10）

- 命令与结论：`npx tsx scripts/prompt-path-probe.mts` → **exit 0**
- 原始输出摘要：

  ```
  [prompt-path-probe] OK 路径可达（57 份片段 + src/application/dive/round-state.ts）：token 20 个（真实存在 4 / 产物名白名单 16）
  [prompt-path-probe] 缺口 0；exit 0
  ```
- 白名单每条带理由（`prototypes/INDEX.md` / `prototypes/<name>.html` = 需求自己生成、当下必然不存在；
  `docs/requirements/<REQ>/prototype/` = brief §1 的兼容期旧路径；上游原文里的目标项目路径 = 与本仓布局无关）。
  `--specimen` 内置反例（注入不存在指针 → 必红；白名单 token → 不判缺口）另可单独跑。

### R4 内联产物新鲜度 `package.json` + `scripts/check-prompt-fragments.mjs`（FR-10 / D-8）

- 命令与结论：`node scripts/check-prompt-fragments.mjs` → **exit 0**
- 原始输出摘要：

  ```
  [check-prompt-fragments] OK: src/domain/prompt/generated/fragments.ts 与 fragments/**.md 一致；heavy.md ↔ vendor 原文逐字节一致
  ```
- 接线（已在 `package.json`，出现在提交前清单）：
  `prompts:check = node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs`；
  `prompts:verify = node scripts/check-prompt-fragments.mjs`（**只校验不重生成**的那条守卫，见 §4c「R4 卡面自相矛盾」的加性补丁）。
- 「改了片段不重生成 → exit 非 0」的承重证据见 §3 的第 5 条。

### 文档自检 9 项 `scripts/req-doc-validate.mts`（FR-11 · 验收标准 22）

- 命令与结论：`npx tsx scripts/req-doc-validate.mts --req REQ-261005105032-3b02` → **exit 0**
- 原始输出摘要（逐项）：

  ```
  1. [必填节] OK      2. [front-matter] OK   3. [格式门] OK
  4. [编号链] OK      观察 孤儿标红：0 个（编号图 153 个编号）
  5. [追溯] OK        观察 需求 ← 设计：11/11 条条款有设计章节承接（只判这一级）
  6. [RTM 健康] OK    观察 存量豁免（legacy）：createdAt 早于原型规则上线日 ⇒ 原型节这一维不判、不追溯
  7. [E2E 覆盖] OK    （读数未知，不判：requirement.md 里没有「层级」列的测试策略表 ⇒ 本判据没有判据对象）
  8. [serves] OK      观察 在判设计文档 7 份
  9. [dangling] OK
  文档自检汇总：判据 9 项（实判 8 / 读数未知 1）；缺口 0；exit 0
  ```
- 逆验证（卡面/验收标准 22 要求"人为改坏必填节 → 非 0 退出"）由 t21 交付时做过（删必填节 → exit 1 并点名缺哪一节，
  还原后 sha256 一致，见 `tasks/t-60bf6c.md` 的汇报 1）；本轮**另做**了一条更强的：R1 把该判据集接在自己后面，
  故 §3 的 R1 两条逆验证同时覆盖「模板门禁」与「文档自检」。
- **本轮附带修正（t23 复核发现）**：第 7 项的"读数未知"原因曾写死为「需求文档不在盘上 / 为空」——
  §4e 口径修正后，「文档在盘上但没有「层级」表」也会得到 `undefined`，旧写法则把这种情况**说成**"文档不在盘上"
  （原因说错，收口办法就指错）。已按两种真正不同的原因分开陈述（改的是文案判据的**陈述**，不是判据强度）：
  `scripts/req-doc-validate.mts` 第 ⑦ 项，复跑仍 exit 0。

## 2. 探针族几何量「硬判据」与 exit 2（本卡交付 · 验收标准 8 · brief §10 #25）

### 2.1 每个几何量都有断言分支（源码级扫描，`tests/probe-hard-criteria.test.ts`）

- 命令与结论：`npx vitest run tests/probe-hard-criteria.test.ts` → **9 passed**
- 原始输出摘要：

  ```
  [req-report-probe.mts] 观测量 21 项全部有失败分支：w、vh、cw、sw、headTop、actionsTop、bandTop、gapsTop、
    tabsTop、headH、bandH、commentsH、progressCellH、gapsCellH、outcomeCellH、commentRows、commentLong、
    barH、actionTops、bandCellHs、hostCount
  [req-report-probe.mts] 阈值（判据本身，不要求自证）：tabsTopMax、commentListMaxH、commentRenderLimit、
    actionBarMaxH、bandCellMaxH
  [req-report-probe.mts] 计数诊断（判据落在派生读数上）：scanned、tabCount
  ```
- 判据怎么来的（**不是手抄清单**）：从探针源码的 `interface Diag` 机械提取**数值型字段**（叶子名）；
  阈值按命名后缀 `Max…/Limit…` 排除（它们是判据本身）；计数诊断登记在 `NON_GEOMETRY` 并逐条写明判据落在哪。
  「有失败分支」= 源码里存在一行**同时**含该量（`.名字`）与失败标记（`problems.push` / `bad.push` /
  `failures.push` / `throw` / `process.exit` / `console.error`）。命中数必须为 **0**。
- **判据不空转的自证**（同文件第二组用例）：合成片段喂同一个扫描函数——只打印的必须命中、有失败分支的必须不命中；
  注册表 < 15 项直接判失败（防"把注册表写空"）。

### 2.2 该用例**承重**（逆验证：把判据拿掉，它必须红）

- 操作：临时删掉 `req-report-probe.mts` 里 `headH` 的两处判据（页内 `problems.push` 与宿主侧 `bad.push`）→ 跑用例。
- 原始输出摘要：

  ```
  AssertionError: 只打印、无断言分支的几何量：headH: expected [ 'headH' ] to deeply equal []
   Test Files  1 failed (1)
        Tests  1 failed | 8 passed (9)
  ```
- 还原后 sha256 与改坏前一致（`scripts/req-report-probe.mts` 逐字节还原）。**结论：用例真的在判，不是恒绿。**

### 2.3 探针本体（两条独立判据 + 环境回读）

- **页内**（`#diag` 的 `problems`）：每个几何量给出 `problems.push(...)` 失败分支——本轮**新增**了此前只打印的
  三条：结论头整块高 ≤ 视口高、状态带整块高 ≤ 视口高、状态带三格**各自** ≤ 220px（不再是"1280 档看最大值"）。
- **宿主侧回读**（`readbackProblems()`，本轮新增）：**只吃原始读数**重算一遍阈值比较，与页内派生布尔互为对照；
  覆盖视口宽/高、`doc`/`shell` 的 `scrollWidth/clientWidth`、四个落点、四类高度、评论行数与超长收纳、
  操作条整块与行数、三格高度、Tab 计数、面板包装器计数。
- **`--window-size` 回读校验**：`diag.w !== width` → 判失败并打印
  `视口宽回读 X ≠ 期望 Y（--window-size 未生效，本次全部几何读数作废）`。
- **无 Chrome → exit 2，响亮失败**：本轮把"落点查找"从共享模块的 `findChrome()`（候选里挑第一个存在的）
  改为**显式覆盖优先且不许静默回退**——`CHROME_BIN` 设了就以它为准，路径不存在 = 环境错。

  ```
  $ CHROME_BIN=/nonexistent npx tsx scripts/req-report-probe.mts
  PROBE FAIL（环境不可用，退出码 2）：CHROME_BIN 指向的路径不存在：/nonexistent（显式覆盖不许静默回退到本机浏览器）。
  修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。
  $ echo $?
  2
  ```
  为什么必须这样：旧语义下 `CHROME_BIN=/nonexistent` 会被**静默忽略**并回退到本机 Chrome（本轮实测：
  改之前同一条命令 exit 0 且 PROBE PASS）——"环境不可用 → exit 2"这条判据就永远演示不出来，
  CI 上还可能因为"机器上恰好装了另一个 Chrome"而量错浏览器却报 PASS。

### 2.4 正常路径（在途/终态 × 1280/900 四组合）

```
$ npx tsx scripts/req-report-probe.mts ; echo $?
[w=1280 · 在途 implementing] … PASS w=1280 state=inflight（…）
[w=900  · 在途 implementing] … PASS w=900 state=inflight（…）
[w=1280 · 终态 archived]     … PASS w=1280 state=terminal（…）
[w=900  · 终态 archived]     … PASS w=900 state=terminal（…）

PROBE PASS（4/4 组合：1280/900 × 在途 implementing/终态 archived；四问可答（L0 结论头/操作条/状态带落点在首屏）/
 **Tab 栏 top ≤ 713** / 评论列表整块 ≤ 260px / 无横向溢出 / 无内层滚动容器 / 未激活面板缺席 / 操作条不重叠 /
 操作条整块 ≤ 72px 且按钮同一行 / 状态带三格 ≤ 220px）
0
```

单组合的原始读数（可读行，节选 1280 在途）：

```
A1 首屏：Tab 栏@579 ≤ 上限 713 且落在视口内(713px) → ✓（**硬判据**：首屏看不到六个 Tab 就是"进不去"）
A1 首屏：评论列表整块高 94px ≤ 上限 260px → ✓ ｜ 渲染 3 行 ≤ 3 行 → ✓ ｜ 超长系统日志收纳 1 行
     分量高度（硬判据：头部/状态带 ≤ 视口高；三格各 ≤ 上限）：头部 398px ≤ 713px → ✓ ｜ 状态带 151px ≤ 713px → ✓
       （做到哪了 151px → ✓ / 缺口 151px → ✓ / 成效 151px → ✓）
宿主侧回读判据：视口宽 1280 == 期望 1280 → ✓ ｜ 原始读数重算判为失败 0 项 → ✓（与页内 problems 0 项互为对照）
```
（**本机装 Chrome**：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；PROBE PASS 是本机实测，
不是"环境缺失就跳过"。）

## 3. 六条逆验证（人为改坏 → 必红 → 逐字节还原）

- 命令与结论：`npx tsx scripts/reverse-drill-matrix.mts` → **exit 0，「必备六条：6/6 判为必红」**
  （默认组 `hard` = 本需求的六条 + 附一条；`scripts/reverse-drill-matrix.mts` 原有 6 条属 REQ-261004065652-5c1c，
  **一字未改**地保留在 `--group legacy`，两组都要用 `--group all`。默认组换成本需求的理由见脚本头注释：
  legacy 组会临时改 `src/application/dive/**`，并行窗口同时在改这些文件时有冲突风险。）
- 原始输出（逐条：改坏点 / 判据命令 / 退出码 / 还原）：

| # | 改坏点 | 判据命令 | exit | 判据点名（证据行） | 还原 |
|---|---|---|---|---|---|
| R1-① | `templates/brainstorming/feature.md`：`## 功能点（需求条款）` → `## 功能点X（需求条款）` | `npx tsx scripts/template-gate-probe.mts --templates-dir <临时副本>` | 1 | `FAIL templates/brainstorming/feature.md（requirement）` | 工作区 `templates/` sha256 前后一致（改坏只在临时副本） |
| R1-② | `scripts/template-render-map.json`：删掉 `"PROTOTYPE_REFS"` 登记项 | `npx tsx scripts/template-gate-probe.mts` | 1 | `- [render-map] 模板含未登记占位符 {{PROTOTYPE_REFS}}（scripts/template-render-map.json 里没有它）` | 已逐字节还原，sha256 复核一致 |
| R2 | `templates/brainstorming/feature.md`（副本）：新增 `## 多出来的一节` | `npx tsx scripts/doc-section-parity.mts --templates-dir <临时副本>` | 1 | `- [模板多一节] 模板 H2「多出来的一节」没登记在本脚本的节名登记表里（门禁不要求它）` | 工作区 `templates/` sha256 前后一致 |
| R3 | `src/domain/prompt/fragments/brainstorming/feature.md`：插入指向 `templates/rewrite-drill-missing-t23.md` 的指针 | `npx tsx scripts/prompt-path-probe.mts` | 1 | `[prompt-path-probe] FAIL 路径可达 templates/rewrite-drill-missing-t23.md ← …/feature.md:8（既不在磁盘上，也不在已知产物名白名单里）` | 已逐字节还原，sha256 复核一致 |
| R4 | `src/domain/prompt/fragments/implementing/feature.md`（沙箱副本）：末行追加注入行 | `node <沙箱>/scripts/check-prompt-fragments.mjs` | 1 | `[check-prompt-fragments] FAIL: …/fragments.ts 与 fragments/**.md 不一致（首个差异偏移 67077）` | 工作区 3 个源 sha256 前后一致（改坏只在沙箱） |
| FR-9/#6 | `src/application/internal/content-gates.ts`：`stripPrototypeAnchors` 实现换成恒等返回 | `npx vitest run tests/serve-extraction.test.ts --reporter=dot` | 1 | `❯ tests/serve-extraction.test.ts (12 tests \| 9 failed)` | 已逐字节还原，sha256 复核一致 |
| 附 | `scripts/req-report-probe.mts`：`const TABS_TOP_MAX = 713` → `= 1`（必然违反） | `npx tsx scripts/req-report-probe.mts` | 1 | `A1 首屏：Tab 栏@579 ≤ 上限 1 且落在视口内(713px) → ✗` + `A1 首屏：Tab 栏不在首屏内（top 579 > 上限 1，视口高 713）…` | 已逐字节还原，sha256 复核一致 |

- 附一条（卡面自测点名的那条"改坏硬上限"）的**完整原始输出**（独立复跑，同样逐字节还原）：

  ```
  $ sed -i '' 's/const TABS_TOP_MAX = 713/const TABS_TOP_MAX = 1/' scripts/req-report-probe.mts   # 人为改坏（本轮用等价脚本改动，跑完还原）
  $ npx tsx scripts/req-report-probe.mts ; echo $?
    A1 首屏：Tab 栏@579 ≤ 上限 1 且落在视口内(713px) → ✗（**硬判据**：首屏看不到六个 Tab 就是"进不去"）
  FAIL w=1280 state=inflight
    - A1 首屏：Tab 栏不在首屏内（top 579 > 上限 1，视口高 713）——六个 Tab 是六块内容的唯一入口，首屏看不到它等于都进不去
    - 回读 A1：Tab 栏 top 579 越界（视口高 713，上限 1）
  FAIL w=900 state=inflight
    - A1 首屏：Tab 栏不在首屏内（top 583 > 上限 1，视口高 713）——…
    - 回读 A1：Tab 栏 top 583 越界（视口高 713，上限 1）
  …（终态 archived 两组同样 FAIL）
  1
  还原后 sha256 与改坏前一致
  ```
  要点：**页内判据与宿主侧回读判据都点了名**（同一处坏在两处各报一次，互为对照），
  且四个组合全红 ⇒ 退出码 1（不是 2：环境是好的，是判据红了）。

- 原始汇总行：

  ```
  必备六条：6/6 判为必红
  [通过] 所选组全部演练如预期变红，且每一处的还原都过了 sha256 核对。
  ```
- 恢复安全（超出原脚本的一道闸）：跑判据期间若目标文件被**别的窗口**改写（当前 sha256 ≠ 我们写下的坏版本），
  脚本**放弃还原并响亮报错**——绝不回写覆盖他人改动（2026-10-04 事故的根因是"还原顺手回退了别人的未提交改动"）。
  本轮 7 条演练的还原全部按 sha256 逐字节核对通过，未触发该闸。
- 改坏点的选择原则（为什么 R1/R2/R4 用**临时副本**）：R1/R2 有 `--templates-dir`、R4 的脚本只按相对布局读盘，
  故把源拷进临时根再改坏——工作区**一个字节都不用碰**，同时仍核对工作区指纹不变（比"改了再还原"更强）。
  R3 / `stripPrototypeAnchors` / 附一条没有这种入口，只能在真文件上改坏，才用备份 + sha256 + 并发检测。

## 4. 三次 dogfood（本需求被自己的门拦 / 自己过自己的门）

- 命令与结论：`npx tsx scripts/self-gate-dogfood.mts` → **exit 0，9/9 判定如预期**（新增脚本，把三次一次性探针固化成可复跑命令）
- 输入是真记录、真产物簿、真文档：`~/.dsh/reqboard/requirements/REQ-261005105032-3b02/{record,artifacts}.json`
  （244 条产物，其中 `kind=prototype` **0 条**），`docs/requirements/REQ-261005105032-3b02/requirement.md`。

| # | 对应 | 期望 | 实得 |
|---|---|---|---|
| A-1 | §5 | 现文档过裁定门 = 放行 | ✅ 放行（undefined） |
| A-2 | §5 逆验证 | 把 D-14 的「影响 FR」改回「全 FR」→ 门必红并点名 | ✅ `decision_entry_invalid；gaps=[D-14（影响 FR 未命中真实条款（写了「全 FR」））]` |
| A-3 | §5 | 还原后必须再放行（证明是**改文档**而不是放宽门） | ✅ 放行（undefined）；还原 sha256 复核一致（`2ed2c831a0df…`） |
| B-1 | §5c | 本需求（声明 frontend、0 条 prototype 产物）过 `brainstorming → design` | ✅ `prototype_missing；首条 gap：无已登记 kind=prototype 产物（需求阶段必交原型：登记才算数，落盘未登记不算）` |
| B-2 | §5c | t9 适用性判据：`createdAt` 早于规则生效日 → `exempted: legacy` | ✅ `exempted=legacy required=false gaps=0` |
| C-1 | §4e | E2E 覆盖原始读数（本需求没有「测试策略（层级…）」表） | ✅ `undefined`（读数未知，不判） |
| C-2 | §4e | 口径修正后本需求过 `implementing → accepting` | ✅ 放行（undefined） |
| C-3 | §4e 逆验证 | 把 `e2eCoverageOf` 改回「没有表也压成 false」→ 本需求**被自己的时序门拦住** | ✅ `stage_gate_overdue；gaps=[实施收尾：门「E2E 覆盖」未转绿 ｜ E2E 覆盖 → …requirement.md 的测试策略表里没有「层级 = E2E」的行 …]` |
| C-4 | §4e | 还原后再放行 | ✅ 放行（undefined）；还原 sha256 复核一致（`383621e9cc26…`） |

- 读法（三条 dogfood 各自证明什么）：
  - **A**：本需求主题（讨论裁定必须可机械核验）在**自身文档**上生效——门真的会拒，且处置是改文档、不放宽门。
  - **B**：原型门在**真实输入**上会拦人（不是只在夹具上绿），拦的正是"UI 需求在需求阶段没交原型"；
    本需求按 `createdAt(2026-10-05) < PROTOTYPE_RULES_SINCE(2026-10-06T00:00:00Z)` 走 `exempted: legacy`，不追溯。
  - **C**：时序门曾经拦住本需求（E2E 读数把"没有表"压成 `false`）→ 口径修正为"读数未知不判"后放行；
    C-3 证明这条口径**承重**（改回去就红，且红在本需求身上）。
- **实现细节（为什么 C-3 要 spawn 子进程）**：ESM 模块在进程启动时求值，本进程内改盘上的 `.ts` 源码再调门，
  跑的仍是**旧代码**（会得到"没红"的假结论——本轮第一次跑就撞上了这个坑，如实记在这里）。
  故"改源码 → 判据必红"一律 `npx tsx scripts/self-gate-dogfood.mts --child-gate <from> <to>` 重开进程重跑。

## 5. 本需求用例的汇总数字与全量红的归因（对应 §7 / §7b）

### 5.1 本需求相关用例

- **口径（可复现，写死在这里）**：23 张卡的汇报「改动文件」小节里点名过的**全部** `tests/**/*.test.ts`
  （38 个）+ 本卡新增的 `tests/probe-hard-criteria.test.ts` = **39 个文件**，一次跑完：

  ```
  $ npx vitest run $(cat <39 个文件>)
   Test Files  2 failed | 37 passed (39)
       Tests  6 failed | 628 passed | 2 skipped (636)
  ```
- 与 §7b 记录的 **30 个文件 / `Test Files 30 passed` / `Tests 495 passed | 2 skipped`** 的差异说明：
  §7b 是交付时刻的快照，**逐文件清单没落盘**（本卡复核时无法复原那 30 个是哪 30 个）。本卡改用上面
  这条更宽、可机械复现的口径重跑，故文件数与用例数都更大。**两条口径的结论一致**：本需求改动面内的
  用例全绿——本轮剩下的 6 条红**全部**落在下面两个文件，且逐条归因如下。

### 5.2 本轮 6 条红的逐条归因（方法照 §7 的"对照实验"）

| 文件 | 红 | 归因 | 证据（干净检出 `git worktree add --detach … HEAD` 上实跑） |
|---|---|---|---|
| `tests/dive-gate-prompt.test.ts` | 2 | **HEAD 基线红**，与本需求无交集 | 干净检出 HEAD 上跑同一份用例：`Test Files 1 failed (1) / Tests 2 failed \| 7 passed (9)`，**同样这 2 条**（断言逐字相同：`expected [] to have a length of 1`、`expected +0 to be 2`） |
| `tests/output-contract.test.ts` | 4 | HEAD 基线 3 条 + 并行窗口新增第 4 条 | 干净检出 HEAD：`Tests 3 failed`，点名 `defineTaskAdoptTool` / `defineKnowledgeTool` / `defineRegenerateTool` 缺 `RESPONSE_SOURCES` 映射；工作区第 4 条是并行窗口新加的 `defineSkillInstallTool`。**`prototype` 关键字命中 0** |
| （清单外补查）`tests/t17-queue-e2e.test.ts` | 1 | **HEAD 基线红**；该文件属 REQ-260927202051-f6df，不在本需求任何卡的「改动文件」清单里 | 全量跑与单跑都红（`expected 'brainstorming' to be 'design'`），干净检出 HEAD 上**同样红** ⇒ 不是本需求的门造成的回归。**为什么单独补查它**：它的断言正是「确认需求产物后自动推进」——本需求新门的形态与之相关，故不因"不在清单里"就略过 |

- 另做的两次对照实验（如实记录，含被否掉的假设）：
  1. 把 `round-driver.ts` 的**归属判定**（REQ-261005141830-7a3b t6 的在飞改动）临时短路 → `dive-gate-prompt` 仍 2 红
     ⇒ 不是它；还原 sha256 一致。
  2. 用 `git show HEAD:tests/dive-gate-prompt.test.ts` 覆盖本窗口对该夹具的 +4 行改动 → 仍 2 红（另多出 1 条：
     缺需求文档时裁定门拦下阶段转移，**恰好证明本需求的门在工作**）⇒ 不是我们的夹具改动；随后逐字节还原。
- 干净检出法在 `git worktree add --detach .worktrees/t23-attrib HEAD` 上做，跑完 `git worktree remove --force` 清理，
  `.worktrees/` 本就是本仓约定的多会话隔离目录（且在 `.gitignore` 内）。
- §7b 已经给过的**全量套件**数字（同一时刻，仅用于归因）：`Test Files 37 failed | 446 passed | 3 skipped (486)`、
  `Tests 68 failed | 5583 passed | 22 skipped (5673)`；逐条核对的结论是「本需求的 30 个用例文件无一出现在 39 个失败文件清单里」。
  本卡另按新口径复核了**本需求用例集合**（§5.1），并逐条归因了落在红名单里的 2 个文件（上表）——结论与 §7b 一致。

- **本轮全量复跑（卡 t23，同一工作区）**：`npx vitest run` →
  `Test Files 36 failed | 448 passed | 3 skipped (487)`、`Tests 67 failed | 5594 passed | 22 skipped (5683)`。
  把 36 个失败文件与 §5.1 的 39 个文件求交集 ⇒ **恰好 2 个**（`tests/dive-gate-prompt.test.ts`、`tests/output-contract.test.ts`），二者已在上表逐条归因到 HEAD 基线 / 并行窗口新工具；**本需求其余 37 个文件在全量跑里也是绿的**。
  （另：`tests/t17-queue-e2e.test.ts` 也红，但按"改动文件"口径它不属于本需求，已在上表作为清单外补查登记。它与本需求用例集合无交集，统计上不改变上面的数字。）

### 5.3 四路径门禁回归（t6）、验收单对照项（t18）、时序门（t13）

```
$ npx vitest run tests/probe-hard-criteria.test.ts tests/move-gate-paths.test.ts \
    tests/accept-sheet-tool.test.ts tests/accept-sheet-rtm-integration.test.ts \
    tests/acceptance-criteria.test.ts tests/stage-gate-timeline.test.ts \
    tests/decision-gates.test.ts tests/prototype-gates.test.ts
 ✓ tests/acceptance-criteria.test.ts (37)   ✓ tests/move-gate-paths.test.ts (26)   ✓ tests/accept-sheet-tool.test.ts (17)
 …（其余 5 个文件同绿）
 Test Files  8 passed (8)
      Tests  178 passed | 2 skipped (180)
```
- t6（四路径接线）：`tests/move-gate-paths.test.ts` 26 例全绿——**四条转移路径各断言一次**（会话语义 / 弹框确认 /
  看板移动端点 / 看板确认后自动推进），缺任一即红；§4b 另记了按实测**5 个调用点**接线（卡面只列 4 条）。
- t18（验收单对照项）：`tests/accept-sheet-tool.test.ts`（17）+ `tests/accept-sheet-rtm-integration.test.ts` 全绿——
  `prototype-compare` / `decision-compare` 两支与三处 `taskId` 分支（`AcceptSheet.ts` / `accept-sheet-rtm-integration.ts` /
  `status-rtm-integration.ts`）都有断言，且 `tests/acceptance-criteria.test.ts` 37 例覆盖"UI 需求必出现 / 已批准豁免不强制"。
- t13（阶段门时序）：`tests/stage-gate-timeline.test.ts` 全绿（§4e 记的回归锁：没有测试策略表 → 读数未知 → 放行；
  变异验证把判据改回恒 `false` → 正好只那一例红：`1 failed | 19 passed`，还原后 20/20）。

## 6. 不适用 / 未覆盖（如实登记，不用"看起来没问题"顶替）

| 项 | 状态 | 理由 |
|---|---|---|
| 探针截图路径 | **不适用** | 本需求是门禁 / 校验器 / 提示词面改动，四条探针 + 自检全是**文本判据**（几何量的原始读数即证据，见 §2.4）。仓里的出图脚本（`scripts/req-detail-ui-shot.mts` / `…-prototype-shot.mts`）属 REQ-261005155003-f32f 的**页面 UI 优化**，产物落在那条需求的 `evidence/` 下——本卡不往别人需求的证据目录里写图。 |
| 三级追溯的第 2/3 级 | **未硬判** | 转移门禁签名拿不到任务集；第三级在 `checkFullTraceability` 体内本身是 TODO（§4d 已记账，req-doc-validate 第 5 项把它打成"读数不可得"观察项）。 |
| RTM `expectedRTMFiles()` 的第 7 份 | **表述与实测不符** | 设计写 7 份，实测最多 6 份（第 7 份是按任务生成的 `rtm-implementing/<task>.yml`，`status` 推不出）——§5b 已记账，归档时一并修正。 |
| 尺寸门禁 | **已知欠债，不拆** | `ExecuteTask.ts` 646 行、`content-gate-wiring.ts` 923 行等（HEAD 即超 400 行门限）——§1/§5b 记账。 |
| 全量套件全绿 | **不成立（非本需求）** | §5.2：全量红来自 HEAD 基线 + 并行窗口在飞改动；本需求用例集合 37/39 文件绿，另 2 个文件 6 条红逐条归因到基线/他窗口。 |

## 7. 矛盾与需裁决点（本轮新发现）

1. **`CHROME_BIN` 语义**（本卡改）：显式设了但路径不存在，旧行为是**静默回退本机浏览器**（实测同一条命令 exit 0 + PROBE PASS）。
   本卡改为「显式覆盖不许静默回退 → exit 2」。影响面：只有 `scripts/req-report-probe.mts`（共享模块 `findChrome()`
   语义未动，出图脚本仍走候选列表）。**若认为出图脚本也该同口径，需另立一张卡**（它在 REQ-f32f 的改动面内）。
2. **`scripts/reverse-drill-matrix.mts` 默认组换了**（本卡改）：从"跑全部 6 条"改为"默认跑本需求 hard 组（6 + 1）"，
   原 6 条（REQ-261004065652-5c1c）原样保留在 `--group legacy`。理由：本卡验收要跑的是这六条，而 legacy 组会
   临时改 `src/application/dive/**`，在并行窗口手上同一批文件时有冲突风险。**若验收要求"默认跑全部"，用 `--group all`。**
3. **`req-doc-validate` 第 7 项的"未知原因"文案**（本卡改）：§4e 的口径修正让「文档在盘上但没有层级表」也返回
   `undefined`，旧文案会把这种情况说成"文档不在盘上"。已分两种原因陈述（只改陈述，不改判据强度）。
4. **§7b 的 30 文件清单没落盘**（历史遗留）：本卡无法复原那 30 个是哪 30 个，改用更宽的可复现口径（39 个文件）重跑，
   数字见 §5.1。建议今后"交付时刻的汇总数字"一律附**逐文件清单**，否则后人只能重算。
5. **探针的几何量判据现在有"页内 + 宿主侧回读"两条**（本卡有意）：两条互为对照（页内派生布尔出错时回读会红）。
   代价是同一阈值比较在两处出现（阈值本身仍只有一处：从 `#diag` 回读）。若要收敛成一条，需把"页内判据"整体
   搬到宿主侧——那会把真实布局判定与 DOM 解析分开，收益不明确，本卡不做。

## 8. 附录：本轮自测的一次性合并输出（原文粘贴）

> 卡 t23 的自测清单一条命令跑一遍（`npx tsc --noEmit -p tsconfig.json` 另跑：`TSC_EXIT=0`）。
> 各命令的逐项原始输出见 §1~§4；这里是**汇总口径**，便于一眼复核。

```
### 1) npx tsx scripts/req-report-probe.mts
exit=0
PROBE PASS（4/4 组合：1280/900 × 在途 implementing/终态 archived；四问可答（L0 结论头/操作条/状态带落点在首屏）/ **Tab 栏 top ≤ 713** / 评论列表整块 ≤ 260px / 无横向溢出 / 无内层滚动容器 / 未激活面板缺席 / 操作条不重叠 / 操作条整块 ≤ 72px 且按钮同一行 / 状态带三格 ≤ 220px）
### 2) CHROME_BIN=/nonexistent npx tsx scripts/req-report-probe.mts
exit=2
PROBE FAIL（环境不可用，退出码 2）：CHROME_BIN 指向的路径不存在：/nonexistent（显式覆盖不许静默回退到本机浏览器）。
修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。
### 3) npx vitest run tests/probe-hard-criteria.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
### 4) npx tsx scripts/reverse-drill-matrix.mts
exit=0
必备六条：6/6 判为必红
[通过] 所选组全部演练如预期变红，且每一处的还原都过了 sha256 核对。
### 5) npx tsx scripts/self-gate-dogfood.mts
exit=0

[通过] 9/9 条 dogfood 判定如预期（A 裁定门：改文档放行、改回缺陷形态必红；B 原型门：真拦 + 存量豁免；C 时序门：口径修正后放行、改回必红）
### 6) R1 / R2 / R3 / R4 / doc-validate
R1 exit=0
R2 exit=0
R3 exit=0
R4(verify) exit=0
doc-validate exit=0
```
