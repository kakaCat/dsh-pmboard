---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8]
---

# 测试用例设计（REQ-261006201841-944d 归档校验与知识层覆盖度加固） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 需求源：`requirement.md`（FR-1～FR-8 验收标准、7 条失败与并发路径、整体验收标准 6 条）。
> 契约源：`design/interfaces.md`（I-1～I-9）、`design/data-model.md`（C1～C4 / M-1～M-6）。
> 口径：每条用例都写「跑什么命令 / 看到什么算过」；命令一律给到文件级；编号一律 `TC-NN`。
> 用例名以 `TC-NN` 开头（`npx vitest run <file> -t TC-NN` 才定位得到）——这是一条纪律，不是风格。

## 测试层级与载体 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 层级 | 载体（新建标 ★） | 覆盖什么 | 怎么跑 |
|---|---|---|---|
| 纯函数单测（零 IO、零时钟） | ★`tests/archive-materials-shape.test.ts`、★`tests/archive-manifest-render.test.ts` | I-1 形态判定、I-3 文本渲染、I-4 可判定性 | `npx vitest run <file>` |
| 用例/端口单测（内存夹具） | ★`tests/archive-targets-gate.test.ts`、★`tests/archive-manifest-write.test.ts` | I-2 事实判定、写盘与次序、幂等、台账零写入 | 同上 |
| CLI 集成单测（spawn 真进程） | ★`tests/kb-coverage-probe.test.ts`、★`tests/archive-ledger-audit.test.ts` | K13/K14 读数与退出码、I-7 只读核对 | 同上（`spawnSync('npx',['tsx',…])`，见 `tests/kb-cli-parity.test.ts` 既有写法） |
| 客户端渲染单测 | ★`tests/board-archived-origins.test.ts`、扩 `tests/archived-entry.test.ts` | I-9 三态与逐字降级、既有 DOM 契约不退化 | 同上 |
| 链路 E2E（真 handler） | ★`tests/archive-origins.e2e.test.ts` | `/state` 的 `origins` → `renderArchivedBar` 一条链 | 同上 |
| 反向演练脚本 | 扩 `scripts/reverse-drill-matrix.mts` 新组 `--group archive`（首选）；必要时拆 `scripts/*-drill.mts` | RV-1 / RV-2 / RV-3：真改坏 → 判据必红 → sha256 逐字节还原 | `npx tsx scripts/reverse-drill-matrix.mts --group archive` |
| 人眼看 | 真实 GUI 看板 + `docs/requirements/<REQ>/archive.md` 人读面 | 视觉 / 语义 / 排版可读性（机器判不了，见下表） | 手工（见「E2E 与手工验收」） |

夹具与既有资产（不新造第二套）：

| 资产 | 能给什么 | 本需求怎么用 |
|---|---|---|
| `tests/application/harness.ts` `makeHarness()` | `FakeDocs`（`put`/`stat`/`exists`/`read`/`write`/`list`）、`InMemoryRequirementStore`（含 `injectFault`）、`FixedClock`、`SeqIds`、`queueRepo.writeSeqOf` | 闸 1/闸 2 的存在性、0 字节、根校正、写盘幂等 |
| `tests/helpers/tool-deps.ts` `toUseCaseDeps({store, now, workspaceRoot})` + `stubDocFile(rel, root)` | 真文件系统的 `FileDocRepository`（含默认 cwd 隔离兜底） | 提交链路 E2E、只读目录场景、归档目录 `find` 计数 |
| `tests/archive-exemptions.test.ts` | `matchArchiveExemption` / `ARCHIVE_EXEMPTIONS` 正负例 | FR-6 机器产物分类**复用**该判据（不新写一份分类） |
| `tests/archive-compat.test.ts` | 存量归档记录（无对账字段）读侧渲染 | 旧形态 `section` 读侧兼容（TC-15/TC-23） |
| `tests/kb-cli-parity.test.ts` | `spawnSync('npx',['tsx', <script>, …])` + `cwd: ROOT` 的 CLI 断言范式 | K13/K14、审计脚本的 CLI 断言 |
| `scripts/req-doc-validate.mts` | `--ledger-root` / `DSH_HOME` 覆盖台账根（既有单点） | K13/K14 与审计脚本在 fixture 台账上跑，不碰真台账 |

**机器判不了、必须人看的项（如实登记，不塞进自动判据）**：

| # | 项 | 为什么机器判不了 | 人来判什么 | 登记形态 |
|---|---|---|---|---|
| H-1 | `archive.md` 人读面可读性 | 机器只断言「分区存在 / 一行一类 / 不逐文件铺开」，判不了"读完要滚几屏、看不看得下去" | 打开一条新归档的 `archive.md`，能否 10 秒内答出「结论去哪了」 | 人工项 `needsHuman:true` |
| H-2 | 看板三态的视觉可辨识 | 无 DOM/截图环境，`data-src` 属性断言不了"是否一眼分得清本仓 / 别处 / 归属未知" | 真实主题 + 窄屏下三态并排看，标注是否被截断、是否与既有 chip 冲突 | 人工项 `needsHuman:true` |
| H-3 | 「在别处」文案的语义效果 | 断言不了"人看完是否还以为是文件丢了" | 点开跨项目条，读提示块后判断是否消除了"丢失"误解 | 人工项 `needsHuman:true` |
| H-4 | `unverifiable` 降权的可感知度 | 机器只断言索引节内**顺序**（可判定在前）；排序是否让人真能察觉"这条被降权了" | 翻 `docs/knowledge/INDEX.md` 对应节，判断是否需要更显眼的标注 | 人工项（若判"不可感知"，另立需求加标签，不在本次） |
| H-5 | 存量 22 / 14 双口径该以谁为准 | 两个读数都是机器算得出的，但"哪个口径才是对的基线"是裁定不是计算 | 依 D-5 保留双读数 + 写明口径；是否收敛为单一口径由人裁定 | 已在 `requirement.md` D-5 留痕，本次不复议 |

