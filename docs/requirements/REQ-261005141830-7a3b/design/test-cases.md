---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 测试策略与用例（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）。每条用例都可跑、可证伪；命令一律给到文件级。
> 场景出处见 `use-cases.md`。

## 测试层级与载体 `serves: FR-1, FR-8`

| 层级 | 载体 | 覆盖什么 |
|---|---|---|
| 纯函数单测 | `tests/project-identity.test.ts`（新增） | 会话→项目、项目→根、同一项目判据（含软链 / 缺 id / 同形路径 / N:1） |
| 契约与落库单测 | 并入上面的文件（同一需求一个测试文件） | `projectId` 进摘要、进分片、进 SQLite 行映射、`filter.projectId` |
| 根解析回归 | `tests/design-gate-workspace-root.test.ts`（既有） | 读侧 12 处调用、写侧 15 处调用的口径不退化 |
| 跨项目分区回归 | `tests/project-scope.test.ts`（既有） | 扫描不被别的项目污染；`PROTECTED_WRITERS` 名单与新判定点同步 |
| E2E | `tests/project-identity.e2e.test.ts`（新增） | 真实 HTTP + 台账 + 假项目注册表，三窗口并行 |
| 类型 / 全量 | `pnpm typecheck`、`pnpm test` | 改动文件零新增错误；失败数 ≤ 基线 |

## 用例表（单测，逐条可跑） `serves: FR-1, FR-2, FR-3, FR-4, FR-7, FR-10, FR-11`

| 编号 | 场景 | 期望 | 命令 |
|---|---|---|---|
| T-01 | 假注册表两条项目，两个会话各属其一 | 各解析出各自 `projectId` | `npx vitest run tests/project-identity.test.ts -t T-01` |
| T-02 | 注册表未装配 / `list` 抛错 / 会话不在任何 `sessionIds` | 一律 `undefined`，**不抛、不编造** | 同上 `-t T-02` |
| T-03 | 同一 `projectId`，两条记录路径写法不同（含软链、尾斜杠、相对） | `sameProjectOf` → `same=true, by='project-id'` | 同上 `-t T-03` |
| T-04 | 两个不同 `projectId`，路径字符串恰好同形 | `same=false, by='project-id'`（id 优先，路径不参与） | 同上 `-t T-04` |
| T-05 | 任一侧缺 `projectId`，路径形状相同 | `attributed=false, by='path-fallback'`（必须标注） | 同上 `-t T-05` |
| T-06 | 两侧都缺 `projectId` 且路径无法比较 | `same=false`（**不猜**是同一项目） | 同上 `-t T-06` |
| T-07 | `projectId` → 根：条目 `path`；条目缺失 / `path` 为空 | 命中取 `path`；否则 `undefined`（触发兜底） | 同上 `-t T-07` |
| T-08 | 立项写入：窗口属 P1 | 记录 `projectId='P1'`；摘要里也带 `projectId` | 同上 `-t T-08` |
| T-09 | 立项写入：窗口不属任何项目 | 记录**无** `projectId`；评论含"未归属项目" | 同上 `-t T-09` |
| T-10 | 同项目 3 条需求 | `filter.projectId` 查到 3 条；另一项目查 0 条 | 同上 `-t T-10` |
| T-11 | 同项目另一窗口立项（该窗口未绑需求） | **不被"本项目已有需求"拒**（守卫仍窗口级） | 同上 `-t T-11` |
| T-12 | 推进同项目其中 1 条 | 另 2 条的 `projectId`、根、产物归属零变化 | 同上 `-t T-12` |
| T-13 | 台账读路径：记录有 `projectId` 且注册表在位 | 取根走项目条目 `path`，**不读共享单例当前值** | 同上 `-t T-13` |
| T-14 | 存量记录（无 `projectId`，有 `workspaceRoot`） | 回落该路径，`attributed=false`，读写全通 | 同上 `-t T-14` |
| T-15 | 存量记录连 `workspaceRoot` 也没有 | 用调用方兜底根 + 标注；两者都没有 → 结构化失败码 | 同上 `-t T-15` |
| T-16 | SQLite 老库（无 `project_id` 列）打开 | 幂等加列成功，旧行读为 `undefined`，不丢数据 | 同上 `-t T-16` |
| T-17 | Dive 归属：窗口与需求 `projectId` 相等 / 不等 | 相等 → 可读可写；不等 → 零投递 + 留痕 | 同上 `-t T-17` |
| T-18 | 派席：需求 P1、目标窗口 P2 | 拒 `REQBOARD_CROSS_PROJECT_SEAT`，文案含两个 id 与根 | 同上 `-t T-18` |
| T-19 | 派席：需求 P1、目标窗口 P1（异 session） | 成功（`changed=true`） | 同上 `-t T-19` |
| T-20 | 解绑（`remove=true`）跨项目窗口 | 不因项目而拒（只做减法） | 同上 `-t T-20` |
| T-21 | 交接（handoff）到跨项目窗口 | 被拒且**台账零改动** | 同上 `-t T-21` |

