# 测试证据：看板运行设置（REQ-261004103330-005f）

> 每条都给出**可复核命令**与**实测结果**；数字取自"所有代理停手后的干净一轮"，不是在并发写盘期间测的。

## 一、本需求新增/扩展的测试文件与用例数

| 测试文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/reqboard/settings-file.test.ts` | 25 | 来源顺序四态、非法值作废与沿链下探、环境变量逐项解析、后端待重启、系统记录追加与截断、库结构自洽 |
| `tests/reqboard/settings-init.test.ts` | 14 | 启动自动建档、设置文件惰性创建、写失败降级、损坏响亮、路径档案每次启动刷新（含幂等与只读目录） |
| `tests/reqboard/sqlite-store.test.ts` | 18 | SQLite 适配器全端口：逐字段一致、事务、CAS、冷侧、排序契约、游标分页、库结构不匹配 |
| `tests/reqboard/store-contract.test.ts`（扩展） | 115 | **三实现同跑一份契约**：内存 34 / 分片 32 / **SQLite 32** / 只读替身 15 |
| `tests/reqboard/pending-confirm-consume.test.ts` | 10 | 一次性票据：并发只成功一次、过期、未落章、否定作答 `denied`、不消费 |
| `tests/reqboard/settings-router.test.ts` | 24 | 五条路由：成功、400 拒收后端字段、越界、无票 403、重放 403、空操作不烧票、档案损坏 200 |
| `tests/reqboard/settings-migrate-dispatch.test.ts` | 10 | 开窗投递：三态失败分明、成功返回窗口码、**失败与成功都逐字节不动档案** |
| `tests/reqboard/sqlite-migrate.test.ts` | 11 | 八步迁移：条数与 id 全等、抽样逐字段、干跑零副作用、注入失败源数据逐字节未变、陈旧库先备份、**迁移留痕成功/失败都写** |
| `tests/reqboard/migration-gate.test.ts`（扩展） | 12 | 两种未就绪**文案互不出现**，各指向不同脚本 |
| `tests/dive-stage-limit-snapshot.test.ts` + `tests/dive-round-driver.test.ts`（扩展） | 67 | 上限读快照、未装快照回落默认（兼容）、非法值回落、下调当拍停手不掐断在跑回合 |
| `tests/settings-dialog.test.ts` | 30 | 弹窗骨架：挂文档体（容器重绘不丢）、菜单切屏、ESC/遮罩、无死按钮、无令牌违规 |
| `tests/settings-limits.test.ts` | 21 | 上限屏：九行渲染、脏态、非法三态、保存刷新徽章、恢复默认 |
| `tests/settings-storage.test.ts` | 31 | 存储屏：四态机、票据不落本地存储、七类错误文案各自独立、失败重试重新取票、事实显示 |
| `tests/settings-records.test.ts` | 18 | 记录屏：五类事件、陈旧红字**且无合并入口**、版本不一致给重建指引、通用屏禁用态 |
| `tests/reqboard/settings-e2e.test.ts` | 3 | **三条端到端**（见下） |

合计新增约 **300+ 条**用例；本需求文件类型检查零错误。

## 二、三条端到端（最关键证据）

```
npx vitest run tests/reqboard/settings-e2e.test.ts   →  3 passed
```

| 链条 | 断言要点 | 实测 |
|---|---|---|
| E2E-1 上限生效 | 设置文件 `implementing=5` → 真驱动到 5 当拍停手、意图仍 armed、留痕含「上限=5」而非 1000；放宽到 10 后照常起轮 | 通过 |
| E2E-2 切库全链 | 真跑迁移脚本 → 库内 id 与分片**逐条相等** → 设置写 sqlite → **重启后装配从库读** | 通过（**此链条抓出并修复了"重启不生效"的真缺陷**） |
| E2E-3 未迁移拒绝服务 | 选了 sqlite 未迁移就重启 → 未就绪 → HTTP **503** 且**响应无数据体**（不返回空册） | 通过 |

## 三、反向演练（逐条"红 → 恢复 → 绿"）

全程手工精确编辑 + 手工恢复；**未使用任何宽范围 git 命令**（工作区压着其它窗口数百个未提交改动）。

| 演练 | 移除什么 | 红的表现 | 恢复后 |
|---|---|---|---|
| A | 迁移脚本清理分支 | 校验失败用例**红**，残留恰为暂存库 + wal + shm 三文件 | 11/11 绿 |
| B | 写反来源优先级 | **红 2 条**（优先级、非法值沿链下探） | 27/27 绿 |
| C | 源头"否定作答必拒"校验 | **红 2 条**，同时**路由层 34 条仍全绿** | 10/10 绿 |

演练 C 证明两道防线各自独立——不是重复劳动。

## 四、收口口径（**含如实申报**）

| 检查 | 命令 | 结果 | 与基线 |
|---|---|---|---|
| 相关三目录 | `npx vitest run tests/reqboard tests/application tests/http` | **1 failed / 564 passed** | 基线 1/492 → **失败持平**（存量 ID 格式漂移） |
| 全量 | `pnpm test`（干净一轮） | **97 failed / 4323 passed / 20 skipped** | 基线 46 文件 / 96 用例 → 47 文件 / **97 用例** |
| 类型 | `npx tsc --noEmit \| grep -c 'error TS'` | **146** | 基线 146 → 持平；本需求文件零错误 |
| 前端产物 | `pnpm build:client` | 通过，393499 字节，verify 三项全过 | 新增 |

**⚠️ 如实申报**：全量「失败数 ≤ 基线」**字面不成立**（97 对 96，多 1）。更硬的命题成立：
**失败集合与本需求零交集**——多出的那条是 `tests/project-scope.test.ts`，报的违规点
`src/application/use-cases/EnsureKnowledgeLayer.ts:169` 所在的文件在 git 里是 `??`（**别的窗口正在新建**）。

## 四′、返工后新增：原型对齐断言（**形态**）

| 测试文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/prototype-parity.test.ts` | **15** | 四屏形态：色点与中文副标题（且不得出现英文 key）、说明框含保存路径与来源顺序、分段开关语义、数据位置与改路径、生效来源与时机、手动迁移命令与 Agent 说明、五步清单、记录屏四组 + 版本两行 + 无合并入口、通用屏六组 + 尚未创建、**四屏共有形态（屏标题）** |
| `tests/settings-storage.test.ts`（+4） | 35 | 改路径：保存 / 空值不发请求 / 未装配如实说 / 取消不发请求 |
| `tests/settings-records.test.ts`（+2） | 20 | 两行恒定存在（拿不到值写"未知"，不省整行） |