## 用例表（单测，逐条可跑） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

命令列一律可直接复制执行；`-t TC-NN` 依赖用例名带 `TC-NN` 前缀。

### 闸 1 · 合并去向存在且非空 `serves: FR-1` · `tests/archive-targets-gate.test.ts`

| 编号 | 场景 | 期望（可证伪） | 命令 |
|---|---|---|---|
| TC-01 | 生效根下目标不存在（`FakeDocs` 无该键） | 抛既有码（`REQBOARD_FILE_MISSING` / `REQBOARD_INVALID_INPUT`），消息**同时含**该路径 + 生效根（绝对）+ `by=path-fallback`；台账 version 不变 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-01` |
| TC-02 | 目标存在但 0 字节（`docs.put(p,'')`） | 拒绝，`reason='empty'`，消息含「空文件」与「0 字节」；**与 TC-01 的 missing 消息文本不同** | `npx vitest run tests/archive-targets-gate.test.ts -t TC-02` |
| TC-03 | 三条 `merged_into`：存在非空 / 0 字节 / 缺失 | 任一不过即整单拒绝（无"部分通过"）；报告逐条给 `ok` / `bytes` / `reason`，`bytes` 缺失 ≠ `0` | `npx vitest run tests/archive-targets-gate.test.ts -t TC-03` |
| TC-04 | 记录有 `projectId` 且项目表在位 | `by='project-id'`、`attributed=true`、生效根 = 项目条目 `path`（不读共享单例当前值） | `npx vitest run tests/archive-targets-gate.test.ts -t TC-04` |
| TC-05 | 记录只有 `workspaceRoot`（`dsh-notice-webhook` 形态） | 按**它自己的根**判定：该根下存在的文档判过（不误拦），本仓不存在同一路径不影响结论 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-05` |
| TC-06 | 跨项目根（R-1）：用计数代理包住 `deps.docs` | 本次判定的全部 `resolve/read/stat/list/exists` 目标**都落在该需求自己的根下**；对本仓（宿主当前根）路径计数 = 0 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-06` |
| TC-07 | 记录既无 `projectId` 也无 `workspaceRoot`（F-1 / D-6） | `attributed=false`、`by` 不冒充 `project-id`；回执标「归属未知」并按当前工作区兜底 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-07` |
| TC-08 | 项目表 `list()` 抛错（F-2） | 回落记录自带 `workspaceRoot` 且 `by='path-fallback'`；两者皆无 → 同 TC-07 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-08` |
| TC-09 | 拒绝时台账零写入 | `store` 的 version / revision 不变、无 `archive.json`、无 `archive.md`、需求目录零新增文件 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-09` |
| TC-10 | FR-1 验收标准 3 的静态锚点 | `src/application/internal/archive-targets.ts` 存在；`SubmitArchive.ts` 含 `assertArchiveTargetsOpenable` 调用与 `stat(`（存在性探测） | `npx vitest run tests/archive-targets-gate.test.ts -t TC-10` |

### 闸 2 · 说明书更新点 `path#anchor` + 白名单 `serves: FR-2`

形态判定在 `tests/archive-materials-shape.test.ts`（零 IO）；事实判定在 `tests/archive-targets-gate.test.ts`。

| 编号 | 场景 | 期望（可证伪） | 命令 |
|---|---|---|---|
| TC-11 | `manual_updates[].path` 不含 `#`（旧自由文本形态） | 拒；消息含「必须是 `路径#锚点`」+ 原值（`section` 已废弃，锚点写进 `path`） | `npx vitest run tests/archive-materials-shape.test.ts -t TC-11` |
| TC-12 | `#` 前为白名单外路径（`CLAUDE.md#x`，`REQ-261003150739-b98d` 形态） | 拒；消息含白名单前缀清单 + 原值 + 该类型 note | `npx vitest run tests/archive-materials-shape.test.ts -t TC-12` |
| TC-13 | `path#`（锚点空）/ `#anchor`（路径空）/ 两个 `#` | 三种一律拒（C1：恰好一个 `#`，两侧非空） | `npx vitest run tests/archive-materials-shape.test.ts -t TC-13` |
| TC-14 | 白名单内路径 + 目标文档里不存在的锚点（`section='二、四个关键决策'` 而已改名「十个」） | 拒，原因 = 「锚点不存在」；消息关键词与 TC-12 的「白名单外」**可区分** | `npx vitest run tests/archive-targets-gate.test.ts -t TC-14` |
| TC-15 | 旧形态**读侧**兼容（边界 1 / R-5） | 历史记录只有自由文本 `section` 时，读侧渲染逐字含旧 `section`（形如 `path（旧：section）`），不崩 | `npx vitest run tests/archive-compat.test.ts -t TC-15` |
| TC-16 | 白名单唯一来源（不新增第二份） | 形态判定与 `merged_into` 引用同一份 `ARCHIVE_DOC_RULES[category].mergeTargets`；同一前缀集合下两者结论一致（源码锚点 + 行为一致） | `npx vitest run tests/archive-materials-shape.test.ts -t TC-16` |

### 渲染物 `archive.md` 与机器产物折叠 `serves: FR-5, FR-6`

纯渲染器 `tests/archive-manifest-render.test.ts`；写盘与次序 `tests/archive-manifest-write.test.ts`。

