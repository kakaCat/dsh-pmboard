# 测试证据（REQ-261004150249-731e · 2026-10-04）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`（工作区在本需求开工前就带大量未提交改动 ⇒ 一律用「改动前后对比」，不指 commit）
- 运行器：vitest 2.0.0（`./node_modules/.bin/vitest`）；探针 `npx tsx`；类型检查 `./node_modules/.bin/tsc`
- 真实数据根（仅取证，不写入）：`~/.dsh/reqboard`
- ⚠️ **宿主加载的是启动时的构建**：本窗口 `reqboard_status` 报 `plugin_build = 8d03c8f413b9`，
  本次源码改动在其之后 ⇒ 实时 GUI 证据止步于「旧行为仍在」，新行为证据走**进程内测试与探针**（见「未跑项」）
- ⚠️ 本仓同一工作区有**另一个窗口在并行改动** `src/client/styles/board.ts`（与本需求无关）

## 跑了什么

```bash
npx tsx scripts/handoff-probe.mts                 # 交接探针（临时台账，真跑两条路径）
./node_modules/.bin/vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts \
    tests/open-window-project-root.test.ts tests/open-window-tool.test.ts tests/bind-seat.test.ts \
    tests/capture-window-bound-policy.test.ts tests/binding-trace.test.ts tests/apply-wiring.test.ts
./node_modules/.bin/vitest run tests/kb-operations.test.ts
./node_modules/.bin/tsc --noEmit
pnpm build
```

## 结果（实跑输出摘要）

| 命令 | 结果 |
|---|---|
| `npx tsx scripts/handoff-probe.mts` | **exit 0**，末行「✅ 交接探针通过」 |
| 上述 8 个测试文件 | **8 files / 90 tests 全绿**，exit 0 |
| `tests/kb-operations.test.ts` | 11 passed |
| `tsc --noEmit` | **146 条错误**，与开工前基线逐条一致（全部在 `tests/unit/*`、`tests/worktree-injection.test.ts` 等既有文件；本需求文件零新增） |
| `pnpm build` | **exit 0**；`[verify-client] OK bundle=344123 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |

## 探针读数（五读数，逐字）

```
DIAG P1 交接写  from=w-old to=w-new old_role=observer new_role=owner source_session=w-new
DIAG P1 台账    changed=true store_changed=true owner_count=1 seat_count=3 comments=1 version=3
DIAG P1 幂等    second=false store_changed=false comments=1→1 version=3→3
DIAG P2 看板改绑 from=w-old-2 to=w-new-2 old_role=observer new_role=owner source_session=w-new-2
✅ 交接探针通过
```

**零真实台账写入的自证**：跑前/跑后对 `~/.dsh/reqboard` 370 个文件做 mtime+size 快照，哈希一致
（`506e312c5e8a0c3fe847`）；临时目录无残留。

## 新增测试的覆盖（逐条对 FR）

| 文件 | 断言数 | 覆盖 |
|---|---|---|
| `tests/handoff-policy.test.ts` | 23 | FR-3：六点边界（0.74/0.75/0.84/0.85/0.89/0.90）、四种读数缺席（整条不可得 / 来源非投影 / 缺窗口大小 / 缺占用量）一律 `unknown`、占用量与预计占用为 0 是合法读数、配置非法装配期抛错 |
| `tests/handoff-owner.test.ts` | 23 | FR-2：原子交接、存量记录物化、幂等、不得产出空 owner、INV-2（席位与绑定同指一窗）、半截交接四处不变；FR-5：非 owner 拒（台账零改动）、目标非法拒、回执四键；FR-4：投递 kind 恒为 `reqboard-handoff`（断言 ≠ `user`）、投递失败如实回报；反向演练「假成功防线」 |
| `tests/open-window-project-root.test.ts` | 6 | FR-1：项目命中优先、目录兜底、都拿不到则不建会话且响亮失败；适配器请求组装与源项目解析 |

## 反向演练（防线有效性，逐条给证据）

| 演练 | 位置 | 判据 |
|---|---|---|
| 落错项目防线 | `tests/open-window-project-root.test.ts` ③ | 拿不到落点 → `REQBOARD_OPEN_WINDOW_UNAVAILABLE` 且替身 `create` 零调用 |
| 假成功防线 | `tests/handoff-owner.test.ts`（本次新补） | 显式 seats 的记录经看板改绑 → 席位真的换到新窗口（改造前该断言必红：旧实现只改绑定） |
| 读数缺失防线 | 判据侧 + 用例侧各一条 | `decideHandoff → unknown`；用例侧 → `REQBOARD_HANDOFF_NO_CONTEXT` 且台账零改动 |
| 半截交接防线 | `tests/handoff-owner.test.ts` ⑤ | 在写入前注入异常 → 席位 / 绑定 / 评论 / updatedAt 四处全不变 |

## 覆盖任务（covers · RTM 覆盖度门禁据此计算）

- t1 契约与配置：`covers: t-d43523, t-8e051a, t-8433b2, t-2cf050, t-542e92`
- t2 交接写原子化：`covers: t-3e8cec, t-086978, t-f75399, t-9fe6fb, t-dcee5f`
- t3 分叉判据：`covers: t-ee8599, t-321227, t-d73053, t-b0f77c, t-b3318b`
- t4 开窗落回源项目：`covers: t-f2c747, t-d8cc11, t-0fea36, t-c553e8, t-91cdd0`
- t5 交接用例与工具：`covers: t-4bd792, t-1ece44, t-205997, t-14bacb, t-18cc78`
- t6 装配与改绑修正：`covers: t-46d0d7, t-6582c0, t-aa31a7, t-1ac0ee, t-a9e38c`
- t7 总验收：`covers: t-9f1e88, t-cccef0, t-f889c1, t-a5291b`

## 未跑项（如实报出）

1. **实机四步复核未执行**：运行中的宿主仍是旧构建（`plugin_build 8d03c8f413b9`），需重启后由人执行——
   ① 原项目开新会话应出现在该项目分组（非「未分组」）；② 新窗口 `my_seat.role = owner`；
   ③ 新窗口写产物不报 `PROJECT_ROOT_MISMATCH`；④ 原窗口降 `observer` 且写操作被明确拒。
2. **未用 worktree**：本仓 worktree 为「不强制」项；本需求在主线工作区完成，与另一窗口并行（风险已登记于评审报告）。

## 外部噪声（非本需求引入）

- 既有基线红：`tests/layer-boundary.test.ts` 3、`tests/size-budget.test.ts`（`index.ts` 845 行、`application/ports.ts` 1181 行等既有超标）、`tests/output-contract.test.ts` 3、`tests/handoff.test.ts` 2、`tests/routes-rollup.test.ts` 2。逐条核对 offender/失败栈：**无本需求新增文件**。
- `npx tsx scripts/kb-probe.mts` 的 K5/K6/K7/K9 四项失败来自另一窗口在改的 `src/client/styles/board.ts` 与其知识条目 `kb-0031`；本需求新增脚本已登记进知识层（`src/domain/knowledge/operations.ts` 的 `EXCLUDED`），**K10「清单零漂移」已通过**。
