# 开工前基线（REQ-261004222448-292a）

> 2026-10-04 实测记录。本需求**开工前**工作树的状态，供验收与复盘引用：
> 交付时若有任何"红"，先与本文对照，区分「本需求引入」与「开工前既有」。

## 一、落定的两个检查点

| 提交 | 内容 |
|---|---|
| `f5c3b72` | **实施前快照**：714 个未提交项（378 已跟踪 + 336 未跟踪），**原样落定、不改任何内容** |
| `660973e` | **类型基线清零**：typecheck 149 → 0（81 个文件，+692/−375），只做类型对齐、不实现半成品功能 |

工作树原始规模：716 个改动文件，其中 `tests/` 290 个；近 60 分钟内无其它窗口在改（确认过）。

## 二、类型层：已清零（149 → 0）

| 侧 | 修前 | 修后 | 性质 |
|---|---|---|---|
| `src/**` | 29 | **0** | 未用参数 · `number\|undefined` · 缺 `await` · 联合缺成员 · 字段未声明（**只加可选字段、不接线**） |
| `tests/**` | 120 | **0** | 夹具落后于 src 类型 · 端口改名 · 参数个数 · 重复标识 · 两份缺依赖 |

**两份垫片**（照 `tests/stubs/react.ts` 既有先例，未改 `package.json`/lockfile）：
- `tests/stubs/react-dom-server.ts`（`vitest` alias + `tsconfig` paths）——局限：**不是真 react-dom**，只保证结构可断言；
- `tests/stubs/dsh-session.d.ts`（仅类型 + paths）——`@deepseek-ai/dsh-session` 未随本仓安装，**该包相关用例在本 checkout 无法运行**（环境缺口）。

## 三、行为层：**仍有 75 条失败**（40 个文件）——开工前既有，本需求未修

```
Test Files  40 failed | 384 passed | 3 skipped (427)
Tests       75 failed | 4546 passed | 20 skipped (4641)
```

| 实例 | 真相 |
|---|---|
| `tests/adapters/failure-alert.test.ts` | 断言"投递了一次"——Dive 化**已删除投递能力** |
| `tests/application/repository.test.ts:81` | 断言 id 形如 `REQ-[0-9a-f]{6}`，实际为 `REQ-261005091038-722e`（**id 格式已改**） |
| `tests/gate-handlers.test.ts`（旧 H4 describe）等 | 同类：断言已被删除的投递/唤醒行为 |

**处置约定（2026-10-04 人裁定）**：本需求 18 张卡的自测**只跑各自的测试文件**（新增用例必须全绿）；
全量 `pnpm test` 的这 75 条**另行处置**，不计入本需求的验收口径，但**必须在验收材料里如实说明**。

## 四、本需求引入的两笔"声明的偏离"（不许悄悄带过）

| 项 | 内容 |
|---|---|
| **行为变化 1 处** | `src/application/internal/content-trace.ts` 补 `await`：原代码把 `Promise<string>` 交给同步 `text.split` ⇒ 必然抛错 ⇒ 被 `QueryState.ts:122` 的 try/catch 吞掉 ⇒ `traceability_chain` **恒缺省**。修好后该字段在"有设计文档"时会**开始出现**（真实覆盖度）。替代方案只有 `as unknown as` 撒谎，故选择修 bug 并记账 |
| **声明的放宽 5 处** | `tests/dive-wake-wiring.test.ts:228/232/240/252`、`tests/archive-reconcile-e2e.test.ts:47` 的 `as never`（假 agent 句柄/exec 上下文装配，沿用该文件既有用法）。另有 3 处"收窄型"断言：`gate-aware-questions.test.ts:178,211`、`ask-confirm-pending.test.ts:175`、`read-sites-equivalence.test.ts:230` |

## 五、顺带发现的功能悬空（待另立卡，不属本需求）

`deliverWorktreeNotice()` 恒 `false`；`renderWorktreePrompt` / `WORKTREE_EVENT_TEMPLATES` 全仓**零调用点**；
`MoveTask` 不再调用它 ⇒ **worktree 提示当前无人投递**（doc 里写的"经 onStagePrompt 投递"那段代码不存在）。
