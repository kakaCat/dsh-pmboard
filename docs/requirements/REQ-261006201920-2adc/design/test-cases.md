---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 测试策略与用例（REQ-261006201920-2adc）

> 本文档面向：开发、测试、验收。每条用例写清「跑什么 → 看到什么算过」；空话验收不写进本表。

## 新增用例清单 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 用例 id | 判据 | 跑什么 | 看到什么算过 |
|---|---|---|---|
| TC-1 | 命令操作数是占位符即拒 | `npx vitest run tests/acceptance-placeholder.test.ts` | `npx vitest run <相关测试文件>` / `npx tsx scripts/<脚本>.mts` 判 `ok:false`，且拒绝文案含占位符原文与修法 |
| TC-2 | **合法尖括号不受影响** | 同上 | `Record<StageKind,string>`、`每个值恰 1 个 <svg>`、`断言不含 <单册>`、`prototypes/<name>.html#FR-1` 四类**全部判 `ok:true`** |
| TC-3 | 回填消除模板占位符 | `npx vitest run tests/lazy-expand-backfill.test.ts` | 父卡点名 `tests/x.test.ts` → 子卡标准出现该路径；对全部 `STAGE_ACCEPTANCE` 阶段展开一遍，产物中 `/<[^>]{2,40}>/` 命中数为 **0** |
| TC-4 | 兜底仍可跑 | 同上 | 父卡未点名测试文件时，子卡标准含 `npx vitest run tests/`（或 `npx tsx scripts/*.mts`），且**无尖括号** |
| TC-5 | 词表闭集不变量 | `npx vitest run tests/domain/subtask-template.test.ts` | `unknownPlaceholders` 遍历全部模板恒返回空；人为插入 `<野token>` 时返回非空 |
| TC-6 | 存量卡不追溯 | `npx vitest run tests/lazy-expand-backfill.test.ts` | 回填前已落库的卡（含带占位符的历史卡）**逐字节不变**（前后快照比对） |
| TC-7 | 返工卡过两道判据 | `npx vitest run tests/rework-gate.test.ts` | 来源卡标准不可执行时，返工卡标准仍过 `checkAcceptance` + `checkHowToVerify`；`acceptanceSource` 如实标注 |
| TC-8 | 返工卡继承引用与体量 | 同上 | `requirementRefs` / `prototypeRefs` / `decisionRefs` / `footprint` 与来源卡逐字相等 |
| TC-9 | 无来源卡的返工卡仍可证伪 | 同上 | 需求级项 / 裁定对照项生成的返工卡标准过两道判据，且**非空、非零锚点** |
| TC-10 | 无锚点通过 → 未复核 | `npx vitest run tests/verdict-result-anchor.test.ts` | 文本 `通过` / `符合预期` / `（未附实际结果…待补复核）` → `status === 'unverified'` |
| TC-11 | 有锚点通过照常 | 同上 | 文本含命令 / 路径 / `12 passed` → `status === 'passed'` |
| TC-12 | 人工项禁收无事实短句 | 同上 | `needsHuman` 项文本 `通过`（2 字）→ **拒绝**；`我对照原型看过：一致`（9 字，事实形态）→ 通过 |
| TC-13 | 覆盖必须带理由 | `npx vitest run tests/result-override-reason.test.ts` | `resultSource='agent'` 且人文本不同、无 `changeReason` → 拒绝且 code 为 `result_change_reason_required`；补理由 → 通过 |
| TC-14 | 覆盖保留 agent 原文 | 同上 | 覆盖后 `resultSuperseded` === 原 agent 文本、`resultSource === 'human'`、`resultChangeReason` === 理由；**重复覆盖**时 `resultSuperseded` 仍是最初那次 |
| TC-15 | 不构成覆盖时不写留档 | 同上 | 人文本与 agent 原文相同 / 未改动预填 → 三个新字段一个都不写 |
| TC-16 | 处置模板两义命中 | `npx vitest run tests/system-item-disposition.test.ts` | `补了 E2E 用例`、`确认无需 E2E：纯函数模块，无外部接口` → 通过；`好的` / `知道了` / 空 → 拒绝 |
| TC-17 | **处置为空即不可归档（逆验证）** | 同上 | 构造「系统项 `status='passed'` 且 `opinion` 为空」的验收单 → `isFullyDecided` 为 false 且 `sheetGateStatus` 为 `pending`（即**不可归档**） |
| TC-18 | 普通项不受处置模板约束 | 同上 | 非系统项的 `passed` 不因处置措辞被拒 |

