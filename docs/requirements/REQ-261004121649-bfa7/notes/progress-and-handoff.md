# 进度与交接（REQ-261004121649-bfa7）

> 用途：任何窗口接手时，照本文件即可续跑，不必重新推导。
> 最后更新：本轮（t1 完成、t2/t4 代码与用例完成并验证）

## 一、已完成并验证

| 卡 | 交付 | 验收证据 |
|---|---|---|
| **t1** 只物化顶层父卡 | `rollback-tasks.ts` 物化段分流：`isTopLevel(t) = (t.parentId ?? '') === ''` → 只有顶层父卡进 `reworkDrafts`；子卡副本 status 回 `todo` 且**保留** `parentId`/`stageKind`，进新增字段 `resetTasks`。会话侧 `MoveRequirement.ts` 与看板侧 `requirements.ts` **两条回退路径**同步消费 | `npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层"` → 3 passed（6 物化 / 11 复位 / 6 取消）；`tests/rollback-tasks.test.ts` → 7 passed |
| **t2** 幂等 + 上限 | 已有「活的重做卡」指向该父卡 → 不再物化；`reworkOf` 非空的卡（重做卡自己）也不物化；`ROLLBACK_MATERIALIZE_LIMIT = 20`，超限在**编排期**抛 `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT`（文案含张数/上限/「队列未被改动」） | `-t "幂等"` 3 passed；`-t "上限"` 3 passed |
| **t4** 物化即终态 | 重做草稿显式 `stages: []` | `-t "不自动展开链"` 1 passed |

**当前全量数据**（其它窗口在并发改动，基线会浮动）：

```
npx vitest run tests/rollback-materialize.test.ts   → 7 passed
npx tsc --noEmit -p tsconfig.json                   → 146 条（本次改动文件零错误）
npx vitest run                                      → 96 failed / 4003 passed（改动面零失败）
```

**卡仪式状态**：t1 全链已关闭；**t2（`t-b721a6`）与 t4（`t-c98915`）的父卡完工记录已登记，但子卡链与关闭未走**。

## 二、待续跑

```
① 卡仪式：t-b721a6 / t-c98915 各开子卡链（研发→联调→复核→测试）→ 关闭父卡
   ⚠️ 连续关闭两张卡之间必须等 ~62 秒（REQBOARD_BULK_CLOSE 防呆窗）
② t3 仅人批量清理入口
   - POST /dashboard/api/reqboard/req/rollback-cleanup，body { id, rollbackSeq }
   - 消费 requirement.rollback.lastMaterialized：批量置 canceled（**不碰 done 卡**）+ 按 reworkOf 还原父子关系
   - 回执给 canceled / restoredLinks 两个可核对数字；agent 身份调用 → REQBOARD_HUMAN_GATE
   - 幂等：同一次清理两次 → 第二次 canceled === 0
③ t6 老数据兜底（**依赖 t3**）：无 `lastMaterialized` 记录的旧卡按 `reworkOf` + 标题前缀匹配，
   **回执必须如实说明匹配方式**（matchedBy / skipped），不许假装精确
④ t5 用例补齐：目标 7+ 条，每条都要「修复前必红」；显式补「重复回退两次 → 第二次物化 0 张」
```

## 三、我踩过的坑（直接照抄，别重踩）

1. **契约加字段会撞「严格相等」断言**：`tests/rollback-tasks.test.ts:105` 原本断言 plan 完全等于
   `{ canceled: [], reworkDrafts: [] }`，加 `resetTasks` 后必红。改契约时**先 grep 一遍 `toEqual(`**。
2. **测试夹具对象形状要全**：`applyRequirementRollback` 会往 `req.statusHistory` / `comments` / `artifacts`
   写，夹具缺任何一个都会在运行期炸（`Cannot read properties of undefined`），而 tsc 不会报。
3. **别把测试写进真实工作区**：今天有一次改动把文件重定向进了真实仓库（51 个污染目录，已清理）。
   新用例一律用内存对象（本需求 `tests/rollback-materialize.test.ts` 就是）。
4. **判定必须在落库前**：t2 的上限之所以能断言「队列零新增」，是因为它在**编排期**抛错——顺序即正确性。
5. **台账文件滞后于宿主内存**：读 `~/.dsh/dsh-reqboard.json` 可能读到旧状态，判定请用 `reqboard_status`。

## 四、本需求外的三件挂账

1. 旧窗口 **REQ-261001203710-0fbf 的 53 张垃圾卡清场**——t3 交付后可用清理入口一键做完
   （逐 ID 清单在 `docs/requirements/REQ-261001203710-0fbf/notes/cleanup-plan.md`）；
2. **构建后重启的活体验证**（该批次修复已在 `dist/index.mjs` 里，需重启宿主后跑一次跨项目拒绝实测）；
3. 待立 bug：**「确认门在前提不满足时留下挂起记录，反而挡住能满足它的那一步」**
   ——本轮实测卡住两个窗口，属工具链前后置顺序缺陷。
