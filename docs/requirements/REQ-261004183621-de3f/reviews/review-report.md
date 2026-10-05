# 评审报告 · REQ-261004183621-de3f（归档清单对账）

> 范围：7 张父卡 / 26 张子卡的复核结论汇总（子卡逐段留痕在 `tasks/*.md`）。
> 结论：**偏离 12 处，逐条有结论；无未处置项**。核心风险（行为变更）已配回退开关并如实声明。

## 一、交付与设计的一致性

| 设计条目 | 实现 | 结论 |
|---|---|---|
| 对账三分类（已列/豁免/未列）放在**写台账之前** | `SubmitArchive` 在 `assertArtifactOpenable` 之后、知识沉淀之前对账；未列即拒 | 一致 |
| 豁免规则常量单点（domain，零 IO） | `src/domain/requirement/archive-exemptions.ts`：四条规则 + 匹配函数 + 每条 reason | 一致 |
| 补录只追加、幂等、留痕、不碰冷侧 | `AmendArchiveManifest`：`docs` 追加 + `amendments` 一条 + 评论；同 path → `skipped` 且不写盘 | 一致 |
| 看板对账行 + 老记录「未对账」 | `archiveReconcileLine` + `renderArchiveSection` 接线；`data-reconcile="none"` | 一致 |
| 闸门配置缺省 enforce、非法值装配期抛错 | `archiveGateSetting` + 组合根注入 | 一致 |
| 工具与看板共用同一用例 | 工具 `reqboard_archive_amend` 与 `/req/archive-amend` 都调 `amendArchiveManifest` | 一致 |

## 二、偏离清单（逐条给结论）

| # | 偏离 | 结论 |
|---|---|---|
| 1 | 豁免 `dir` 规则由「任一段匹配」收紧为「只看目录段」 | **必要修正**：按字面实现会让 `state/rtm-failures.json` 被 `rtm-*` 抢走，`runtime-state` 规则永不生效（实测踩到）；已冻结负例。 |
| 2 | 对账根改为**调用方声明的目录**（设计写的是 `docs/requirements/<id>`） | **必要修正**：硬编码在 `agent-dh/` 前缀调用下会遍历空目录，闸门形同不存在。 |
| 3 | 拒绝点位置：目录与清单可打开性校验之后、任何写入之前 | 一致于"零台账改动"的验收锚点；顺序写进注释。 |
| 4 | 新增 `UseCaseDeps.archiveUnlistedGate` 可选字段 | 契约补齐（t5 负责解析与注入，t2 只消费）。 |
| 5 | 测试夹具收口点 `tests/helpers/tool-deps.ts` 转发新字段 | 夹具与真装配同名字段，warn 态可被用例直投。 |
| 6 | 补录用例结果键由 `requirementId` 改为 `requirement_id` | **契约归一**：输出契约静态扫描要求 return 键都在 `output.schema` 内，且工具响应统一 snake_case。 |
| 7 | 补录后同步 `reconcile.listed` | 数据契约不变量（`listed` === `docs` 的 path 集合），不修就自相矛盾。 |
| 8 | 看板明细 >20 条折叠为「…等 N 条」 | 长目录不撑爆版面；行为无副作用。 |
| 9 | 看板明细每行带 `data-doc-path` | 复用既有「点路径打开文档」交互，不新增入口。 |
| 10 | 对账行位置：索引条目之后、文档清单之前 | 先看结论再看清单（阅读顺序）。 |
| 11 | 看板补录入口豁免 live-driver 回合校验、且不要求原窗口在线 | 补录是**事后整理**，不该被"窗口不在线"挡（与拆分入口口径刻意不同，已写注释）。 |
| 12 | 归属守卫先给准确病因（需求存在但属别的窗口 → `NOT_BOUND_TO_WINDOW`） | 比"本窗口没有需求"有用得多。 |

## 三、行为变更与其代价

- 变更：未列未豁免且未声明 → **从"警告"改为"拒绝"**。
- 依据：本需求的需求文档第三问经人工批准（README/需求文档均写明），属**有意**变更。
- 代价：5 处老用例按新契约修正（清单见 `tests/test-evidence.md` §四）。
- 回退：`archive.unlistedGate='warn'` 回到旧语义（仍写对账与留痕，信息只多不少）。

## 四、风险与未决

| 项 | 状态 |
|---|---|
| 真实 GUI 点击「补录」按钮 | **未验证**：路由已接线并与工具共用用例，但未做端到端点击（headless 无鉴权）。风险低（同一用例已被 8 条用例覆盖）。 |
| 老用例 `kb-archive-deposit` 的「同源重复提交幂等」 | **仍失败**（冷侧只读）——本需求提供了补录通道，但未改造该老用例（它走的是"再次提交归档材料"的旧路径）。留作后续。 |
| 豁免规则新增机器生成物 | 未登记会以"未列"暴露（刻意的摩擦），不会静默漏掉。 |
| 全量测试基线 | 99 failed vs 基线 97；新增 3 个失败文件均为环境缺口/未跟踪工作流（逐条见 `evidence/compat.txt`）。 |

## 五、结论

设计与实现一致；12 处偏离全部有结论且多数是**必要修正**；行为变更经人工批准并配可回退开关；验收锚点逐条有可复核证据（`evidence/` 四份 + `tests/test-evidence.md`）。