## 反向演练（每条硬判据都要能被证伪） <!-- serves: FR-1, FR-3 -->

**这是本需求验收的核心判据（D-2 原话：「反向演练：把「占位符分支」注释掉 → 必须有测试当场变红，还原 → 绿」）**。

| 演练 | 操作 | 期望 |
|---|---|---|
| RV-1 | 注释掉 `checkAcceptance` 里的占位符分支 | `tests/acceptance-placeholder.test.ts` **当场变红**；还原 → 绿 |
| RV-2 | 注释掉 `makeChild` 里的回填调用 | `tests/lazy-expand-backfill.test.ts` 的「残留为 0」断言**变红**；还原 → 绿 |
| RV-3 | 注释掉 `applyVerdicts` 里的结果锚点分支 | `tests/verdict-result-anchor.test.ts` 的「无锚点 ⇒ unverified」**变红**；还原 → 绿 |
| RV-4 | 把覆盖理由校验改成恒真 | `tests/result-override-reason.test.ts` 的「缺理由即拒」**变红**；还原 → 绿 |
| RV-5 | 把处置模板判据改成「非空即可」 | `tests/system-item-disposition.test.ts` 的模板用例 + TC-17 **变红**；还原 → 绿 |

**取证要求**：每次演练贴**两次输出**（红的那次与还原后的绿），进验收材料；只贴绿的一次不算演练。

## 回归面（不得变红） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 面 | 命令 | 为什么动到它 |
|---|---|---|
| 模板与规格 | `npx vitest run tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts tests/subtask-contract.test.ts` | 断言了 `STAGE_ACCEPTANCE` 字面量与 `<taskId>` 形态——本需求**不改模板**，故必须恒绿 |
| 懒展开与补链 | `npx vitest run tests/lazy-expand.test.ts tests/regenerate-chain.test.ts tests/rollback-materialize.test.ts` | 子卡落库路径被改 |
| 验收单与裁决 | `npx vitest run tests/acceptance-sheet*.test.ts tests/sheet-*.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts` | 裁决判据被改 |
| 验收期判据 | `npx vitest run tests/acceptance-executable.test.ts tests/acceptance-criteria.test.ts` | `checkAcceptance` 新增分支 |
| 两通道 | `npx vitest run tests/accept-sheet-tool.test.ts tests/e2e-accept-override.test.ts tests/verify-override.test.ts` | 覆盖与弹框补问 |

**说明**：既有用例中若出现「把无锚点文本判为通过」的旧口径断言，属**必须随本需求更新的口径**——
更新时逐条写清「改的是哪条口径、依据是哪个 FR」，不得为了让用例变绿而放宽断言。

## 基线比对与构建门 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 时机 | 命令 | 期望 |
|---|---|---|
| 提交前 | `npx tsx scripts/test-baseline.mts --check` | **差集为空、exit 0**（基线唯一来源 `docs/reviews/test-baseline.md`；口径是失败**用例集合差**，不是计数上限） |
| 改源码后 | `pnpm typecheck` | 错误数**不新增**（基线读数以基线文件为准；本仓当前另有别的窗口在飞改动引入的既有错误，须逐条确认非本次引入） |
| 改源码后 | `pnpm build` | 退出码 0 |
| 改客户端源码后 | `pnpm build:client` | 含 `[verify-client] OK`（C-12） |
| 全量 | `pnpm test` | 与基线逐条比对 |

## 需人见证的项（agent 跑不了） <!-- serves: FR-3, FR-4 -->

| 项 | 为什么必须人看 | 人看什么 |
|---|---|---|
| 裁决行的**视觉区分**：`未复核` 与 `已通过` 一眼可分 | 颜色 / 色条 / 徽标属于界面视觉，agent 无渲染器 | 打开看板验收面板，对照 `prototypes/verify-disposition.html#FR-3` 的两种状态是否可辨 |
| 「变更理由」输入的**展开时机**是否自然（编辑预填值时才出现） | 交互手感 | 在页面上实际改一次预填值，看理由输入是否出现且必填 |
| 「归档被这一项拦住」的**文案是否读得懂** | 文案可用性 | 打开看板看归档门提示 |

**口径**：以上三项在验收单里标 `needsHuman` 并由人填结论；agent 侧只提供截图路径与结构断言，不代判。
