# 拆分计划（REQ-261006201920-2adc 让验收不再形式合规）

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定 |
| UC-x | design/use-cases.md | 场景 |
| TC-x / RV-x | design/test-cases.md | 用例 / 反向演练 |
| / | design/interfaces.md | 签名与传输契约（本计划按文件名点名，不另编号） |

## 变更盘点（对照需求文档 + 设计一套）

**修改（9 个文件，全部是既有单点，无新建模块）**：

| 文件 | 改什么 |
|---|---|
| `src/domain/task/Acceptability.ts` | 新增占位符判据常量与 `checkAcceptance` 分支 |
| `src/domain/task/SubtaskTemplate.ts` | 新增 `ACCEPTANCE_PLACEHOLDERS` / `unknownPlaceholders` / `fillStageAcceptance` |
| `src/application/internal/lazy-expand.ts` | `makeChild` 落库前回填 + 残留断言 |
| `src/domain/workflow/AcceptanceSheetSpec.ts` | 返工规格过检与继承；结果锚点 / 人工项事实 / 处置模板；处置完备接入放行判据 |
| `src/application/internal/verdicts.ts` | 覆盖原子写入（原文留档 + 理由）；返工卡落库带 refs/footprint |
| `src/http/routers/verdicts.ts` | 解析并透传 `changeReason` |
| `src/application/use-cases/AcceptSheet.ts` | 覆盖项补问变更理由 |
| `src/client/views/panels/verify.ts`、`src/client/stage-panel.ts`、`src/client/board-mount.ts`、`src/client/styles/board.ts` | 裁决行新控件、收集与提交、样式 |

**新增**：无业务模块。仅新增测试文件 6 份与证据文件 2 份（见任务表）。

**删除**：无。既有符号一律保留（`checkAcceptance` / `checkHowToVerify` / `reworkSpecFor` / `dispositionMissingItems` / `isFullyDecided` 签名全部不变，只收紧语义）。

## 批次与依赖

```
批次 1   t1  域层契约（判据 + 词表 + 回填器）
            │
批次 2   ├── t2  子卡落库回填接线（lazy-expand）
         └── t3  领域裁决判据（返工过检 / 结果锚点 / 人工项事实 / 处置模板）
                    │
批次 3            t4  应用层与传输层（覆盖原子写入 + 两通道 + 弹框补问）
                    │
批次 4            t5  客户端（UI 卡：裁决行新控件 + 收集 + 样式）
                    │
批次 5            t6  迁移兼容 + 存量不追溯 + 全量回归与构建门收口
```

**为什么这样排**：契约卡（t1）先行，实现卡 `depends_on` 它；t2 与 t3 改的文件不相交，可并行；
t4 依赖 t3 定的域层语义；t5 依赖 t4 落定的传输字段；t6 必须在全部改动之后才谈「基线差集为空」。

## 容量核算

口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量缺省 **16 DU**（权重与容量只在 `src/domain/limits.ts` 定义）。

| 卡 | files | anchors | chars | DU | 判定 |
|---|---|---|---|---|---|
| t1 | 5 | 8 | 3200 | 10.6 | 容量内 |
| t2 | 5 | 6 | 2200 | 9.1 | 容量内 |
| t3 | 6 | 12 | 5200 | 14.6 | 容量内 |
| t4 | 8 | 8 | 3400 | 13.7 | 容量内 |
| t5 | 8 | 8 | 3600 | 13.8 | 容量内 |
| t6 | 6 | 7 | 2600 | 10.8 | 容量内 |

**无超容量卡**（最大 14.6 DU < 16），故计划内不出现 `⚠️超容量` 标记。

## 任务表