| 编号 | 场景 | 期望（可证伪） | 命令 |
|---|---|---|---|
| TC-17 | 节序与结论原文 | 输出含固定节序（归档结论 → 一句话结论 → 合并去向 → 人读材料 → 机器产物 → 说明书更新点 → 相关）；`indexEntry` **逐字**出现 | `npx vitest run tests/archive-manifest-render.test.ts -t TC-17` |
| TC-18 | 合并去向逐条读数 | 每条含 路径 + `✅ 存在 N 字节` 或 `❌ 不存在` + 生效根 + `by`（判据来源进渲染物） | `npx vitest run tests/archive-manifest-render.test.ts -t TC-18` |
| TC-19 | 机器产物折叠（FR-6 结果 1） | 只出现「类别名 · 数量 · 体积」行；**不出现**逐文件路径（断言不含逐文件 `rtm-*.md` 行） | `npx vitest run tests/archive-manifest-render.test.ts -t TC-19` |
| TC-20 | `queue.json` 摘要（FR-6 验收标准 2） | 任务数 / 依赖边数 / 就绪数 / 生成时间 / 字节数与 fixture 队列实际值一一相等 | `npx vitest run tests/archive-manifest-render.test.ts -t TC-20` |
| TC-21 | `queue.json` 解析失败降级 | 渲染为「无法解析，仅报体积」且**不抛错**；其余分区照常输出 | `npx vitest run tests/archive-manifest-render.test.ts -t TC-21` |
| TC-22 | 纯函数性（I-3 纪律） | 同输入两次调用字节级相等；`renderedAt` 不变时输出不变（不读时钟 / 环境变量 / 文件系统） | `npx vitest run tests/archive-manifest-render.test.ts -t TC-22` |
| TC-23 | 旧形态 `manualUpdates`（只有 `section`）渲染 | 渲染 `path（旧：section）`，不崩（与 TC-15 的读侧口径同源） | `npx vitest run tests/archive-manifest-render.test.ts -t TC-23` |
| TC-24 | 人读 / 机器计数对照 | 分区标题含人读份数与机器类别数，且与 fixture 实测计数相等 | `npx vitest run tests/archive-manifest-render.test.ts -t TC-24` |
| TC-25 | 一次成功归档落盘（FR-5 验收标准 1） | `docs/requirements/<REQ>/archive.md` 存在；回执 `archive_manifest.written=true` 且 `bytes>0`；`archive.md` 进 `docs` 清单且 `kind='notes'` | `npx vitest run tests/archive-manifest-write.test.ts -t TC-25` |
| TC-26 | 幂等（FR-5 验收标准 2） | 同材料再提一次 → `written:false`；盘上文本提交前后 sha256 相等；文件 mtime 不变 | `npx vitest run tests/archive-manifest-write.test.ts -t TC-26` |
| TC-27 | 渲染写盘失败（F-4 / R-4） | 注入 `docs.write` 抛错 → 整体拒绝且**台账零写入**（version / revision 不变、无 `archive.json`）；不留半截。附加（本机）：真只读目录（`chmod 0o500`）同结论，root 身份下跳过 | `npx vitest run tests/archive-manifest-write.test.ts -t TC-27` |
| TC-28 | 不搬迁、不删除机器产物（D-2 / FR-6 验收标准 1） | 提交前后对需求目录做 `find` 计数：文件数、路径集合、各类别计数逐项相等 | `npx vitest run tests/archive-manifest-write.test.ts -t TC-28` |

### 知识层两条读数 K13 / K14 `serves: FR-3, FR-4`

CLI 读数 `tests/kb-coverage-probe.test.ts`；纯判定与降权 `tests/kb-invalidation.test.ts`。

