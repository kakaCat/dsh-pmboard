# 拆分计划（REQ-261007133149-0716 详情页组件化改造）

> 依据：design/ 六份（已确认）+ 原型 [anatomy.html](prototypes/anatomy.html)（authoritative）。
> 本计划是**唯一需要人批准**的产物；批准后自动落库任务卡并进入实施。
> 计划不写实现代码；粒度与依赖在这里定死，实施细节下沉到各卡。

## 目标与做法

把设计里的三件事拆成**判据先行**的 7 张卡：

```
t1 判据一：外观快照工具 + 基线（先有判据，再动 CSS）
 ├─ t2 物理分片 + 出口（拼接=逆操作，逐字节可回滚）
 │    └─ t4 覆盖层按组件归位（拆 :is() 组并补回特异性）   ← 本需求风险最高的一卡
 └─ t3 判据二：组件归属清单 + 分片归属门禁
t5 Panel 契约类型钉住 + 键/端点单点推导（与 t2~t4 并行）
        └─ t6 门禁反向验证（R-1~R-5）+ 维护指南与领域篇更新
                └─ t7 兼容回归收尾（探针 / 全量页面用例 / 窄档逐档 / 构建 / 协议 diff）
```

**排序理由**：本需求的成败全在"零外观变更"这件事上，所以**两条判据（t1 快照 / t3 归属）先落地**，
再让 t2 / t4 在判据之下动手——否则"改动是否等价"只能靠人眼，正是上一轮反复吃亏的地方。

## 变更盘点

- **新增**：`scripts/report-style-snapshot.mts`（判据一）、`scripts/report-style-ownership.mts`（判据二）、
  `src/client/styles/report/{tokens,base,shared,head,band,tabs,manifest}.ts`、
  `src/client/styles/report/panels/{trunk,docs,dag,dialogue,verify,token,prompts}.ts`、
  `tests/report-contract.test.ts`（契约用例）、
  `docs/requirements/REQ-261007133149-0716/evidence/style-snapshot.json`（基线）。
- **修改**：`src/client/styles/report.ts`（改成拼接出口，导出名不变）、
  `src/client/views/report-tabs.ts`（契约显式化 + 键推导）、`src/client/api.ts`（端点名同源推导）、
  `docs/architecture/requirement-detail-report.md` 与 `docs/guides/requirement-report-page.md`（分片后的读法）。
- **删除**：`report-tabs.ts` 手写的 `ReportTabKey` 联合、`api.ts` 手写的 endpoint 清单（改推导）；
  **不删**任何 CSS 规则（死规则清理不在本期，见 D-4）。

## 批次与依赖

| 批 | 卡 | 依赖 |
|---|---|---|
| 1 | t1 外观快照工具 + 基线（判据先行） | — |
| 1 | t5 Panel 契约类型钉住 + 键/端点推导 | — |
| 2 | t2 样式物理分片 + 拼接出口 | t1 |
| 2 | t3 组件归属清单 + 分片归属门禁 | t1 |
| 3 | t4 覆盖层按组件归位（拆组保特异性） | t2, t3 |
| 4 | t6 门禁反向验证 + 文档更新 | t3, t4 |
| 5 | t7 兼容回归收尾 | t4, t5, t6 |

## 设计清单 ↔ 接收卡对照

> 左列是设计文档里的清单条目 id（[interfaces.md](design/interfaces.md) 的 IF-1~IF-6、
> [frontend.md](design/frontend.md) 的 C-1~C-10），右列是**接收它的计划 key**——
> 「设计了什么 ↔ 谁来做」逐条对齐，批准人不必盲批。

### 接口清单 ↔ 接收卡 key

| 接口 id | 接口 | 接收卡 key |
|---|---|---|
| IF-1 | `Panel` 契约（类型钉住） | t5 |
| IF-2 | `REPORT_TABS` 注册表（唯一清单） | t5 |
| IF-3 | `ReportTabKey`（由注册表推导） | t5 |
| IF-4 | 取数端点名（由注册表推导） | t5 |
| IF-5 | 外观快照脚本（判据一） | t1 |
| IF-6 | 分片归属门禁脚本（判据二） | t3 |

### 组件树 ↔ 接收卡 key

| 组件 id | 组件 | 接收卡 key |
|---|---|---|
| C-1 | head 常驻头部 | t2, t4 |
| C-2 | band 状态带三格 | t2, t4 |
| C-3 | tabs 进度带 + Tab 栏 | t2, t4 |
| C-4 | trunk 汇报 | t2, t4 |
| C-5 | docs 文档 | t2, t4 |
| C-6 | dag DAG | t2, t4 |
| C-7 | dialogue 对话 | t2, t4 |
| C-8 | verify 验收 | t2, t4 |
| C-9 | token Token | t2, t4 |
| C-10 | prompts 提示词 | t2, t4 |