| 计划 key | 标题 | 覆盖条款 | 落点（设计条目 + 文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | 域层契约：占位符判据与声明式回填器 | FR-1 | interfaces 域层新增签名 + `src/domain/task/Acceptability.ts`、`src/domain/task/SubtaskTemplate.ts`、`tests/acceptance-placeholder.test.ts`、`tests/domain/subtask-template.test.ts` | — | D-2 | implement | backend | — | M · 10.6 DU | ① `npx vitest run tests/acceptance-placeholder.test.ts tests/domain/subtask-template.test.ts` 退出码 0；② 该文件含 TC-2 四类合法反例（TS 泛型 / `<svg>` 字面量 / `prototypes/<name>.html` 形态 / 「断言不含 `<单册>`」）**全部放行**；③ 含 TC-5 词表闭集不变量（人为插入 `<野token>` 时 `unknownPlaceholders` 返回非空）；④ **反向演练 RV-1**：注释掉占位符分支 ⇒ `tests/acceptance-placeholder.test.ts` 必红，还原后绿，两次输出留档 | 默认 |
| t2 | 子卡落库回填接线（懒展开） | FR-1 | architecture 占位符词表与回填器 + `src/application/internal/lazy-expand.ts`、`tests/lazy-expand-backfill.test.ts`、`tests/lazy-expand.test.ts` | — | D-2 | implement | backend | t1 | S · 9.1 DU | ① `npx vitest run tests/lazy-expand-backfill.test.ts tests/lazy-expand.test.ts tests/regenerate-chain.test.ts` 退出码 0；② 对全部 `STAGE_ACCEPTANCE` 阶段各展开一遍，子卡 `acceptance` 与 `implementation` 中 `/<[^>]{2,40}>/` 命中数为 **0**；③ 父卡点名 `tests/x.test.ts` ⇒ 子卡标准含该路径；父卡未点名 ⇒ 落 `npx vitest run tests/` 兜底且无尖括号；④ 存量卡前后逐字节不变（TC-6）；⑤ **反向演练 RV-2** 两次输出留档 | 默认 |
| t3 | 领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板 | FR-2, FR-3, FR-4 | interfaces 域层签名 + data-model 新增字段一览 + `src/domain/workflow/AcceptanceSheetSpec.ts`、`tests/rework-gate.test.ts`、`tests/verdict-result-anchor.test.ts`、`tests/system-item-disposition.test.ts` | — | D-3 | implement | backend | t1 | M · 14.6 DU | ① `npx vitest run tests/rework-gate.test.ts tests/verdict-result-anchor.test.ts tests/system-item-disposition.test.ts tests/domain/acceptance-sheet.test.ts tests/domain/req-b918-gates.test.ts` 退出码 0；② 返工卡三级取值（判据原文 / 来源卡标准 / 合成标准）均过 `checkAcceptance` + `checkHowToVerify`，且 `requirementRefs`/`prototypeRefs`/`decisionRefs`/`footprint` 与来源卡逐字相等（TC-7/TC-8/TC-9）；③ 文本「通过」「符合预期」⇒ `unverified`，含 `12 passed` 或路径 ⇒ `passed`（TC-10/TC-11）；④ `needsHuman` 项 2 字文本被拒、「我对照原型看过：一致」放行（TC-12）；⑤ 处置 `补了 X` / `确认无需 E2E：纯函数模块，无外部接口` 放行，「好的」/空被拒（TC-16/TC-18）；⑥ **逆验证 TC-17**：系统项 `passed` 且处置为空 ⇒ `isFullyDecided` false 且 `sheetGateStatus` 为 `pending`；⑦ **反向演练 RV-3、RV-5** 两次输出留档 | 默认 |
| t4 | 覆盖原子写入与两通道透传 | FR-3 | interfaces 应用层与传输层契约 + `src/application/internal/verdicts.ts`、`src/http/routers/verdicts.ts`、`src/application/use-cases/AcceptSheet.ts`、`tests/result-override-reason.test.ts` | — | D-3 | implement | backend | t3 | M · 13.7 DU | ① `npx vitest run tests/result-override-reason.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts tests/accept-sheet-tool.test.ts` 退出码 0；② 覆盖缺理由 ⇒ code `result_change_reason_required` 且台账零改动；③ 覆盖生效写全四元组（`result`/`resultSource='human'`/`resultSuperseded`/`resultChangeReason`），重复覆盖时 `resultSuperseded` 仍是最初那次（TC-13/TC-14）；④ 未改动预填值 ⇒ 三个字段一个都不写（TC-15）；⑤ 不传 `changeReason` 且不构成覆盖 ⇒ **不报错**（旧客户端兼容）；⑥ **反向演练 RV-4** 两次输出留档 | 默认 |
| t5 | 裁决行新控件：理由输入、原文保留、归档门可见（UI） | FR-3, FR-4 | frontend 组件拆解与交互 + `src/client/views/panels/verify.ts`、`src/client/stage-panel.ts`、`src/client/board-mount.ts`、`src/client/styles/board.ts`、`tests/client-verify-disposition.test.ts` | `prototypes/verify-disposition.html#FR-3`、`prototypes/verify-disposition.html#FR-4` | D-3 | ui | frontend | t4 | M · 13.8 DU | ① `npx vitest run tests/client-verify-disposition.test.ts tests/client-view.test.ts tests/stage-detail.test.ts` 退出码 0；② `pnpm build:client` 输出含 `[verify-client] OK`；③ 既有四个 DOM 钩子语义不变：`.dsh-pm-vsheet` / `.dsh-pm-vitem[data-item-id]` / `.dsh-pm-verdict-btn` 单选 / `.dsh-pm-vitem-opinion`；④ 新增钩子在场：`.dsh-pm-vitem-change-reason` 与 `data-superseded="1"`；被覆盖行的 HTML 同时出现「原实测结果」字样；⑤ `未复核` 行徽标文本取自既有 `ITEM_STATUS_TEXT.unverified`（不自造第二份文案）；⑥ **原型对照（可失败、需人见证）**：打开看板对照权威原型 `prototypes/verify-disposition.html#FR-3`，`未复核` 与 `已通过` 在**不看颜色**时仍可辨（徽标文字不同）；该项标 `needsHuman` 由人填结论 | 默认 |
| t6 | 迁移兼容、存量不追溯与全量回归收口 | FR-1, FR-2, FR-3, FR-4 | data-model 是否改表与回滚 + `tests/acceptance-compat.test.ts`、`docs/requirements/REQ-261006201920-2adc/evidence/compat-and-baseline.md`、`docs/requirements/REQ-261006201920-2adc/evidence/legacy-cards-untouched.md` | — | D-1 | test | backend | t5 | M · 10.8 DU | ① `npx vitest run tests/acceptance-compat.test.ts` 退出码 0（旧台账无新字段可读、旧客户端不传 `changeReason` 不报错、回滚开关 `DSH_REQBOARD_NO_ITEM_RESULT` 生效时四字段一个都不写）；② `npx tsx scripts/test-baseline.mts --check` 退出码 0（失败**用例集合差**为空）；③ `pnpm typecheck` 错误数不新增于基线读数；④ `pnpm build` 退出码 0；⑤ `git diff --stat -- 'docs/requirements/*/tasks'` 输出为**空**（存量卡零改写），且占位符扫描计数与改动前相等（944 → 944）；⑥ 证据文件含上述命令与输出摘要 | 默认 |

## 边界校验（不超范围、卡可独立验收）

| 检查项 | 结论 |
|---|---|
| 是否只改设计圈定的面 | 是：改动文件与 `design/architecture.md`「改动清单」逐一对应，无计划外文件 |
| 是否有卡夹带设计二次创作 | 否：设计未覆盖的事项（存量批量回填、改原型门、改归档校验、改测试基线）**不做**，需要就退回设计阶段 |
| 每卡可否独立验收 | 可以：每卡自带可跑命令与期望读数，新窗口零会话历史只凭卡 + 设计即可开工 |
| 是否含 UI 卡 | 是：t5（`sides` 含 frontend），已填「原型锚点」列并给可失败的原型对照判据（含一项 `needsHuman`） |
| 迁移与兼容是否有专卡 | 有：t6（零 DDL、零迁移 + 三形态兼容 + 存量卡零改写对照 + 基线差集） |
| 接口/契约卡是否先行 | 是：t1 立域层契约，t2/t3 的实施卡 `depends_on` 它；t4 依赖 t3 定的语义 |
| 是否存在前向引用 | 否：t2/t3→t1，t4→t3，t5→t4，t6→t5，全部指向先定义的 key |
| 是否有超容量卡 | 否：最大 14.6 DU < 16 |
