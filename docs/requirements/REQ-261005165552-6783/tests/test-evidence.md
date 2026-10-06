# 测试证据（REQ-261005165552-6783 · 2026-10-05）

## 环境

| 项 | 值 |
|---|---|
| 机器 / 系统 | macOS 26.3（Apple Silicon） |
| 运行时 | node v25.6.1 · pnpm 10.22.0 |
| 工作区 | `/Users/mac/Documents/ai/dsh/dsh-pmboard` |
| 被测产物 | `dist/index.mjs`（host）· `lib/client.js`（client） |
| 采集时间 | 2026-10-05 17:04 ~ 17:12（+0800） |

## 跑了什么

| # | 命令 | 说明 |
|---|---|---|
| ① | `npx vitest run tests/capture-literal-section.test.ts` | 新增反例回归（三组外来原文 × 两态判据） |
| ② | `npx vitest run tests/apply-wiring.test.ts -t 显式声明` | 接线回归新增两条断言（单跑按名命中） |
| ③ | `npx vitest run tests/apply-wiring.test.ts tests/capture.test.ts tests/stage-prompts.test.ts` | 定向回归（文本逐字节不变式） |
| ④ | `pnpm typecheck` | 类型检查（C-15） |
| ⑤ | `pnpm build` | 重建 host + client 产物（C-11 / C-12） |
| ⑥ | `pnpm test` ×2 | 全量套件：**改动后**一次、**基线**（两处改动暂存）一次（C-14） |

## 结果摘要

| # | 退出码 | 结果 |
|---|---|---|
| ① | 0 | `Tests 6 passed (6)` |
| ② | 0 | `Tests 2 passed \| 5 skipped (7)` |
| ③ | 1（存量红） | `Tests 2 failed \| 62 passed (64)`；两条失败改动前后**同红**（`capture.test.ts` 旧文案、`apply-wiring` 工具清单） |
| ④ | 0 | `tsc --noEmit` 无错误输出 |
| ⑤ | 0 | host `dist/index.mjs` 重建；client `[verify-client] OK bundle=591550 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| ⑥ | 1 / 1 | 见下表 |

**全量套件（⑥）基线对照**

| 维度 | 基线（改动暂存） | 改动后 | 差 |
|---|---|---|---|
| 失败文件 | 37 | 37 | **0** |
| 失败用例 | 68 | 68 | **0** |
| 通过用例 | 5477 | 5485 | **+8** |
| 用例总数 | 5567 | 5575 | +8 |

原始日志：`notes/full-suite-baseline.txt` · `notes/full-suite-after.txt`；改动补丁：`notes/change.patch`；
完整证据档：`notes/build-evidence.md`。

**产物指纹**

| 时点 | sha256 前 12 位 | mtime |
|---|---|---|
| 改动前 | `fdc6885141ef` | 2026-10-05 15:54 |
| 改动后 | `d0c9a803ba54` | 2026-10-05 17:09:07（晚于源码 17:08:40） |

## 覆盖与对照

| 用例 | 对应设计 | 覆盖条款 | 落点 | 状态 |
|---|---|---|---|---|
| TC-1 段显式声明字面量 | `test-cases.md` | FR-1 | `tests/apply-wiring.test.ts` | ✅ |
| TC-2 每段显式声明插值开关 | `test-cases.md` | FR-4 | 同上 | ✅ |
| TC-3 反例①任务字段含占位符 | `test-cases.md` | FR-2 | `tests/capture-literal-section.test.ts` | ✅ |
| TC-4 反例①证伪半必抛 | `test-cases.md` | FR-2 | 同上 | ✅ |
| TC-5 反例②用户消息节选 | `test-cases.md` | FR-2 | 同上 | ✅ |
| TC-6 反例③需求标题 | `test-cases.md` | FR-2 | 同上 | ✅ |
| TC-7 文本逐字节不变式 | `test-cases.md` | FR-1 | 定向回归（③） | ✅ |
| TC-8 类型检查与构建 | `test-cases.md` | FR-1、FR-3 | ④⑤ | ✅ |
| 运行时三项证据 | `test-cases.md` §运行时验证 | FR-3 | 重载后复核 | ⏳ 待人工 |

## 失败与未跑项

1. **存量红 68 条（非本需求引入）**：同一工作区、同一套件、改动暂存后跑出的数字与改动后**完全相等**
   （37 文件 / 68 用例）。其中 2 条落在本需求触碰的文件里：
   `tests/apply-wiring.test.ts` 工具清单数量漂移（实测 26 ≠ 期望 25）、
   `tests/capture.test.ts` 旧文案断言（期望「不许沉默」，现行文案为「比沉默跳过安全」）。
   → 按边界第 4 条**不修**，如实披露。
2. **未跑的项（做不到，不是漏跑）**：`pnpm test` 全量退出码 0 —— 在存量 68 红下不可达，
   改以基线对照给结论。
3. **未完成项（需宿主动作）**：运行时解冻三证据（被卡窗口跑一轮 / 诊断日志 `NODE-4`·`NODE-5` /
   台账 `interruption` 无新增）——需重载插件使 `d0c9a803ba54` 生效；
   当前运行中构建仍为 `9f1c0ead7613`（`reqboard_status` 可查），复核步骤见 `notes/build-evidence.md` §5。

## 任务覆盖标注（供 RTM 覆盖度读取）

每条交付路径对应哪些任务卡（格式按本仓约定 `covers: t-xxx` / `validates: FR-x`）：

- 段声明落地（研发 + 复核）`covers: t-448429, t-74b5ea, t-cc9eaf` `validates: FR-1`
- 接线回归断言（研发 + 复核）`covers: t-609dce, t-09e2b8, t-3b5ab6` `validates: FR-1, FR-4`
- 三组外来原文反例回归（研发 + 复核 + 测试）`covers: t-f0bf3a, t-2be60f, t-08ca99, t-11b607` `validates: FR-2`
- 产物重建与命令级证据（研发 + 复核）`covers: t-bcaf4d, t-cec857, t-bbb86f` `validates: FR-3`

覆盖口径说明：13 张卡（4 张父卡 + 9 张子卡）全部对应到上面四条路径；每条路径的实跑证据见本文件
§跑了什么 / §结果摘要，逐卡验收标准见 `tasks/<taskId>.md` 的完工记录。

## 故障注入

**注入内容**：临时删掉 `src/gate-wiring.ts` 的 `interpolate: false` 一行（模拟"有人把声明删了"）。

**观察**：`npx vitest run tests/apply-wiring.test.ts -t "capture section 显式声明为字面量段"` →
`AssertionError: expected undefined to be false`，用例转红；恢复该行后重新单跑 → 2 passed。

**结论**：新增断言具备**可失败性**（不是恒真装饰）——这正是本仓「判据要能证伪」的实证。