**为什么组件都是 t2 + t4**：t2 为每个组件建分片并保证拼接逐字节等价；t4 把属于该组件的
覆盖规则搬进它的分片（这是"改一个组件只读一个目录"成立的前提）。t4 是本期唯一改到
**全部十个组件**的卡，故临界容量核算见下。

## 任务表

| 计划 key | 标题 | 阶段/端侧 | 依赖 | 服务条款 | 验收（可证伪） | 工作量 |
|---|---|---|---|---|---|---|
| t1 | 外观快照工具 + 基线（判据先行） | implement / frontend | — | FR-3, FR-5 | `npx tsx scripts/report-style-snapshot.mts --check` 退出码 0（对未改动实现基线=现状）；报告逐组件给「键数/不同键数」；**反向**：临时改一条 CSS 值 → 退出码 1 且点名组件与属性，还原回 0 | ~5 DU |
| t2 | 样式物理分片 + 拼接出口（顺序不变） | implement / frontend | t1 | FR-2, FR-6 | `pnpm build:client` 退出码 0（含 `CSS 分片完整`）；分片按固定顺序拼回后与改造前 `report.ts` **逐字节相同**（`shasum -a 256` 一致）；t1 快照 `--check` 逐组件不同键数全 0 | ~8 DU |
| t3 | 组件归属清单 + 分片归属门禁 | implement / frontend | t1 | FR-1, FR-5 | `npx tsx scripts/report-style-ownership.mts` 退出码 0（越界 0 处 / 公共层含组件取值 0 处）；清单 10 个组件根逐个 `querySelector` 命中 ≥1；**反向**：把 verify 选择器写进 docs 分片 → 退出码 1 且点名"它属于 verify" | ~6 DU |
| t4 | 覆盖层按组件归位（拆 :is() 组保特异性） | implement / frontend | t2, t3 | FR-2, FR-5 | t1 快照 `--check` 退出码 0；t3 归属门禁退出码 0；`npx tsx scripts/req-report-probe.mts` 退出码 0（4/4 组合 + A13 六面板） | ~11 DU |
| t5 | Panel 契约类型钉住 + 键/端点单点推导 | implement / frontend | — | FR-4 | `pnpm typecheck` 退出码 0，且**故意漏实现一个契约成员编译失败**；`npx vitest run tests/report-tabs.test.ts tests/report-shell.test.ts tests/report-contract.test.ts` 全绿（键唯一 / 顺序即展示序 / 未知键不静默回落） | ~6 DU |
| t6 | 门禁反向验证（R-1~R-5）+ 文档更新 | test / frontend | t3, t4 | FR-5 | R-1~R-5 五条逐条演练：故意违规必须红且点名（脚本/用例里留成自动化自检）；`docs/architecture/requirement-detail-report.md` 与 `docs/guides/requirement-report-page.md` 写明"改外观跑什么、红了怎么办" | ~5 DU |
| t7 | 兼容回归收尾（探针/套件/窄档/构建/协议 diff） | test / frontend | t4, t5, t6 | FR-3, FR-6 | `req-report-probe.mts` 4/4+A13 全过；页面套件全绿；七面板 × 12 档无横向溢出、壳宽=min(视口,1280)；`git diff --stat src/client/api.ts` 只含清单推导改动（URL/参数/响应形状零差异） | ~5 DU |

## 容量核算

口径照既有：`detailUnits = files×1 + anchors×0.5 + chars/2000`，单卡容量上限 16 DU。

| 卡 | files | anchors | chars | 估算 DU | 判定 |
|---|---|---|---|---|---|
| t1 | 4 | 3 | ~2600 | ~6.8 | 通过 |
| t2 | 10 | 3 | ~4200 | ~13.6 | 通过（最大卡） |
| t3 | 4 | 4 | ~3200 | ~7.6 | 通过 |
| t4 | 11 | 3 | ~5600 | ~15.3 | 通过（临界，见下） |
| t5 | 4 | 3 | ~3000 | ~7.0 | 通过 |
| t6 | 4 | 5 | ~2000 | ~7.5 | 通过 |
| t7 | 3 | 5 | ~1500 | ~6.3 | 通过 |

**t4 是临界卡（~15.3 DU，上限 16）**：若实施中发现超过 16 DU，按"一批组件一卡"再拆（head/band/tabs 一卡、
panels 两卡），依赖关系不变。

## 风险与回滚

| 风险 | 处置 |
|---|---|
| 拆 `:is()` 组时改错了特异性 → 静默改外观 | t1 快照逐组件比对必红；t4 的验收就是它；红即回滚该分片 |
| 快照跨浏览器版本读数不同 | 固定采集口径（同一 Chrome / DSF / 视口）；差异**显式登记**，不许放宽阈值 |
| 分片后顺序被改动 → 级联结果变化 | t2 的"拼接逐字节相同"是硬验收；t4 只搬家不重排 |
| 归属门禁误报公共件 | 逐条带理由的白名单（脚本常量），不许宽泛豁免 |
| 回滚需求 | 拼接产物替换出口 + 删分片目录；三类判据（探针/套件/快照）全绿即等价 |
