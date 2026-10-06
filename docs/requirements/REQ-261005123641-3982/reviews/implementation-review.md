# 实施评审记录 · REQ-261005123641-3982

> 评审对象：写盘根守卫重写（`src/application/internal/support.ts`）+ 立项两条路径守卫前置
> （`CaptureRequirement.ts` / `CreateRequirement.ts`）+ 回归用例（`tests/project-root-concurrency.test.ts`、
> `tests/project-scope.test.ts` 一条用例重写）
> 评审时间：2026-10-05 · 评审人：本窗口 agent（复核子卡 t-e11a6a / t-279e67 / t-82bbf9 结论汇总；
> 契约变更①为**用户在对话中的裁决**，非 agent 自裁）

## 评审要点与结论

| # | 评审点 | 结论 |
|---|---|---|
| 1 | 判定输入是否只剩「记录声明根」 | 通过：`ensureWritableProjectRoot` 的判定只读 `record.workspaceRoot`；共享单例的当前值仅被校正、被复核，不参与判定（`support.ts:343` 起） |
| 2 | 判定顺序是否与设计表逐条一致 | 通过（含变更记①）：无探针 → 不判；非绝对 → 不判；绝对但不可用 → `INVALID_WORKSPACE`；校正 → 复核；校正后仍不一致 → `MISMATCH`；无声明 → 回落 `callerRoot` |
| 3 | 校正是否复用唯一实现 | 通过：调用既有私有 `applyWorkspaceRoot`（与读侧 `applyRequirementWorkspaceRoot` 同一处逻辑），没有第二份「按路径 set」 |
| 4 | 守卫是否真的早于副作用 | 通过：`CaptureRequirement.ts` 守卫 :280 < 建档 :283 < 推进 :297（:308 保留护栏）；`CreateRequirement.ts` 守卫 :54 < 建档 :55 |
| 5 | 层边界与门禁兼容 | 通过：新增 `import` 0 条（`node:` 仅出现在既有注释）；函数名未变 → t8 的 `GUARD_CALL` / `PROTECTED_WRITERS` / `EXEMPT` / `PENDING_GUARD` 三份清单零改动，「白名单不许腐烂」用例通过 |
| 6 | 用例是否真有判别力 | 通过：在隔离副本用 HEAD 旧守卫跑新用例 → 4/6 红；重写后的旧契约用例亦红（修复后全绿）——见 `tests/test-evidence.md` §判别力自证 |
| 7 | 契约变更是否留痕 | 通过：变更①（非绝对声明根由「拒绝」改为「不判」）写进 `design/interfaces.md` 判定顺序表 2a/2b 行 + 变更记（裁决人 / 日期 / 理由 / 影响面）；代码注释同源 |
| 8 | 影响面是否可控 | 通过：本需求只改 3 个 src 文件 + 2 个测试文件 + 3 份文档；同目录下 `Decompose.ts` / `MoveRequirement.ts` 的改动经核对属**他需求在建工作**（零命中本需求号与守卫符号） |

## 评审中发现并处理的问题

- **非绝对声明根的处理（变更记①）**：设计表原写「非绝对 → 抛 `INVALID_WORKSPACE`」，实施时打红了
  内存仓储（`FakeDocs.workspaceRoot()` 返回 `'.'`）的 `create` 立项用例。经用户裁决改为**不判**（宽容），
  与改动前逐字一致；相对根在生产路径不出现（`process.cwd()` / 会话 cwd 恒为绝对）。
- **`WriteRootCaller` 在构建产物里查不到**：`dist/index.mjs` 中该符号 ×0——它是 TS 接口，编译期被擦除，
  不是构建漏带改动；同批新文案与错误码在产物里都命中（见 `tests/test-evidence.md` §构建核对）。

## 遗留观察（不影响本次交付，需人知晓）

- **现场复演未做**：跨工作区两窗口的实时复演（A 弹框期间 B 调 `reqboard_status`）需另一个项目窗口配合；
  本次做到**单元级等价覆盖**（`TC-1` 显式模拟邻居窗口那一步：`docs.setWorkspaceRoot(自己的根)`）。
- **知识层产物未重生成**：`pnpm kb:check` 漂移 2 处（`code-map.md` / `code-map.symbols.tsv`）与开工前一致，
  其中 `symbols` 含本需求新增导出符号**与他需求在建改动**；未跑 `kb:build` 以免把并发窗口在建源码一并固化。
- **共享单例仍是全局可变**：本需求让判定不再依赖它，但「两写交错时后校正者获胜」仍是该架构的固有属性；
  架构级「每窗口一实例」未做（`docs/architecture/gate-read-root.md` 已知缺口表已如实更新）。
