# 测试证据 · REQ-261005123641-3982

> 逐条对 `requirement.md` 的「验收口径（可跑）」与各卡 acceptance 给命令 + 输出摘要。
> 复跑环境：`/Users/mac/Documents/ai/dsh/dsh-pmboard`（2026-10-05，共享工作树，另有他需求在建改动）。
> 每个 `## TC-n` 块标 `covers:`（被覆盖的任务卡）与 `validates:`（被验证的需求条款），供 RTM 追溯。

## TC-1: 邻居窗口改走共享根后，本窗口的写入不再被误拒
- covers: t-ca2fee, t-dc8874, t-bbcecc, t-1827cb
- validates: FR-1, FR-2, FR-5
- 命令：`npx vitest run tests/project-root-concurrency.test.ts -t "TC-1"`
- 结果：**通过**。A 先写 → 邻居窗口把共享单例根改成 B 项目根 → A 再写：两次都成功、`docs.workspaceRoot()`
  被校正回 A、A 的产物落在 A 目录、**B 目录零新增**。旧实现在这一步抛 `REQBOARD_PROJECT_ROOT_MISMATCH`。

## TC-2: 记录声明的根是权威
- covers: t-ca2fee, t-dc8874
- validates: FR-1, FR-2
- 命令：`npx vitest run tests/project-root-concurrency.test.ts -t "TC-2"`
- 结果：**通过**。当前根 = A、记录声明 = B → 返回 B、写盘落 B、**A 目录零新增**。

## TC-3: 声明根不可用 → 响亮拒绝，不写到任何地方
- covers: t-ca2fee, t-dc8874
- validates: FR-2
- 命令：`npx vitest run tests/project-root-concurrency.test.ts -t "TC-3"`
- 结果：**通过**。声明根为「绝对但不存在」→ `REQBOARD_INVALID_WORKSPACE`（文案含该路径），
  调用方目录零新增、共享根未被改动（写侧**不降级**到会话 cwd）。

## TC-4: 非绝对声明根 → 不判（变更记①）
- covers: t-ca2fee, t-dc8874
- validates: FR-2
- 命令：`npx vitest run tests/project-root-concurrency.test.ts -t "TC-4"`
- 结果：**通过**。声明根为 `.` → 返回探针当前值、不报错（与改动前逐字一致）；
  这是实施期变更记①（用户裁决「宽容：非绝对 → 不判」）的回归锚点。

## TC-5: 存量记录（未声明根）→ 回落调用方根并校正
- covers: t-ca2fee, t-dc8874
- validates: FR-2
- 命令：`npx vitest run tests/project-root-concurrency.test.ts -t "TC-5"`
- 结果：**通过**。记录无 `workspaceRoot` → 回落 `callerRoot` 并校正到它；无 `callerRoot` → `undefined`（不判）。

## TC-6: 校正失效的最后防线仍抛 MISMATCH
- covers: t-ca2fee, t-e11a6a
- validates: FR-2, FR-4
- 命令：`npx vitest run tests/project-root-concurrency.test.ts -t "TC-6"`
- 结果：**通过**。仓储读得回根但没有 `setWorkspaceRoot`（校正不生效）→ 抛
  `REQBOARD_PROJECT_ROOT_MISMATCH`，文案含两个绝对路径。

## TC-7: 守卫先于副作用（半截失败消除）
- covers: t-b40ed3, t-c9ef57, t-279e67
- validates: FR-3
- 命令：`grep -n "ensureWritableProjectRoot(deps\|createRequirementDirect(deps\|advanceDraftToBrainstorming(deps" src/application/use-cases/CaptureRequirement.ts`
  / `grep -n "ensureWritableProjectRoot\|const req = await createRequirementDirect" src/application/use-cases/CreateRequirement.ts`
- 结果：**通过**。capture 守卫 :280 < 建档 :283 < 推进 :297（:308 保留护栏）；
  create 守卫 :54 < 建档 :55 → 拒绝发生在任何台账写入之前，「记录已建却报立项失败」不可能再发生。
  旧顺序（守卫在 ④⑤ 之后）的现场证据见文末「现场证据」。

## TC-8: 判别力自证——新用例在旧实现下会红
- covers: t-bbcecc, t-82bbf9, t-1827cb
- validates: FR-1, FR-3, FR-5
- 命令（隔离副本 + `HEAD` 旧守卫）：`npx vitest run tests/project-root-concurrency.test.ts`
- 结果：**4 failed | 2 passed**。红的正是本次修的行为（TC-1 / TC-2 / TC-3 / TC-5）；
  绿的 2 条（TC-4 相对根不判、TC-6 校正失效）是刻意保留的旧行为。
  重写后的旧契约用例在旧实现下也红：`npx vitest run tests/project-scope.test.ts -t "声明根是权威"` → 1 failed。