## E2E 用例（三窗口并行，真实链路） `serves: FR-4, FR-6, FR-7`

| 编号 | 场景 | 期望 |
|---|---|---|
| E-01 | 窗口 x / y 同属 P1、窗口 z 属 P2，两项目各一条需求 | x、y 的请求都看到 P1 的需求集；z 只看 P2；三方产物互不越界 |
| E-02 | x 写入期间 z 触发一次 `reqboard_status`（改走共享单例根） | x 的写入仍落 P1；x 回执无异常；P2 目录零新增 |
| E-03 | x 与 y 同属 P1、P1 一条 armed 需求绑 x，两窗口先后 idle | 归属都通过，但**起轮只发生一次**（断言投递次数 = 1） |
| E-04 | 跨项目派席（x 的需求派给 z） | HTTP 层返回 `REQBOARD_CROSS_PROJECT_SEAT`，台账席位表不变 |

命令：`npx vitest run tests/project-identity.e2e.test.ts`

## 回归与基线 `serves: FR-5, FR-6`

```
# 根解析（读侧 12 处 / 写侧 15 处调用的口径不得退化）
npx vitest run tests/design-gate-workspace-root.test.ts

# 跨项目分区与写盘点静态门禁（新增判定点必须进名单，不放宽门禁）
npx vitest run tests/project-scope.test.ts

# 类型检查（kb C-15：改动文件零新增错误；HEAD 基线 223 个历史错误）
pnpm typecheck

# 全量（kb C-14：失败数不得高于 HEAD 基线，当前记录为 106 failed）
pnpm test
```

基线纪律：跑之前先在 HEAD 上取一次基线数（`npx vitest run` / `npx tsc --noEmit`），
本次不得高于它；出现新增失败即本次引入，当场修。

## 判别力自证（停用即红） `serves: FR-9`

每条新接线点都必须有"停用即红"的证明，否则用例是空过的：

| 停用什么 | 哪条必须变红 |
|---|---|
| `rootOf` 的 `projectId` 分支（改回只读 `workspaceRoot`） | T-13、E-02 |
| `sameProjectOf` 的 id 优先分支 | T-03、T-04 |
| 看板按 `projectId` 过滤 | T-10、E-01 |
| Dive 归属比较 | T-17、E-03 |
| 派席项目校验 | T-18、E-04 |
| 立项写 `projectId` | T-08、E-01 |

做法：本地临时停用 → 期望对应用例红 → 恢复 → 记录证据（命令 + 红/绿摘要）进验收材料。

## 取证与验收口径 `serves: FR-9, FR-10`

```
# 台账项目归属分布（设计与验收共用；期望在实施后出现 projectId 非空的行）
python3 -c "import json,glob,collections,os;p=os.path.expanduser('~/.dsh/reqboard')+'/**/record.json';print(collections.Counter((json.load(open(f)).get('workspaceRoot'),json.load(open(f)).get('projectId')) for f in glob.glob(p,recursive=True)).most_common())"
```

通过标准（跑什么 → 看到什么算过）：

1. T-01~T-21 与 E-01~E-04 全绿，且上表每一行的"停用即红"都被现场证明过一次。
2. `tests/project-scope.test.ts`、`tests/design-gate-workspace-root.test.ts` 零新增失败。
3. `pnpm typecheck` 改动文件零新增错误；`pnpm test` 失败数 ≤ HEAD 基线。
4. 台账分布里出现 `projectId` 非空的记录（新立项），存量 56 条保持可用且被标注为未归属。
