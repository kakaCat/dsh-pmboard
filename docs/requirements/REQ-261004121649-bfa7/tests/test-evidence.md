# 测试证据（REQ-261004121649-bfa7）

covers: t-3b61dd
covers: t-b721a6
covers: t-f98040
covers: t-c98915
covers: t-d66a34
covers: t-ff3d8a
covers: t-449ac5
covers: t-968fe6
covers: t-d86de5
covers: t-3b2a85
covers: t-e520c7
covers: t-a30bc1
covers: t-9c4db3
covers: t-37dc35
covers: t-0e0b30
covers: t-2f9c59
covers: t-0a4d64
covers: t-f44566
covers: t-70dc5f
covers: t-cfb2d4
covers: t-b6aa22
covers: t-637839
covers: t-17f385
covers: t-bf58f4
covers: t-2824d4
covers: t-affc5f
covers: t-9729e4
covers: t-52ac9a
covers: t-7e6a13

> **covers 说明（供验收人核）**：本需求 6 张父卡 + 23 张子卡全部标注覆盖。
> 父卡与子卡覆盖的是**同一批功能**（子卡是卡仪式的研发/联调/复核/测试四段），
> 故每张子卡对应的证据即其父卡那一条：t1 链（t-3b61dd 及其 4 张子卡）→ FR-1；
> t2 链（t-b721a6 及其 4 张）→ FR-3 幂等与上限；t4 链（t-c98915 及其 4 张）→ FR-2；
> t3 链（t-f98040 及其 4 张）→ FR-4 清场；t6 链（t-ff3d8a 及其 4 张）→ FR-3 老数据兜底；
> t5（t-d66a34 及其 3 张）→ 四条 FR 的判别力用例。

> 每条证据都可当场复跑。夹具一律用**内存对象**，不写真实工作区
> （本需求的事故教训之一：测试把文件写进了真实仓库）。

## 一、需求文档「验收口径（可跑）」逐条复跑

| # | 命令 | 结果 |
|---|---|---|
| 1 | `npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层"` | **3 passed**（6 顶层 → 物化 6；11 张子卡原地复位且 `parentId`/`stageKind` 保留、status=todo；物化卡里不出现原子卡 id） |
| 2 | 同一回退重复执行两次 → 第二次物化数为 0 | **1 passed**（`-t "重复回退两次"`：真跑两次回退并把第一次产物落进队列，第二次物化 0 张、净增 0） |
| 3 | 构造一次会物化 > 20 张卡的回退 → 抛错且队列零新增 | **4 passed**（`-t "上限"`：21 张 → 抛 `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT`，文案含 21 / 20 / 建议；`many.every(status==='done')` 证明队列一字未改；另「正好 20 张 → 放行」） |
| 4 | `npx vitest run tests/rollback-materialize.test.ts -t "批量清理"` | **1 passed**（回退物化 → 记物化清单 → 清场整链：6 张物化卡一次清掉、再清一次为 0） |

## 二、四条 FR 的定向用例

```
FR-1  npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层"        → 3 passed
FR-2  npx vitest run tests/rollback-materialize.test.ts -t "不自动展开链"      → 1 passed
      npx vitest run tests/rollback-materialize.test.ts -t "真的走一遍开工"    → 1 passed（端到端）
FR-3  npx vitest run tests/rollback-materialize.test.ts -t "幂等"              → 4 passed
      npx vitest run tests/rollback-materialize.test.ts -t "上限"              → 4 passed
FR-4  npx vitest run tests/rollback-cleanup.test.ts                            → 12 passed
```

`rollback-cleanup.test.ts` 12 条覆盖：精确匹配+幂等、不碰 done 卡、序号不存在即拒、
从未回退也拒、旧数据兜底 `matchedBy`、无 `reworkOf` 逐条 `skipped`、父子关系还原、
重做卡留顶层不硬编父卡、与回退清单端到端对齐、物化 0 张时清单保留、跨需求隔离。

**合计 22 条**（materialize 10 + cleanup 12）。