| 编号 | 场景 | 期望（可证伪） | 命令 |
|---|---|---|---|
| TC-29 | K13「有归档材料」集合口径 | 判据 = `archive/<REQ>/archive.json` **存在**（本窗实测 23/37 个归档目录）；只有目录、无 `archive.json` 的需求**不计入**——否则缺口集合会差 14 条 | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-29` |
| TC-30 | K13 缺口 → 红（FR-3 验收标准 2） | fixture 台账缺口非空且 ⊄ 基线 → `findings` 含 `K13` 且 `ok=false`，`detail` 点名缺哪几条 REQ id；进程退出码 1 | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-30` |
| TC-31 | 集合差而非绝对数（M-5 同款） | 缺口 ⊆ 基线 → `ok=true`；`基线 \ 缺口` 非空 → 输出「已补齐，可刷新基线」（不静默） | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-31` |
| TC-32 | 台账不可达（F-5 / 边界 3） | `DSH_HOME=$(mktemp -d) npx tsx scripts/kb-probe.mts --json` → K13 `ok=true` + `detail` 含「读数不可得」；输出**不得**出现「全部通过」口径 | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-32` |
| TC-33 | 覆盖度基线刷新口 | `--refresh-coverage` 写 `docs/knowledge/archive-coverage.baseline.txt`（排序、行尾换行、`#` 注释头）；`package.json` 逐字不变 | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-33` |
| TC-34 | K14 两态（FR-4 验收标准 1） | 「失效条件 = 模板句（`相关实现被重构…`）」→ 计入 `unverifiable`；「失效条件含 `` `src/x.ts` `` 锚点」→ 不计入 | `npx vitest run tests/kb-invalidation.test.ts -t TC-34` |
| TC-35 | K14 集合差 + 基线缺失语义 | 基线文件缺失 = 空基线 = 任何不可判定都红；`--refresh-unverifiable` 写 58 行基线（排序 + 注释头） | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-35` |
| TC-36 | 同口径双入口（FR-4 验收标准 2） | `pnpm kb:check` 输出与 `npx tsx scripts/kb-probe.mts --json` 的 K13/K14 读数逐字一致（同一实现，不第二份判据） | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-36` |
| TC-37 | 降权排序零字符增量（A-3 / R-2） | `INDEX.md` 节内条目行顺序：可判定在前、`unverifiable` 沉底；索引行文法与**总字符数逐字节不变**（不加重 K1 预算） | `npx vitest run tests/kb-invalidation.test.ts -t TC-37` |
| TC-38 | 根因：新写的失效条件可判定 | `DepositKnowledge` 新条目文本 `isDecidableInvalidation(text)===true`（由 pointer / req id 派生），不再是写死模板句 | `npx vitest run tests/kb-invalidation.test.ts -t TC-38` |
| TC-39 | 新增脚本已归类（R-8 / K10） | 新 `scripts/*.mts`（审计 + 演练）在 `EXCLUDED` 登记且 `reason` 非空；`kb-probe --json` 的 K10 仍 `ok=true` | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-39` |

### 看板来源三态与存量只读核对 `serves: FR-7, FR-8`

| 编号 | 场景 | 期望（可证伪） | 命令 |
|---|---|---|---|
| TC-40 | 服务端 `/state` 派生 `origins` 三态（I-8） | 本仓根 → `kind='local'`；他项目根 → `kind='elsewhere'` 且带 `projectName`（根末段名）；解析不出 → `kind='unknown'` | `npx vitest run tests/board-archived-origins.test.ts -t TC-40` |
| TC-41 | 客户端三态渲染（I-9） | `data-src` 取 `local|elsewhere|unknown`；文本分别含「本仓」/「别处·<项目名>」/「归属未知」；他项目条含 `data-project` | `npx vitest run tests/board-archived-origins.test.ts -t TC-41` |
| TC-42 | `unknown` 不冒充本仓（D-6） | unknown 条文本 ≠ 「本仓」，`data-src="unknown"`；三条无根记录（本窗实测 `REQ-260929184406-2084` / `REQ-260929195829-6e02` / `REQ-260929210741-30ae` 形态）全走此态 | `npx vitest run tests/board-archived-origins.test.ts -t TC-42` |
| TC-43 | 客户端零判断逻辑（A-4 / D-4） | `src/client/views/board.ts` 内无路径字符串比较型项目判定（无新增 `startsWith(` / 根相等比较） | `npx vitest run tests/board-archived-origins.test.ts -t TC-43` |
| TC-44 | 既有 DOM 契约逐字保留 | `data-action` / `data-req` / `data-status` / `title` 与改造前逐字相同；既有 `tests/archived-entry.test.ts` 原样全绿 | `npx vitest run tests/archived-entry.test.ts` |
| TC-45 | `origins` 缺键逐字降级 | 两参调用（不传 `origins`）或 `origins` 缺该 req 键 → 该条不渲染标注，输出与旧版逐字节一致 | `npx vitest run tests/board-archived-origins.test.ts -t TC-45` |
| TC-46 | 审计脚本 fixture 读数（FR-8 验收标准 1） | `--ledger-root <tmp fixture> --json`：真失效 **2** / 章节漂移 **22 与 14 双读数（各带口径）** / `manualUpdates.path` 缺失 **1** / 归属未知 **3** / 误判对照 **15**，逐条对得上 | `npx vitest run tests/archive-ledger-audit.test.ts -t TC-46` |
| TC-47 | 冷侧记录的取根落点 | 记录只存在于 `archive/<REQ>/record.json`（热侧 `requirements/` 无此 id）时，根仍解析成功——本窗实测 37 条冷侧记录的 `record.json` 都住在归档目录里，只看 `requirements/` 会把 37 条全判成「归属未知」 | `npx vitest run tests/archive-ledger-audit.test.ts -t TC-47` |
| TC-48 | 只读契约（硬） | fixture 台账树逐文件 sha256 提交前后相等；除 `--out` 指定文件外零写入（含 `record.json` / `archive.json` / 无新临时文件） | `npx vitest run tests/archive-ledger-audit.test.ts -t TC-48` |
| TC-49 | 退出口径 | 报告完成（哪怕存量有失效）= exit 0；台账不可达 = exit 2（两种都不得吞掉） | `npx vitest run tests/archive-ledger-audit.test.ts -t TC-49` |
| TC-50 | 报告口径与新判据同源（FR-8 边界 3） | 报告用 `rootOfRequirement` + `listHeadingAnchors`（与闸 1/闸 2 同一实现）；把解析改回「按当前工作区直接比」→ 误判 15 条（与真相 2 条并列报出） | `npx vitest run tests/archive-ledger-audit.test.ts -t TC-50` |

### 反向演练（整体验收标准 1 / 2 / 3 的落点） `serves: FR-1, FR-3, FR-8`

| 编号 | 演练 | 通过标准（跑什么 → 看到什么算过） | 命令 |
|---|---|---|---|
| TC-51（**RV-1**） | 把 `merged_into` 改成 `docs/architecture/__no_such_doc__.md` 再提交归档 | 提交**被拒**（非 0 退出）：消息含该路径 + 生效根 + 判据来源（`project-id` / `path-fallback`）；逐字节还原后同一次提交通过 | `npx tsx scripts/reverse-drill-matrix.mts --group archive`（或 `npx tsx scripts/archive-gate-drill.mts`） |
| TC-52（**RV-2**） | 注释掉 `scripts/kb-probe.mts` 的 `add('K13', …)` 分支 | **该用例变红**：`npx vitest run tests/kb-coverage-probe.test.ts -t TC-30` 失败（必须是"删掉即红"，不是"无覆盖"）；逐字节还原后复绿且文件 sha256 与改坏前一致 | `npx tsx scripts/reverse-drill-matrix.mts --group archive` |
| TC-53（**RV-3**） | 把真台账（`~/.dsh/reqboard`）复制到临时目录，在副本上跑只读核对 | 读数逐条对得上：真失效 2 / 漂移 22 与 14 / 归属未知 3 / 误判对照 15；副本整树 sha256 **逐字节未变**；报告落 `docs/requirements/REQ-261006201841-944d/archive-audit.md`（带台账 revision + 树 sha256 + 时点） | `npx tsx scripts/reverse-drill-matrix.mts --group archive` |

三条演练的**恢复纪律**与 `scripts/reverse-drill-matrix.mts` 既有语汇一致，必须照抄、不得自创：

| 纪律 | 做法 |
|---|---|
| 备份 | 文件级备份到临时目录（**禁** `git checkout -- <path>` 式还原：2026-10-04 事故回退了别的窗口的未提交改动） |
| 还原判据 | 还原后比对 sha256；不一致即演练失败（不是"大概还原了"） |
| 并发写入检测 | 跑判据期间目标文件已被别的窗口改写（当前内容 ≠ 我们写下的坏版本）→ **放弃还原并响亮报错** |
| 范围自检 | 演练开始前核 `target` / 副本路径真的在盘上；写错路径 = 假绿，直接 exit 1 |
| 退出码 | 0 = 全部如预期变红且已逐字节还原；1 = 没变红 / 没点名 / 还原失败 / 目标不存在 |

### 静态红线与编号纪律（D-1 / D-4） `serves: FR-1, FR-3, FR-7`

| 编号 | 场景 | 期望（可证伪） | 命令 |
|---|---|---|---|
| TC-54 | K13 落号、K12 一字不改（D-1） | 源码出现 `add('K13', …)`；既有 `add('K12', …)` 分支与文案**逐字未改** | `npx vitest run tests/kb-coverage-probe.test.ts -t TC-54` |
| TC-55 | 不退回字符串比较型项目判定（D-4） | 改动后 `src/application`、`src/http`、`src/client` 里 `startsWith(` 的命中集合 ⊆ 改动前集合 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-55` |
| TC-56 | 改动面 ⊆ 三片 | `git diff --name-only` 落进测试内维护的白名单集合（归档提交 / 知识层 / 归档目录呈现 + 本需求文档与用例），多一个即红 | `npx vitest run tests/archive-targets-gate.test.ts -t TC-56` |

## E2E 与手工验收 `serves: FR-5, FR-6, FR-7`

机器段（`tests/archive-origins.e2e.test.ts`）：真 `createReqboardHandler` + 临时工作区 + 假项目表，`GET /state` 的 `origins` 直接喂 `renderArchivedBar`，断言 HTML 三态齐备。

| 编号 | 场景 | 期望 | 命令 |
|---|---|---|---|
| E-01 | 三态链路（本仓 / 他项目 / 解析不出） | 同一份 payload 渲染出的 HTML 分别不含标注 / 含「别处·<项目名>」/ 含「归属未知」 | `npx vitest run tests/archive-origins.e2e.test.ts` |
| E-02 | 缺 `origins` 键（旧服务端） | 渲染结果与旧版逐字节一致（逐字降级，不报错） | `npx vitest run tests/archive-origins.e2e.test.ts` |

人工段（进验收材料时标 `needsHuman:true`，附截图或走查记录）：

| 编号 | 手工步骤 | 通过标准 |
|---|---|---|
| M-01 | 启动 GUI 看板 → 找到已归档条里 `dsh-notice-webhook`（6 条）与 `quantsys-v2`（1 条）的条目 → 点开 | 不再是空白块：出现来源项目名 + 「在别处」提示文案；本仓条目无非必要标注 |
| M-02 | 点开 3 条无根记录（归属未知态） | 显示「归属未知」，**不显示**「本仓」 |
| M-03 | 打开一条本次新归档需求的 `docs/requirements/<REQ>/archive.md` | 10 秒内能看到结论 + 合并去向；机器产物是「一行一类」而不是逐文件铺开（H-1） |
| M-04 | 本需求自己的归档目录（吃自己的狗粮，整体验收标准 6） | `docs/requirements/REQ-261006201841-944d/archive.md` 存在且含结论与合并去向 |
| M-05 | 真实主题 + 窄屏下并排看三态 chip（H-2 / H-3） | 三态一眼可辨、标注不被截断、提示块消除"文件丢了"的误解 |
| M-06 | 翻 `docs/knowledge/INDEX.md` 对应节（H-4） | 判断降权排序是否可感知；不可感知则记录为后续需求的输入，本次不改 |

## 回归与基线 `serves: FR-1, FR-2, FR-3, FR-4`

**改动前的实测基线（三份读数，绝对数不可作判据——多窗口共用同一工作树）**：

| 读数 | 时点 / 工作树指纹 | vitest | kb-probe |
|---|---|---|---|
| 记录在案基线（`docs/reviews/test-baseline.md` + `.failures.txt`） | 2026-10-06 13:30 · HEAD `5dff7e2` | 失败 **68** / 共 6024 用例 | — |
| 交接读数（本窗接手的"改动前"实测） | 2026-10-06 | 失败 **122** / 共 **6245** 用例 | 12 项中 **5 红**：K1 INDEX 8190 字符 > 8000 预算 / K3 conventions 208 行 > 200 / K7 生成物漂移 2 处 / K9 符号表 3091≠3112 / K10 `scripts/design-coord-probe.mts` 未归类 |
| 本窗写入时点复跑 | 2026-10-06 20:34 · HEAD `d0f01d6` | 失败 **106** / 通过 6164 / 跳过 22（共 6292）；文件 46 failed / 485 passed / 3 skipped | 12 项中 **4 红**：K1 8190>8000 / K3 210>200 / K7 漂移 / K9 3091≠3117（K10 已绿） |

三条结论：

1. 三份读数互不相同（68 / 122 / 106）⇒ **绝对数不可作判据**；上表全部数字都是"别的窗口的存量欠债"，本次只判**零新增**。
2. 集合差实测：本窗复跑 vs 记录基线 = **新增 45 条 / 修复 7 条**；45 条中仅 **4 条**落在"必须契约升级"的文件里（`artifact-gates` 3 条 + `acceptance-criteria` 1 条），其余 41 条分布在 `decompose-tools`(17) / `handoff`(6) / `task-report`(6) / `client-view`(3) 等，与本次改动无关。
3. **不刷基线**（红线：不动测试基线）⇒ 验收判据改为「**改动前后两次自采集合差为空**」，两份集合都留在验收材料里（带指纹）；`pnpm baseline:check` 作为辅助读数，其非空差集必须逐条归因到别的窗口。

**必须同步更新的既有用例（走"契约升级"口径：把目标文档真 stub 出来 + 锚点写进 `path`）**：

| 组 | 文件 | 为什么红 | 处置（禁止放宽门禁 / 加豁免） |
|---|---|---|---|
| 旧形态 `manual_updates`（自由文本 `section`、`path` 不带 `#`） | `tests/acceptance-archive.test.ts`、`tests/archive-compat.test.ts`、`tests/archive-reconcile-e2e.test.ts`、`tests/archive-reconcile.test.ts`、`tests/artifact-gates.test.ts`、`tests/kb-archive-deposit.test.ts`、`tests/output-contract.test.ts` | 形态闸（I-1）收紧为 `path#anchor` + 白名单 | 用 `stubDocFile()` 真落盘目标文档，把 `path` 改成 `docs/architecture/…#<真实锚点>`；`section` 仅保留在"读侧兼容"用例里 |
| 提交归档材料的更宽集合（只写 `merged_into`、指向测试桩里的假路径） | `tests/e2e-b918-drill.test.ts`、`tests/board-info-fixes.test.ts`、`tests/closing-gap.test.ts`、`tests/acceptance-criteria.test.ts`、`tests/domain/req-b918-gates.test.ts`、`tests/reqboard/domain-summary.test.ts`、`tests/application/use-cases.test.ts` | 事实闸（I-2）要求目标存在且非空 | 同上：先 stub 真文件再提交；断言期望不变，只改夹具的"材料形态" |

每条红都必须逐条归因为「契约升级」而不是「真回归」：归因记录写进验收材料（文件 :: 用例名 → 原因 → 改法）。

命令块：

```
# 1) 契约升级后的定向回归（先跑这批，再跑全量）
npx vitest run tests/acceptance-archive.test.ts tests/archive-compat.test.ts tests/archive-reconcile.test.ts \
  tests/archive-reconcile-e2e.test.ts tests/artifact-gates.test.ts tests/kb-archive-deposit.test.ts \
  tests/output-contract.test.ts tests/e2e-b918-drill.test.ts tests/board-info-fixes.test.ts \
  tests/closing-gap.test.ts tests/acceptance-criteria.test.ts tests/domain/req-b918-gates.test.ts \
  tests/reqboard/domain-summary.test.ts tests/application/use-cases.test.ts

# 2) 本次新增用例（全绿才算过）
npx vitest run tests/archive-materials-shape.test.ts tests/archive-targets-gate.test.ts \
  tests/archive-manifest-render.test.ts tests/archive-manifest-write.test.ts tests/kb-invalidation.test.ts \
  tests/kb-coverage-probe.test.ts tests/board-archived-origins.test.ts tests/archive-ledger-audit.test.ts \
  tests/archive-origins.e2e.test.ts

# 3) 知识层自检（K13/K14 加入后，失败集合只许少不许多；金基线见上表）
pnpm kb:check

# 4) 文档与门禁（本需求文档 + 设计文档内容门）
npx tsx scripts/req-doc-validate.mts --req REQ-261006201841-944d

# 5) 回归基线的集合差（口径：集合差，不是计数上限）
pnpm baseline:check

# 6) 类型检查（改动文件零新增错误）
pnpm typecheck

# 7) 三条反向演练
npx tsx scripts/reverse-drill-matrix.mts --group archive
```

判据（跑什么 → 看到什么算过）：

1. 第 2 组用例全绿；第 1 组里 14 个文件逐条归因为「契约升级」，无一条靠放宽门禁或加豁免通过。
2. 改动前后两次自采的失败用例集合差为**空**（两份集合 + 工作树指纹留档）；`pnpm baseline:check` 的非空差集可逐条指到别的窗口。
3. `pnpm kb:check` 的失败项集合 ⊆ 上表金基线（K13/K14 加入后若红，红名单必须是 K13 的 6 条既有缺口或 K14 的 58 条既有不可判定，**不得**出现新增条目）。
4. `req-doc-validate --req REQ-261006201841-944d` 零违规；`pnpm typecheck` 改动文件零新增错误。
5. 第 7 组三条演练全部如预期变红且逐字节还原。

## 判别力自证（停用即红） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

"护栏没空转"要能被证明：下表每行都要当场做一次（改坏 → 看红 → 还原 → 记 sha256），证据进验收材料。

| 停用什么 | 哪条必须变红 |
|---|---|
| `assertArchiveTargetsOpenable` 的存在性判定（改回前缀比较） | TC-01、TC-03、TC-09、TC-51(RV-1) |
| 非空判定（`size > 0` 拿掉） | TC-02、TC-03 |
| 提交前的根校正 `applyRequirementWorkspaceRoot` | TC-04、TC-05、**TC-06（跨项目零访问）** |
| 项目表回落分支（F-2） | TC-08 |
| 归属未知标注（回落成 `local`） | TC-07、TC-42 |
| I-1 的 `#` 形态判定（回到自由文本） | TC-11、TC-13 |
| I-1 的白名单判定 | TC-12、TC-16 |
| I-2 的锚点集合判定（跳过 `listHeadingAnchors`） | TC-14 |
| 读侧旧形态渲染 | TC-15、TC-23 |
| `renderArchiveManifest` 的机器产物分区 | TC-19、TC-24 |
| `queue.json` 解析失败降级（改成抛错） | TC-21 |
| 渲染器的纯函数性（引入时钟） | TC-22 |
| 写盘幂等（改成无条件写） | TC-26 |
| 「渲染失败即整体拒绝」（把渲染挪到写台账之后） | TC-27 |
| `archive.md` 进 `docs` 清单（`kind=notes`） | TC-25 |
| K13 分支（注释掉 `add('K13', …)`） | TC-30、TC-29、**TC-52(RV-2)** |
| K13 的「读数不可得」（改成报绿且输出"全部通过"） | TC-32 |
| K13 基线刷新口 | TC-33 |
| K14 分支 / `isDecidableInvalidation` | TC-34、TC-35 |
| `DepositKnowledge` 的失效条件派生（回到模板句） | TC-38 |
| INDEX 节内降权排序 | TC-37 |
| 新脚本的 `EXCLUDED` 登记 | TC-39 |
| 服务端 `origins` 派生（删掉 payload 键） | TC-40、E-01 |
| 客户端三态渲染（`data-src` 与文案） | TC-41、TC-42 |
| `origins` 缺键降级 | TC-45、E-02 |
| 审计脚本取根口径（改回按当前工作区直接比） | TC-50、**TC-53(RV-3)** |
| 审计脚本只读契约（加一处对台账的 `writeFileSync`） | TC-47、TC-48 |
| K12 被改名 / 改语义（D-1） | TC-54 |

## 覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 需求条款 | 覆盖用例 | 载体 | 覆盖状态 |
|---|---|---|---|
| FR-1 合并去向存在且非空 | TC-01～TC-10、TC-51(RV-1) | `tests/archive-targets-gate.test.ts`、`tests/archive-materials-shape.test.ts` | ✅ 已覆盖（三态 + 跨项目 + 归属未知 + 非空 + 零访问） |
| FR-2 `path#anchor` + 白名单 | TC-11～TC-16 | `tests/archive-materials-shape.test.ts`、`tests/archive-targets-gate.test.ts`、`tests/archive-compat.test.ts` | ✅ 已覆盖（形态 / 白名单 / 锚点三因可分 + 读侧兼容） |
| FR-3 K13 覆盖度 | TC-29～TC-33、TC-39、TC-52(RV-2) | `tests/kb-coverage-probe.test.ts` | ✅ 已覆盖（含台账不可达不报绿、删分支即红） |
| FR-4 失效条件可判定 | TC-34～TC-38 | `tests/kb-invalidation.test.ts`、`tests/kb-coverage-probe.test.ts` | ✅ 已覆盖（两态 + 集合差 + 零字符降权 + 根因） |
| FR-5 `archive.md` 渲染 | TC-17～TC-28、M-03、M-04 | `tests/archive-manifest-render.test.ts`、`tests/archive-manifest-write.test.ts` | ✅ 已覆盖（含幂等与台账零写入） |
| FR-6 机器产物折叠 + 摘要 | TC-19、TC-20、TC-21、TC-24、TC-28、M-03 | 同上 | ✅ 已覆盖（含解析失败降级与不搬迁） |
| FR-7 看板来源三态 | TC-40～TC-45、E-01、E-02、M-01、M-02 | `tests/board-archived-origins.test.ts`、`tests/archive-origins.e2e.test.ts`、`tests/archived-entry.test.ts` | ✅ 已覆盖（视觉判断登记为人工项 H-2/H-3） |
| FR-8 存量只读核对 | TC-46～TC-50、TC-53(RV-3) | `tests/archive-ledger-audit.test.ts` | ✅ 已覆盖（读数含 22/14 双口径、误判对照 15） |
| D-1 / D-4 红线 | TC-54、TC-55、TC-56 | `tests/kb-coverage-probe.test.ts`、`tests/archive-targets-gate.test.ts` | ✅ 已覆盖 |

## 取证与验收口径 `serves: FR-1, FR-3, FR-5, FR-7, FR-8`

每条证据都要带三样：**命令 + 输出摘要 + 工作树指纹**（`git rev-parse --short HEAD`、`git diff --stat | tail -1`）；没有指纹的读数在多窗口工作树里不可界定、也不可复现。

| 证据 | 形态 | 落点 |
|---|---|---|
| 新增用例全绿 | `npx vitest run <8 个新文件>` 输出摘要（文件数 / 用例数 / 0 failed） | 验收材料正文 |
| 契约升级归因 | 表：文件 :: 用例名 → 归因（契约升级）→ 改法；附 14 文件的 vitest 摘要 | 验收材料附表 |
| 集合差为空 | 改动前 / 改动后两份失败集合（各带指纹）+ 差集输出 | 验收材料 + `docs/reviews/`（**不覆盖** `test-baseline.failures.txt`） |
| kb 读数 | `pnpm kb:check` 全文 + `npx tsx scripts/kb-probe.mts --json` 的 K13/K14 片段 | 验收材料 |
| RV-1 | 拒绝消息原文（含路径 + 生效根 + 判据来源）+ 还原后通过摘要 | 验收材料 |
| RV-2 | 改坏前后 sha256 + 目标用例红/绿两次输出 | 验收材料 |
| RV-3 | `docs/requirements/REQ-261006201841-944d/archive-audit.md`（含台账 revision `8953` + 树 sha256 + 时点）+ 副本树 sha256 前后对照 | 需求目录（进验收材料） |
| 人看项 | M-01～M-06 的走查记录 / 截图 | 验收材料（`needsHuman:true`） |

进 `reqboard_submit(kind=verification)` 的 `results`（ref 与验收项来源同构，逐项交代）：

| ref | 交代什么 |
|---|---|
| `{kind:'task'}`（各实施父卡） | 该卡改动文件的定向用例摘要 + 命令 |
| `{kind:'requirement'}` | 整体验收标准 1/2/3 → 分别对应 RV-1 / RV-2 / RV-3 的命令与读数；整体标准 4/5/6 → 集合差为空 / TC-54～TC-56 / M-04 |
| `{kind:'prototype-compare', prototypePath:'prototypes/archive-source-label.html'}` | 三态渲染与原型 §1～§3 的逐项对照（DOM 属性 + 文案）；视觉判断标 `needsHuman:true` |
| `{kind:'decision-compare', decisionIds:['D-1','D-2','D-3','D-4','D-5','D-6']}` | 逐条裁定判据：D-1→TC-54、D-2→TC-28、D-3→RV-1/2/3、D-4→TC-43/TC-55、D-5→TC-46（22 与 14 双读数）、D-6→TC-42/TC-47 |

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-5, FR-7, FR-8`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 反向演练的载体 | 三条各写一个独立脚本 | 并入 `scripts/reverse-drill-matrix.mts` 新组 `--group archive`（必要时才拆） | 复用其"备份 + sha256 还原 + 并发写入检测 + 范围自检"四道护栏，避免第二套还原逻辑；代价是矩阵脚本变长 |
| K13/K14 的判据入口 | 直接 import `kb-probe` 的函数 | `spawnSync` 跑真 CLI | 退出码语义（0/1）本身就是验收面（FR-3 验收标准 2），直接 import 测不到；代价是慢，且要 `DSH_HOME` 注入台账 |
| 读数断言的台账来源 | 直接对真台账断言数字 | 单测用 fixture 台账；真台账读数只在副本上取（RV-3） | 真台账随时被别的窗口改写（本窗实测 66 条热侧记录全部已有 `workspaceRoot`，与需求文档"3 条无该字段"的时点不同）；代价是 fixture 与真读数两处维护 |
| 读数复现 | 只报数字 | 报告必须带口径 + 台账 revision + 树 sha256 + 时点 | 本窗手写复现章节漂移得到 32/21，与需求窗的 22/14 不一致——**手写口径不可信**，只有同一份实现产出的读数才算证据 |
| 渲染失败的注入方式 | `chmod` 只读目录 | 注入 `docs.write` 抛错（确定性），`chmod` 只读作本机附加验证（root 下跳过） | root 身份下只读位不生效，会让用例在 CI/本机表现不一致 |
| 既有用例红一片的处置 | 放宽门禁 / 加豁免 / 改期望值 | 契约升级（stub 真文档 + 锚点写进 `path`），逐条归因 | 放宽等于篡改判据本身（委派底稿红线）；代价是 14 个文件的夹具要动 |
| 回归判据 | `pnpm baseline:check` 单点 + 刷基线 | 改动前后两次自采集合差为空（不刷基线） | 红线"不动测试基线"；且记录基线（68）已落后实测（106），刷基线=承认别的窗口的欠债。代价是每轮要采两次 |
| 降权形态 | INDEX 加 `unverifiable` 标签 | 节内排序（零字符增量） | INDEX 实测 8190 字符 > 8000 预算（K1 已红），加字符会制造新红；代价是显著性弱（登记为人工项 H-4） |
| K13/K14 台账根 | 自造路径解析 | 沿用既有单点 `<DSH_HOME\|~/.dsh>/reqboard`（与 `req-doc-validate.mts` / `self-gate-dogfood.mts` 同源） | 否则用例无法在 CI 上注入 fixture 台账，且会出现第二套路径口径 |

## 技术方案与亮点 `serves: FR-1, FR-3, FR-5, FR-8`

- **判据来源单一，用例把这件事钉住**：取根（`rootOfRequirement`）、锚点（`listHeadingAnchors`）、
  机器产物分类（`matchArchiveExemption`）三处都不新写第二份实现，分别由 TC-16 / TC-50 / TC-19 断言同源。
- **幂等可观测、不靠肉眼**：`archive_manifest.written` 把"没重写"变成机器可读读数，
  TC-26 再叠加文本 sha256，双读数互证（接口设计 I-5 的落点）。
- **"缺失 ≠ 0"贯穿全篇**：`bytes` 缺失与 `bytes === 0`、`baseline` 缺失 = 空基线、
  `available=false` = 读数不可得——三种"缺失"都有独立用例（TC-02 / TC-03 / TC-32 / TC-35）。
- **反向演练即验收**：RV-1 / RV-2 / RV-3 与需求整体验收标准 1 / 2 / 3 一一对应，
  且都走"真改坏 → 真红 → 逐字节还原"的既有语汇（不停留在"用例全绿"的自证）。
- **读数带指纹**：存量报告的每个数字都绑台账 revision + 树 sha256 + 时点，
  这是"报告一套、门禁一套"（FR-8 边界 3）在证据层唯一的防漂移手段。
- **机器判不了的老实登记**：H-1～H-5 五项进人工项，不用属性断言冒充"看起来没问题"。
