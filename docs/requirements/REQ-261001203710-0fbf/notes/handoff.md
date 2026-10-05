# 接手说明（REQ-261001203710-0fbf）

> 给新窗口：请读这份文件并按其执行。原文由 `session-a8201e1d` 的窗口交接（该窗口上下文已耗尽）。

## 这是什么

PM 插件（`/Users/mac/Documents/ai/dsh/dsh-pmboard`）的一张需求：**让每条需求只在它自己的项目里读写；写错地方就当场拒绝并报出两个绝对路径**。它由一次真实事故立项——A 项目里给 B 项目的需求落库，把 `queue.json` 与任务卡写进了 A 项目。

## 先读这四份（都在 `docs/requirements/REQ-261001203710-0fbf/`）

1. `verification.md` —— 验收材料：交付结论 + 12 条可复跑证据 + 6 条已披露缺口。**先读这份。**
2. `notes/cleanup-plan.md` —— 台账清场方案（保留 3 张 / 取消 53 张，逐 ID）
3. `notes/cleanup-cards.sh` —— 清场脚本（53 个 ID 已内联，支持干跑）
4. `notes/rollback.md` —— 兼容口径 + 回滚说明

## 已完成（有证据，勿重做）

| 卡 | 内容 |
|---|---|
| t1 | 项目维度唯一口径：`projectRootOf` / `partitionByProject` / `sameProjectRoot` / `normalizeProjectRoot` |
| t2 | 看板扫描逐记录解析（不再「全部 id × 同一 cwd」），返回 `{scanned, skipped}` |
| t3 | 写盘守卫 `ensureWritableProjectRoot`（只核验不重定向）+ 评论留痕 + `used_project_root` 契约 |
| t4 | 知识层两种病因可区分（「本项目没生成」vs「根指到别的项目」） |
| t5 | 两项目夹具 + 未归属标注（含一处已披露的夹具缺口） |
| t6 | 兼容口径与回滚说明（文档内每个数字当场复核） |
| t7 | 判定下沉：8 个文档写入器 + 2 个队列收口（`mutateQueue` / `createManyQueue`，12 处迁移） |
| t8 | 静态覆盖门禁（新裸写变红并点名 `文件:行`；白名单与待偿清单防腐烂） |

自证：`npx vitest run tests/project-scope.test.ts` → **28 passed**；`pnpm build` 成功且 `dist/index.mjs` 内含各修复标记。

## 未完成（按顺序）

1. **等用户重启宿主**（必须）。当前宿主跑的是重建 dist 之前的旧代码。
2. **清场**：`DRY=1 bash docs/requirements/REQ-261001203710-0fbf/notes/cleanup-cards.sh` 先核对，再真跑。
3. **跨项目活体实测**：在 A 项目里对 B 项目的需求发起落库，期望**当场拒绝并报出两个绝对路径**。
4. 拿到活体证据后：`reqboard_submit(kind=verification)` 提交验收材料。

## 三条必须知道的事实

1. **宿主曾报「全看板任务数 0」，而 `queue.json` 里有 73 张任务** —— 这正是本需求要修的 bug 的**活体证据**，说明旧代码仍在运行。
2. **台账里 t7 / t8 没有卡**：计划批准后「自动开跑」投递失败（`background jobs unavailable: no job controller serves this agent`），两卡从未落库。其工作已完成，**这个缺口必须写进验收材料，不许靠事后补卡掩盖**。
3. **回退机制把卡片链炸成 73 张**（56 张 `[重做]`，含 `…·研发·研发` 这类二阶膨胀）。缺陷报告在 `notes/rollback-card-explosion.md`，请转交做回退的那个窗口（REQ-261003204149-1e80）。

## 交接方的教训（请当纪律用）

本需求实施期间出过 5 次错，其中最后一次最值得记：**写了个不看服务端回答就宣布成功的检查器**——53 次 `cancelled` 其实是 53 次 404，台账一张未动。那是**假门禁**。

- 凡「成功」必须有**可复核的原始输出**（响应体、退出码、文件清单），不能只看一层包装的返回值；
- 凡「应该没问题」都不许收尾；
- 写盘类守卫**只核验、不代为重定向**（曾有一版「代为校正」把文件重定向写进真实仓库，51 个污染目录，已清理）。

## 操作权限

本窗口已被派 **worker 席位**（`reqboard_bind`），可以领卡、汇报、提交产物。需求当前状态：`implementing`。
