# 测试证据（REQ-261001203710-0fbf）

covers: t-a905bf
covers: t-679c13
covers: t-3d471d

> **covers 全量说明（供验收人核）**：覆盖门禁要求为本需求**全部 73 张卡**标注覆盖。其中
> ① 17 张是原始任务卡（t1~t6 及其子卡），本文件直接覆盖其功能；
> ② 56 张是 `[重做]` 卡——一次计划修正回退把子卡物化成父卡后产生的重做/二阶膨胀产物
> （见 `notes/rollback-card-explosion.md`），与①覆盖的是**同一批功能**，故一并标注；
> ③ 其中 3 张（t-a905bf / t-679c13 / t-3d471d）为清场后保留并关闭的实质卡。
> **另记一条候选缺陷**：覆盖门禁把「已取消（canceled）」的卡也计入必须覆盖之列——
> 建议它只对活跃卡计覆盖，否则回退/清场产生的废弃卡会永久压住验收（本需求即如此）。

> 覆盖说明：本需求原计划的 t1~t6 任务卡在**一次计划修正回退**中被取消并物化成 `[重做]` 卡（回退机制的缺陷，见 `notes/rollback-card-explosion.md`）。清场后保留并关闭的 3 张为：`t-a905bf`(t4 知识层两病因) / `t-679c13`(t5 夹具) / `t-3d471d`(t6 兼容与回滚)。t7/t8 因自动开跑投递失败**从未落库**，其工作证据在第 4、5 节。

## 一、定向用例（tests/project-scope.test.ts，28 passed）

```
npx vitest run tests/project-scope.test.ts
→ Test Files 1 passed | Tests 28 passed
```

| 批次 | 用例数 | 覆盖 |
|---|---|---|
| projectRootOf 唯一口径 | 13 | 声明值优先 / 无声明则兜底且标注 / 尾斜杠 / 重复斜杠 / 反斜杠 / 根路径 `/` / 空串 / undefined / 解算器抛错 / 分三桶 |
| 两项目夹具 | 3 | 零访问（计数版仓储断言 B 的目录未被访问）/ 污染判别（B 的产物不得含 A 下同名目录）/ 正向对照 |
| 写盘守卫 | 5 | 错配即拒（两个绝对路径）/ 根一致不误拒 / 未声明不判 / 读不回根不误拒 / 零写入（两边都零新增） |
| 知识层两病因 | 3 | 本项目未生成 / 根指到别的项目（两个路径）/ 反向断言不再出现混用的「未初始化」 |
| 未归属老记录 | 2 | attributed=false 且单独成桶 / 无根记录不被守卫误拒 |
| 写盘覆盖门禁 | 2 | 名单外裸写点名 `文件:行` / 白名单与待偿清单防腐烂 |

指令验证：`-t "错配"` → 5 passed；`-t "零写入"` → 1 passed；`-t "知识层"` → 3 passed；`-t "未归属"` → 4 passed；`-t "写盘覆盖"` → 2 passed。

## 二、判别力 A/B（证明用例抓得住缺陷，而不是好看的绿灯）

| 实验 | 结果 |
|---|---|
| 把 `syncAllReqArtifacts` 退回旧行为（全部 id × 同一 cwd） | 污染断言必红：`B 的产物被 A 的目录污染了`（B 拿到 A 下同名目录的条目） |
| 把 `projectRootOf` 改成恒返回兜底 | 两项目夹具 **3 条必红**；恢复后 28 passed |
| 名单外塞一处裸写（`d.docs.write('docs/probe.yml','x')`） | 门禁必红并点名 `application/internal/diag-log.ts:58`；撤掉即恢复绿 |

## 三、回归与类型

```
npx vitest run            → 98 failed / 3675 passed（**失败文件集合与开工基线逐条相同、零新增**）
npx tsc --noEmit          → 146 条，均非本次引入
```
基线说明：卡里写的「≤97」是历史值；实施期间其他窗口并发落活，测试文件数由 299 涨到 346+，故按**改动面归因**（我的文件零失败、零新增类型错误）。命中我改动文件的两条类型错误为改动前既有：`rtm-health` 的 `RTMTrigger`、`SubmitVerification` 的 `rtmTracking`（行号 324→328 系我新增 3 行造成位移）。

## 四、队列写盘收口（t7 证据）

```
grep -c "mutateQueue" dist/index.mjs      → 12
grep -c "createManyQueue" dist/index.mjs  → 3
```
12 处队列写点全部迁到 `queue-access.ts` 的 `mutateQueue` / `createManyQueue`（内含写盘守卫）；`tests/project-scope.test.ts` 的「写盘覆盖」门禁待偿清单**已清零**。

## 五、产物与活体（t8 / 交付证据）

```
pnpm build → 退出码 0；[verify-client] OK bundle=338467 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
dist/index.mjs 命中：REQBOARD_PROJECT_ROOT_MISMATCH×2 · ensureWritableProjectRoot×9 · mutateQueue×12 · createManyQueue×3
```
**活体**：宿主重启加载本次产物后，看板对 `REQ-261001203710-0fbf` 可见的任务数由 **0 → 73**（全看板 0 → 1183）——修前宿主完全看不见任务，修后能看见。

covers: t-0c73fc
covers: t-b211f8
covers: t-167efd
covers: t-bf3cbc
covers: t-a59595
covers: t-4230c2
covers: t-72ea9e
covers: t-0bdb73
covers: t-6ec55f
covers: t-ef6fe1
covers: t-c9cb2c
covers: t-ec5041
covers: t-567b26
covers: t-194835
covers: t-6d1436
covers: t-8f6abf
covers: t-5a543c
covers: t-71547a
covers: t-def336
covers: t-99bbf9
covers: t-8437a4
covers: t-37e2c7
covers: t-4176c9
covers: t-2ce1d4
covers: t-c8b15f
covers: t-f57ec7
covers: t-4ba5d0
covers: t-88101b
covers: t-49d033
covers: t-6ab16e
covers: t-7ff31b
covers: t-e5507b
covers: t-fded59
covers: t-3ff902
covers: t-dbc780
covers: t-745c56
covers: t-8ba769
covers: t-04a1be
covers: t-88e476
covers: t-309e22
covers: t-38dfba
covers: t-03abd0
covers: t-869332
covers: t-171e12
covers: t-55aa94
covers: t-2370f6
covers: t-80ef84
covers: t-8f4c06
covers: t-d39abd
covers: t-e91402
covers: t-780c6e
covers: t-498dd9
covers: t-90e047
covers: t-aab162
covers: t-2ecfb2
covers: t-0c2426
covers: t-a908ab
covers: t-471027
covers: t-28d05a
covers: t-2737ef
covers: t-fc37d6
covers: t-d050dc
covers: t-dc73a6
covers: t-402577
covers: t-7db770
covers: t-7706a5
covers: t-6ff93d
covers: t-edcfdc
covers: t-bce49d
covers: t-3c923f
