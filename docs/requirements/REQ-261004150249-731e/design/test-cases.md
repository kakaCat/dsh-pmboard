---
req_id: REQ-261004150249-731e
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 测试策略（REQ-261004150249-731e）

> 两个新测试文件 + 一个探针脚本，逐条对应 FR；回归口径与既有 open-window / bind-seat / capture 用例比对。
> 每条策略都带「**正向生效** + **未配置/读数缺席即现状**」两面——后者是本需求最重要的不变量。

## 用例矩阵 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 文件 | FR | 用例 | 断言要点 |
|---|---|---|---|
| `tests/handoff-owner.test.ts` | FR-1 | 3 | ① `create({ workspaceId })` 被透传（替身记录 opts）；② 无 workspace 时回落 `cwd`；③ 两者都拿不到 → 响亮失败且**不建会话** |
| 同上 | FR-2 | 4 | ① 交接后新窗 `owner` / 旧窗 `observer` / `sourceSessionId` 同步；② 一次 mutate（用打点断言语义：失败时三处**都不变**）；③ 无 `seats` 存量记录被**物化**为两条；④ INV-1（不得产出空 owner）与 INV-2（席位↔`sourceSessionId` 同指一窗） |
| 同上 | FR-5 | 3 | ① 非 owner → `REQBOARD_SEAT_NOT_OWNER` 且台账零改动；② `to_window` 不存在/等于源 → `REQBOARD_HANDOFF_TARGET_INVALID`；③ 幂等：同目标重复调用只补投递、不重复改席位 |
| `tests/handoff-policy.test.ts` | FR-3 | 6 | ① `0.74/0.75/0.84/0.85/0.89/0.90` 六点边界；② 字段缺席（三字段各缺一次）→ `'unknown'`；③ `source='unavailable'` → `'unknown'`；④ **不补 0**：`projectedTokens=0` 是合法值（不得判成缺席）；⑤ 配置非法（`warn≥fork`）→ 装配期抛错；⑥ `critical` 覆盖 `pendingHandoff`（不等边界） |
| 同上 | FR-4 | 3 | ① `createMessage` 的 `kind === 'reqboard-handoff'` 且**绝不为 `user`**；② 投递失败 → 交接仍成立 + `delivery.delivered=false` + `reason`；③ `crossWindowDeliver` 未装配时如实报"未装配"（不谎报 delivered） |
| `scripts/handoff-probe.mts`（新增） | FR-1,2,6 | 1 | 对临时台账 dry-run 真跑一次交接，打印 `from/to/old_role/new_role/source_session` 并断言 `seats.owner.windowKey === sourceSessionId`，退出码 0 |

## 行为等价验证（未启用面） `serves: FR-2, FR-3`

| 面 | 等价判据 |
|---|---|
| 开窗 | 不传 `opts` 时 `svc.create` 收到的实参与改造前**逐字节相同**（`{}`） |
| 席位 | 不调用 `reqboard_handoff` / 看板改绑时，`seats` 与 `sourceSessionId` 与改造前一致（无新增键） |
| 判据 | 未配置 `handoff` → 三档缺省值，且**不存在**任何后台自动开窗路径（静态断言：无定时器/扫描注册） |
| 回执 | `delivery` 未发生时键缺席的既有语义不破（`reqboard_open_window`） |

## 回归口径 `serves: FR-6`

```bash
./node_modules/.bin/vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts
./node_modules/.bin/vitest run tests/open-window-tool.test.ts tests/bind-seat.test.ts \
                               tests/capture-window-bound-policy.test.ts tests/binding-trace.test.ts
npx tsx scripts/handoff-probe.mts
npx tsc --noEmit
pnpm build
```

**逐条对照需求文档「判定标准」**：第 1 条对应矩阵前三行；第 2 条对应探针；第 3 条对应 `handoff-policy`；
第 4 条为实机复核（人）；第 5 条为回归口径。

## 反向演练（防线有效性） `serves: FR-1, FR-2, FR-3, FR-4`

| 演练 | 操作 | 期望 |
|---|---|---|
| 落错项目防线 | 让 `resolveSourceProject` 返回 `undefined` | 开窗**不发生**，回执 `REQBOARD_OPEN_WINDOW_UNAVAILABLE`（不再静默落宿主目录） |
| 假成功防线 | 对已有显式 `seats` 的需求走看板改绑 | 席位真的换到新窗口（现状：回 `rebound:true` 但席位不动 → 本演练必须红转绿） |
| 读数缺失防线 | 删掉投影 → `source='unavailable'` | `decideHandoff='unknown'`，**无**自动交接发生 |
| 冒充人类防线 | 检查投递消息的 `source.kind` | 恒为 `reqboard-handoff`，永不 `user` |
| 半截交接防线 | 在 `handoffOwner` 的 mutate 内注入异常 | 席位与 `sourceSessionId` 三处**都不变**（无半个交接） |

## 实机复核（人可复核，对应判定标准第 4 条） `serves: FR-1, FR-2`

1. 在 dsh-pmboard 项目里开新会话 → 侧栏应出现在该项目分组（**不是**「未分组」）；
2. 新窗口 `reqboard_status` → `my_seat.role == "owner"`，`open_requirements` 含该需求；
3. 新窗口写一个产物（如 `reqboard_submit` 或任一写工具）→ 不报 `PROJECT_ROOT_MISMATCH`；
4. 原窗口 `reqboard_status` → `my_seat.role == "observer"`，写操作被明确拒（`REQBOARD_SEAT_READONLY`）。