> 这一组断言是被人验收反馈"实现和原型不一致"逼出来的：**原来的四张前端卡只断言文案与行为，
> 没有一条管形态**。现在形态会红：施工期间 9 红，收口后 15 全绿；其中"四屏共有形态"那条
> **当场抓出记录屏 `ready` 分支漏拼屏标题**的真 bug（正常态反而没标题，单屏测试发现不了）。

## 四″、同期新增：内置默认值下限守卫

| 测试文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/stage-defaults-floor.test.ts` | **3** | 九个阶段的内置默认一律 ≥ 5（人裁定 2026-10-04）；四个不自动跑的阶段也在内；阶段数一个不漏 |

## 五、任务卡 → 测试覆盖对照（门禁要求逐卡标注）

每张卡（含其研发/联调/复核/测试四段子卡）的测试证据如下：

- covers: t-47ad9b — t1 定契约（端口 + 设置解析 + DDL 常量 + 错误码映射） → tests/reqboard/settings-file.test.ts（25 项）
- covers: t-f57a19 — t1 定契约（端口 + 设置解析 + DDL 常量 + 错误码映射）·研发 → tests/reqboard/settings-file.test.ts（25 项）
- covers: t-6582fa — t1 定契约（端口 + 设置解析 + DDL 常量 + 错误码映射）·联调 → tests/reqboard/settings-file.test.ts（25 项）
- covers: t-17227e — t1 定契约（端口 + 设置解析 + DDL 常量 + 错误码映射）·复核 → tests/reqboard/settings-file.test.ts（25 项）
- covers: t-844625 — t1 定契约（端口 + 设置解析 + DDL 常量 + 错误码映射）·测试 → tests/reqboard/settings-file.test.ts（25 项）
- covers: t-f36a66 — t2 设置文件与系统记录适配器 → tests/reqboard/settings-init.test.ts（14 项）
- covers: t-ef5139 — t2 设置文件与系统记录适配器·研发 → tests/reqboard/settings-init.test.ts（14 项）
- covers: t-9c1d5c — t2 设置文件与系统记录适配器·联调 → tests/reqboard/settings-init.test.ts（14 项）
- covers: t-a50122 — t2 设置文件与系统记录适配器·复核 → tests/reqboard/settings-init.test.ts（14 项）
- covers: t-185b29 — t2 设置文件与系统记录适配器·测试 → tests/reqboard/settings-init.test.ts（14 项）
- covers: t-3294af — t3 SQLite 适配器全端口 → tests/reqboard/sqlite-store.test.ts（18 项）
- covers: t-b97403 — t3 SQLite 适配器全端口·研发 → tests/reqboard/sqlite-store.test.ts（18 项）
- covers: t-890db3 — t3 SQLite 适配器全端口·联调 → tests/reqboard/sqlite-store.test.ts（18 项）
- covers: t-aa415d — t3 SQLite 适配器全端口·复核 → tests/reqboard/sqlite-store.test.ts（18 项）
- covers: t-ff9b2e — t3 SQLite 适配器全端口·测试 → tests/reqboard/sqlite-store.test.ts（18 项）
- covers: t-e9154c — t4 SQLite 进契约注册表 → tests/reqboard/store-contract.test.ts（115 项，SQLite 占 32）
- covers: t-9ddd8d — t4 SQLite 进契约注册表·研发 → tests/reqboard/store-contract.test.ts（115 项，SQLite 占 32）
- covers: t-8132cb — t4 SQLite 进契约注册表·联调 → tests/reqboard/store-contract.test.ts（115 项，SQLite 占 32）
- covers: t-41d4e8 — t4 SQLite 进契约注册表·复核 → tests/reqboard/store-contract.test.ts（115 项，SQLite 占 32）
- covers: t-f32478 — t5 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪 → tests/reqboard/migration-gate.test.ts（12 项）
- covers: t-e35b53 — t5 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪·研发 → tests/reqboard/migration-gate.test.ts（12 项）
- covers: t-68f239 — t5 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪·联调 → tests/reqboard/migration-gate.test.ts（12 项）
- covers: t-9ca32c — t5 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪·复核 → tests/reqboard/migration-gate.test.ts（12 项）
- covers: t-b5dda9 — t5 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪·测试 → tests/reqboard/migration-gate.test.ts（12 项）
- covers: t-fc0caa — t6 上限生效（同步快照） → tests/dive-stage-limit-snapshot.test.ts + tests/dive-round-driver.test.ts（67 项）
- covers: t-65f67b — t6 上限生效（同步快照）·研发 → tests/dive-stage-limit-snapshot.test.ts + tests/dive-round-driver.test.ts（67 项）
- covers: t-7d3116 — t6 上限生效（同步快照）·联调 → tests/dive-stage-limit-snapshot.test.ts + tests/dive-round-driver.test.ts（67 项）
- covers: t-2048e5 — t6 上限生效（同步快照）·复核 → tests/dive-stage-limit-snapshot.test.ts + tests/dive-round-driver.test.ts（67 项）
- covers: t-53c4ad — t6 上限生效（同步快照）·测试 → tests/dive-stage-limit-snapshot.test.ts + tests/dive-round-driver.test.ts（67 项）
- covers: t-cc816f — t7 挂起确认机制扩写（一次性 consume） → tests/reqboard/pending-confirm-consume.test.ts（10 项）
- covers: t-1d9c8a — t7 挂起确认机制扩写（一次性 consume）·研发 → tests/reqboard/pending-confirm-consume.test.ts（10 项）
- covers: t-8742f1 — t7 挂起确认机制扩写（一次性 consume）·联调 → tests/reqboard/pending-confirm-consume.test.ts（10 项）
- covers: t-750590 — t7 挂起确认机制扩写（一次性 consume）·复核 → tests/reqboard/pending-confirm-consume.test.ts（10 项）
- covers: t-cb7bb6 — t7 挂起确认机制扩写（一次性 consume）·测试 → tests/reqboard/pending-confirm-consume.test.ts（10 项）
- covers: t-425fa6 — t8 settings 五条路由 → tests/reqboard/settings-router.test.ts（24 项）
- covers: t-f1b43f — t8 settings 五条路由·研发 → tests/reqboard/settings-router.test.ts（24 项）
- covers: t-a35c4c — t8 settings 五条路由·联调 → tests/reqboard/settings-router.test.ts（24 项）
- covers: t-05c494 — t8 settings 五条路由·复核 → tests/reqboard/settings-router.test.ts（24 项）
- covers: t-c33354 — t8 settings 五条路由·测试 → tests/reqboard/settings-router.test.ts（24 项）
- covers: t-19092c — t9 迁移脚本八步 + 兼容回滚 → tests/reqboard/sqlite-migrate.test.ts（11 项）
- covers: t-1b52c9 — t9 迁移脚本八步 + 兼容回滚·研发 → tests/reqboard/sqlite-migrate.test.ts（11 项）
- covers: t-5c4df7 — t9 迁移脚本八步 + 兼容回滚·联调 → tests/reqboard/sqlite-migrate.test.ts（11 项）
- covers: t-f919b6 — t9 迁移脚本八步 + 兼容回滚·复核 → tests/reqboard/sqlite-migrate.test.ts（11 项）
- covers: t-4c3aaa — t9 迁移脚本八步 + 兼容回滚·测试 → tests/reqboard/sqlite-migrate.test.ts（11 项）
- covers: t-6293b1 — t10 迁移开窗链路 → tests/reqboard/settings-migrate-dispatch.test.ts（10 项）
- covers: t-c2ed8b — t10 迁移开窗链路·研发 → tests/reqboard/settings-migrate-dispatch.test.ts（10 项）
- covers: t-c912d7 — t10 迁移开窗链路·联调 → tests/reqboard/settings-migrate-dispatch.test.ts（10 项）
- covers: t-7ed7b0 — t10 迁移开窗链路·复核 → tests/reqboard/settings-migrate-dispatch.test.ts（10 项）
- covers: t-c14e21 — t10 迁移开窗链路·测试 → tests/reqboard/settings-migrate-dispatch.test.ts（10 项）
- covers: t-124008 — t11 设置弹窗骨架与入口 → tests/settings-dialog.test.ts（30 项）
- covers: t-88be65 — t11 设置弹窗骨架与入口·研发 → tests/settings-dialog.test.ts（30 项）
- covers: t-0a0bcd — t11 设置弹窗骨架与入口·联调 → tests/settings-dialog.test.ts（30 项）
- covers: t-8351c7 — t11 设置弹窗骨架与入口·复核 → tests/settings-dialog.test.ts（30 项）
- covers: t-88da51 — t11 设置弹窗骨架与入口·测试 → tests/settings-dialog.test.ts（30 项）
- covers: t-506e9f — t12 运行上限屏 → tests/settings-limits.test.ts（21 项）
- covers: t-0053be — t12 运行上限屏·研发 → tests/settings-limits.test.ts（21 项）
- covers: t-f0ba03 — t12 运行上限屏·联调 → tests/settings-limits.test.ts（21 项）
- covers: t-2ab82d — t12 运行上限屏·复核 → tests/settings-limits.test.ts（21 项）
- covers: t-c653b3 — t12 运行上限屏·测试 → tests/settings-limits.test.ts（21 项）
- covers: t-7cd77f — t13 存储与数据库屏 + 确认门 → tests/settings-storage.test.ts（31 项）
- covers: t-323418 — t13 存储与数据库屏 + 确认门·研发 → tests/settings-storage.test.ts（31 项）
- covers: t-3fcbb6 — t13 存储与数据库屏 + 确认门·联调 → tests/settings-storage.test.ts（31 项）
- covers: t-b7044a — t13 存储与数据库屏 + 确认门·复核 → tests/settings-storage.test.ts（31 项）
- covers: t-4e066a — t13 存储与数据库屏 + 确认门·测试 → tests/settings-storage.test.ts（31 项）
- covers: t-611d89 — t14 系统记录屏 + 通用屏 → tests/settings-records.test.ts（18 项）
- covers: t-9283c8 — t14 系统记录屏 + 通用屏·研发 → tests/settings-records.test.ts（18 项）
- covers: t-662f15 — t14 系统记录屏 + 通用屏·联调 → tests/settings-records.test.ts（18 项）
- covers: t-a3ff77 — t14 系统记录屏 + 通用屏·复核 → tests/settings-records.test.ts（18 项）
- covers: t-7988ae — t14 系统记录屏 + 通用屏·测试 → tests/settings-records.test.ts（18 项）
- covers: t-33ad1b — t15 端到端与反向演练 → tests/reqboard/settings-e2e.test.ts（3 项）
- covers: t-49b5af — t15 端到端与反向演练·研发 → tests/reqboard/settings-e2e.test.ts（3 项）
- covers: t-888277 — t15 端到端与反向演练·联调 → tests/reqboard/settings-e2e.test.ts（3 项）
- covers: t-6a81b2 — t15 端到端与反向演练·复核 → tests/reqboard/settings-e2e.test.ts（3 项）
