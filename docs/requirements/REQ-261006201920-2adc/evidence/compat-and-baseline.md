# 兼容与基线收口（REQ-261006201920-2adc · t6）

> 本文件是 t6 的证据之二：三形态兼容用例、全量基线差集、类型门与构建门的读数与**逐条归属**。
>
> **采集时点**：2026-10-06 21:32。仓库里同时有 5+ 个窗口在飞，下面的**数字是那一刻的快照**；
> 复核时段复跑已出现漂移（别的窗口在修），故本文件同时给出「快照值」与「复核复跑值」，
> 并单独列出**不随快照变化的不变式**（那才是本需求真正承诺的东西）。

**不变式（复核时段复跑仍成立）**：

| 不变式 | 复跑读数 |
|---|---|
| 被改写的存量任务卡 | **0** |
| 本需求改动面的类型错误 | **0** |
| 差集里的新增失败逐条归属到别人 | **全部**（无一条落在本需求改动面） |
| 本需求自己的错误码在清单内 | `system_item_disposition_required` 命中 2 次 |

## 一、三形态兼容（`npx vitest run tests/acceptance-compat.test.ts`）

```
$ npx vitest run tests/acceptance-compat.test.ts
 ✓ tests/acceptance-compat.test.ts  (7 tests) 5ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

| 形态 | 用例 | 结论 |
|---|---|---|
| ① 旧台账可读、不产生额外写入 | 缺新字段的历史单照常裁决；文本与既有结果相同 ⇒ 一个字段都不写 | 通过 |
| ② 旧调用方不炸 | 不传 `changeReason`、不构成覆盖 ⇒ 不报错（首次填写 / 零输入通过 / 人工项三例） | 通过 |
| ③ 回滚开关保真 | `DSH_REQBOARD_NO_ITEM_RESULT=1` ⇒ 四字段一个都不写；并对照开关关闭时的写入，证明前者不是「恒不写」 | 通过 |

## 二、全量基线差集（`npx tsx scripts/test-baseline.mts --check`）

```
$ npx tsx scripts/test-baseline.mts --check
[差集] 新增失败 14 / 不再失败 8
[test-baseline] FAIL：失败用例集合与基线不一致
exit 1
```

**差集非空**。按 C-14 逐条确认是否本次引入——结论是 **没有一条由本需求引入**：
（采集时点快照：新增失败 **14** / 不再失败 8；复核时段复跑：新增失败 **11** / 不再失败 8——数字在变小，因为别的窗口在修。）

| 新增失败 | 条数 | 归属（依据） |
|---|---|---|
| `tests/application/use-cases.test.ts`、`tests/compat-regression.test.ts`、`tests/reqboard/settings-init.test.ts` | 3 | 脚本自己标了 `[顺序相关？]`：**单独跑全绿**，属跨文件顺序/共享状态抖动 |
| `tests/error-code-inventory.test.ts` | 2 | 缺的是 `REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED` / `REQBOARD_PROTOTYPE_PLACEHOLDER`，定义在 `src/application/use-cases/MoveRequirement.ts`（**别的窗口修改中**，属原型门）。本需求自己的码 `system_item_disposition_required` 已在清单内 |
| `tests/artifact-openable.test.ts` | 1 | `sides` front-matter 硬门（别的窗口在飞） |
| `tests/live-tasks-single-source.test.ts` | 2 | 点名的行在 `src/client/views/report-band.ts` / `report-head.ts`（别的窗口）；**会话开始时基线已红** |
| `tests/report-tabs.test.ts` | 2 | 验收面板占位脚手架（别的窗口）；**会话开始时基线已红** |
| `tests/typecheck.test.ts` | 1 | 断言「tsc 零错误」，当前 4 条错误全在别的窗口的测试文件里（见第三节） |
| `tests/client-view.test.ts` | 3 | 会话开始时基线已红（文件级也在）；报的是泳道卡徽标/归档区，本需求未改这两处 |

**刻意不跑 `--refresh`**：本需求的边界明写「不碰测试基线」，且这些失败是**其它窗口的在飞状态**——
刷基线等于把别人的破绽记成"现状"，也违反「不静默降级」。差集如实留在这里，由收敛后的窗口处理。

## 三、类型门（`pnpm typecheck`）

```
$ npx tsc --noEmit -p tsconfig.json | grep -c "error TS"
4

$ ... | sed 's/(.*//' | sort | uniq -c
   1 tests/query-docs-roots.test.ts
   3 tests/verification-prototype-compare-required.test.ts