## TC-9: 全量失败数 ≤ 基线；类型检查 ≤ 基线
- covers: t-801f25, t-1827cb
- validates: FR-1, FR-2, FR-3, FR-4, FR-5
- 命令：`pnpm test` / `npx tsc --noEmit`
- 结果：**68 failed / 5061 passed / 20 skipped**（37 红文件）；基线（去掉本需求改动的隔离副本）
  **69 failed / 5054 passed**（38 红文件）→ 68 ≤ 69。失败文件集 diff：**只有现在红的集合为空**。
  `tsc --noEmit` → **1 error = 基线 1**（`tests/receive-mark.test.ts` 的 readonly `sort`，HEAD 即存在）。

## TC-10: 口径落文档、旧结论作废、变更记留痕
- covers: t-a26171, t-2e659a, t-b55e86
- validates: FR-1, FR-2
- 命令：`grep -n "唯一权威\|只作缓存\|按 REQ id 取记录" docs/architecture/gate-read-root.md`
  / `grep -n "gate-read-root" docs/architecture/project-manual.md`
- 结果：**通过**。`gate-read-root.md` 新增「写入侧的根解析（现行）」节；旧节标注「已于 2026-10-05 被推翻」；
  `project-manual.md:15` 挂接该页。设计侧变更记①见 `design/interfaces.md` 判定顺序表 2a/2b 行 + 变更记。

## 附录 A：基线怎么量的

| 量 | 带本需求改动 | 基线（去掉本需求改动） |
|---|---|---|
| `pnpm test` | 68 failed / 5061 passed / 20 skipped | 69 failed / 5054 passed / 20 skipped |
| 失败文件集 diff | **只有现在红 = 空** | 只有基线红 = 复核阶段复制进副本的新用例文件（旧实现下本就该红） |
| `tsc --noEmit` | 1 | 1 |

量法：把工作树 rsync 到 `/tmp/pmbase2`（排除 `node_modules/.git/.worktrees`，软链 `node_modules`），
把本需求改过的 6 个文件还原成 `HEAD` 版本、删掉新增用例与需求目录，再跑同一命令——
**工作树里他需求的在建改动保持不变**，故两边差异只来自本需求。

已知噪声（如实标注）：两次全量的红文件计数（39/40）与尾部摘要（37/38）在窗口期不一致，
因本仓同时有他需求在跑；权威对照是**配对失败数（68 vs 69）**与**空的「只有现在红」集合**。

## 附录 B：构建核对（C-11）

```
pnpm build → 退出码 0
  [verify-client] OK  bundle=586829 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
dist/index.mjs 命中：
  REQBOARD_PROJECT_ROOT_MISMATCH × 2
  REQBOARD_INVALID_WORKSPACE × 7
  新文案「记录声明的项目根不可用」× 1
  WriteRootCaller × 0 —— TS 接口，编译期擦除，非构建漏带
```

## 附录 C：未做项（如实报，需人知晓）

| 未做 | 原因 | 替代覆盖 |
|---|---|---|
| 跨工作区两窗口的**现场复演**（A 弹框期间 B 调 `reqboard_status`） | 需另一项目窗口配合 | TC-1 显式模拟邻居窗口那一步（`docs.setWorkspaceRoot(自己的根)`，即 `applyWorkspaceRoot` 的落地动作） |
| **知识层重生成**（`pnpm kb:build`） | `pnpm kb:check` 漂移 2 处与开工前一致，其中 `code-map.symbols.tsv` 混有他需求在建改动；此时重生成会把并发窗口半成品固化 | 漂移清单与开工前逐条一致（未新增），建议树稳定后统一重生成 |
| `pnpm kb:probe` 全绿 | 4 项失败全部为 `scripts/` 未归类，来源是他需求新增脚本 | 本需求零新增脚本；`gate-read-root.md` 未被 probe 点名 |

## 附录 D：现场证据（本次立项的原始事故）

- `~/.dsh/reqboard/requirements/REQ-261005122915-9f90/history.jsonl`：`draft` @1791174555304、
  `brainstorming` @1791174555326 **已落库**，而该次 `reqboard_capture` 的回执是 Error。
- 窗口 `session-2b5a64a9` 的 tool 回执 @1791174555337：`记录声明的根=/Users/mac/Documents/ai/dsh/dsh-pmboard；
  实际会写的根=/Users/mac/Documents/ai/dsh/dsh-notice-webhook`（同刻窗口 `session-df00704c` 于 @1791174545158 调 `reqboard_status`）。
- 第二现场：窗口 `session-4d4d23e8` 的批准回执 @1791174695611 ——「已落章 + 自动拆分/开跑失败（同错配）」→ 计划已批准、任务卡未落库。