## 三、判别力自证（不是声明，是实测）

以断言形式**内建**在用例里：

- 「只物化顶层」自带膨胀对照：全量物化时物化数会从 6 涨到 17（`expect(...).toBeLessThan(all.length)`）；
- 「真的走一遍开工」自带反向对照：同一张卡去掉 `stages: []` 后按 phase 回落、必然展开 > 0 张。

以**变异实验**逐条验证（把实现改坏 → 看用例变红 → 还原 → 复跑变绿）：

| 变异 | 结果 |
|---|---|
| 去掉「只物化顶层」分流（子卡也物化） | **4 条红**，打印 `expected 17 to be 6`（正是原事故的膨胀形状） |
| 去掉幂等守卫（`alreadyReworked` 置空） | **2 条红** |
| 去掉「不碰 done 卡」的跳过 | **1 条红** |
| 物化 0 张时也覆盖清单（`keepPrev=false`） | **1 条红** |
| 序号校验改回「一律严格相等」 | **1 条红**（存量旧形状被挡死那条） |

每次实验后 `grep 判别力实验 src/ tests/` → 空，确认零残留。

## 四、数据契约与兼容路径核验

```
RollbackMark 新增字段：src/shared/protocol.ts（seq / lastMaterialized，均可选、缺省即旧行为）
写入点：src/application/internal/rollback.ts → recordRollbackMaterialized
  · 会话侧调用：src/application/use-cases/MoveRequirement.ts:120
  · 看板侧调用：src/http/routers/requirements.ts:180
读取点：src/application/internal/rollback-cleanup.ts（唯一）
入口注册：src/http/routes.ts → POST /dashboard/api/reqboard/req/rollback-cleanup
回执字段：src/application/use-cases/RollbackCleanup.ts（canceled / restoredLinks / matchedBy / skipped / note）
```

**存量形状实测**（读真实台账）：

```
全仓 22 条需求：20 条无 rollback、2 条为旧形状（只有 from/to/at/by，无 seq）
→ 用例「存量形状（无 seq）：序号按 1 计，且走兜底匹配」覆盖；且不被序号校验挡死
```

## 五、活体探针（只读，真实数据）

对 **REQ-261001203710-0fbf 的真实队列**（73 张：70 canceled + 3 done）跑兜底清场计划：

```
npx tsx /tmp/probe-0fbf-cleanup.mts

卡片总数 73 / 未取消 3（全部 done）
matchedBy = reworkOf+title-prefix
将取消 0 张      ← 活卡只有 3 张 done，一张都不该被清
父子关系还原 0
跳过 3（全部「done 卡不清理」）
结论：done 卡零误触 ✅；仅取消未取消的卡 ✅
```

这条同时证明两件事：① 清场不会吞掉已完成的活；② 对真实旧数据不会误杀。

## 六、全量回归与类型检查

```
npx vitest run
→ Test Files  46 failed | 344 passed | 3 skipped (393)
→ Tests       96 failed | 4018 passed | 20 skipped (4134)

开工基线（交接文档）：96 failed / 4003 passed
→ 失败数逐字相等（零新增失败）；通过数 +15 全部为本轮新增用例

npx tsc --noEmit -p tsconfig.json
→ 211 条全量；本批 8 个改动文件零错误
→ 基线漂移（146 → 211）全部落在别的窗口在途文件，已在 t-37dc35 留痕
```

## 七、构建

```
pnpm build → 成功
dist/index.mjs 指纹 8948924043c7（2026-10-04 16:58）
新符号入包自检：rollback-cleanup / executeRollbackCleanup / lastMaterialized /
               REQBOARD_UNKNOWN_ROLLBACK_SEQ / reworkOf+title-prefix / req/rollback-cleanup
```

⚠️ **挂账**：运行中的宿主 15:14 启动、早于本次构建，故上述路由与行为尚未在活宿主生效，
需重启 DSH 后做一次跨项目 / 清场实测（与 `notes/progress-and-handoff.md` 三件挂账第 2 条同源）。