```

| 项 | 读数 |
|---|---|
| 基线文件（`docs/reviews/test-baseline.md`）的 tsc 读数 | `error TS 0` |
| 全仓（采集时点快照） | **4**，全部落在**别人的测试文件** |
| 全仓（复核时段复跑） | **1**（别的窗口修掉了 3 条） |
| **本需求改动面** | **0 条** |

**结论**：本需求不新增类型错误；仓库级读数上升 4，已逐条归属到别的窗口（`query-docs-roots` 是未修改的既有文件、
`verification-prototype-compare-required` 是未跟踪的新文件，两者都因他人改动而报错）。

## 四、构建门（`pnpm build`）

```
$ pnpm build
✔ Build complete in 973ms
wrapped dsh-pmboard -> lib/client.js 634498 bytes
[verify-client] OK  bundle=721645 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
exit 0
```

**注意一条运行时事实（已实测）**：reqboard 插件加载的是**构建产物**，而宿主在启动那一刻就把 bundle
读进内存——所以「本会话新落的卡」仍由**旧代码**产生（详见 `legacy-cards-untouched.md` 第二节）。
`pnpm build` 保证的是**下次装配**时带上本需求的全部改动；源码级证据由各自的用例与反向演练承担。

## 五、本需求的全部验证入口（一览）

| 判据 | 命令 |
|---|---|
| 计划期占位符 | `npx vitest run tests/acceptance-placeholder.test.ts` |
| 子卡回填 | `npx vitest run tests/lazy-expand-backfill.test.ts` |
| 返工卡过检与继承 | `npx vitest run tests/rework-gate.test.ts` |
| 结果锚点与人工项事实 | `npx vitest run tests/verdict-result-anchor.test.ts` |
| 处置模板与「处置为空即不可归档」 | `npx vitest run tests/system-item-disposition.test.ts` |
| 覆盖四元组与缺理由即拒 | `npx vitest run tests/result-override-reason.test.ts` |
| 客户端裁决行控件 | `npx vitest run tests/client-verify-disposition.test.ts` |
| 兼容三形态 | `npx vitest run tests/acceptance-compat.test.ts` |
| 反向演练（5 条） | `evidence/rv1-*.txt` … `rv5-*.txt` |


## 六、本轮发现的**流水线接缝**：产物确认票会挡住归档材料，而终态下无法重发

**现象（本需求实测）**：验收材料提交后，系统为 verification 产物**自动弹**了一道人工确认门（`pc-57be2f`）；
该弹框是后台**非阻塞**的（宽限约 2 秒），没人及时点 → 被降级为**挂起票**，票一路挂到有效期（22:08）才失效。
随后人走的是**另一道门**——逐项验收（5 项 + 5 项）→ 10/10 全过 → **需求自动归档**。
于是出现这个组合：**需求已是终态 `archived`，而那张产物确认票仍未作答**，且它把 `reqboard_submit(kind=archive)`
（归档材料）挡在 `REQBOARD_CONFIRM_PENDING` 后面。

**台账原文**（`comments.jsonl`）：

```
[Dive 停手] 人工门禁弹框在途（ref=pc-57be2f，来源=confirm）→ 自动链停手等人
[Dive 恢复] 等待结束（出口=degraded，原 ref=pc-57be2f）→ 自动链恢复续跑
[验收单] v1 逐项裁决：通过 10 项 …（全部已裁决 → 可点「验收通过」归档）
[验收] 人工审核通过（弹框确认，10 项全通过）→ 自动归档
```

**为什么 agent 侧解不开**：需求进 `archived` 后，`reqboard_ask_confirm` 报 `REQBOARD_NO_BOUND_REQ`
（绑定集合只含进行中需求）——**重发这条路在终态下不存在**。可用出路只有两条：
① 人到看板点产物确认按钮；② 等票自动失效。

**给后续的提示**：如果「产物确认」与「逐项验收」在同一个节点上并存，人很可能只走后者就直达终态，
前者留下的挂起票会静默挡住归档材料的补齐。要么让终态下仍可清理这类挂起票，要么在归档路径上
把「仅剩产物确认章」与「确有未裁决项」区分开——本需求只记录现象与证据，不改这条链（越界）。

**同一接缝的第三处实例（归档当场实测）**：归档材料提交成功（回执里有 `reconcile.listed / exempted / unlisted / acknowledged`，
需求状态 → `archived`，`archivePath` 已写），但**没有生成 `<dir>/archive.md`**——
而其它已归档需求（如 `REQ-261001154450-b918` / `REQ-261002105242-a3fb` / `REQ-261004103330-005f`）都有这份「渲染物」。

判据：`src/application/use-cases/SubmitArchive.ts` 的 t4 段（REQ-261006201841-944d FR-5/FR-6）负责「渲染 `archive.md` 并写盘」，
而该需求仍在飞、其代码尚未随当前 bundle 生效（同第一节的运行时事实）。回执里也没有 `archive_render` 字段（schema 有声明、本次未产出）。

**处置（刻意不伪造）**：这是**机器渲染产物**，不是叙述文档——手写一份等于伪造机器读数。
正确出路是**宿主加载新 bundle 后重交一次 `kind=archive`**（材料在 `archived` 下允许补齐），由渲染器自己落盘。
本条只记录现象、判据与出路，**不改归档链**（那属别的窗口的文件域）。
