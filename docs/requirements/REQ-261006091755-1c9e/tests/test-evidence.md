# 测试证据（REQ-261006091755-1c9e）

> 全部命令于 2026-10-06 在本工作区实跑，输出为原文摘要。基线 = 本需求改动前同一命令的输出。

## 一、本需求用例

```
$ npx vitest run tests/plan-prototype-anchor-gate.test.ts \
    tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts
 Test Files  4 passed (4)
      Tests  111 passed (111)
```

| 文件 | 项数 | 本需求新增 |
|---|---|---|
| `tests/plan-prototype-anchor-gate.test.ts` | 29 | TC-1～TC-10（+10） |
| `tests/move-gate-paths.test.ts` | 26 | 0（回归） |
| `tests/prototype-gates.test.ts` | 28 | 0（回归） |
| `tests/category-doc-sets.test.ts` | 28 | 0（回归） |

**TC ↔ 断言要点**：

| 用例 | 断言要点 |
|---|---|
| TC-1 | 豁免生效 + 无已登记原型 → 整维跳过（刻意只给 requirement.md，证明早退发生在读 INDEX / 计划文档之前） |
| TC-2 | 目录里有 `autoDiscovered` 的骨架（未登记）→ 仍跳过（判据是"已登记"） |
| TC-3 | 豁免理由为空 → 仍拒 |
| TC-4 | 理由非空但 requirement 产物未落章 → 仍拒（不许 agent 自己豁免自己） |
| TC-5 | 无 `prototype_exempt` 键 → 仍拒，且 gaps 文案与改动前逐字一致 |
| TC-6 | 豁免生效 + 已登记原型 + 卡无锚点 → 仍拒并点名该卡 |
| TC-7 | 同场景补权威锚点 → 放行 |
| TC-8 | 非 UI 需求（sides 只含 backend）→ 放行 |
| TC-9 | 存量需求（artifacts 为空）→ 放行（不追溯） |
| TC-10 | 源码锚点：锚点维函数体内只调 `prototypeExemptOf` / `registeredPrototypesOf`，无手写 `prototype_exempt` 判据 |

## 二、可证伪性（三条逆向验证，跑完当场复原）

| 逆向改动 | 期望 | 实测 |
|---|---|---|
| 删掉新增前置（那 1 行 `if`） | TC-1 / TC-2 必红 | 2 failed / 26 passed |
| 条件放宽成「豁免即跳过」（去掉 `registeredPrototypesOf(...)` 判断） | TC-6 必红 | 1 failed / 27 passed |
| 在函数体塞一行 `doc.frontmatter['prototype_exempt']`（手写判据） | TC-10 必红 | 1 failed / 28 passed |

三条复原后均为 **29 passed**。

## 三、回滚演练（可逆性）

```
只退源码 delta（保留新用例）：
  引用计数 0 → npx tsc --noEmit 退出码 0
  目标用例 3 failed / 26 passed（红的正是 TC-1 / TC-2 / TC-10 —— 新断言在回滚态正确报错）
整链回滚（源码 delta + 用例退回改动前 336 行）：
  目标用例 19 passed = 改动前计数，全绿
恢复：
  源码与备份逐字节一致（diff -q 通过）；432 行用例、29 passed、tsc 0、build [verify-client] OK
```

## 四、规范条目（C-15 / C-11 / C-14）

```
$ npx tsc --noEmit -p tsconfig.json   → 退出码 0（零输出）
$ pnpm build                          → [verify-client] OK  bundle=650512 bytes
$ pnpm test                           → Test Files 38 failed | 463 passed | 3 skipped (504)
                                        Tests 69 failed | 5850 passed | 22 skipped (5941)
```

**基线对照（同工作区，改动前后各采样）**：

| 采样 | 失败用例 | 通过用例 |
|---|---|---|
| 基线①（本需求 delta 已回退） | 68 | 5841 |
| 基线②（同上，几分钟后） | 69 | 5840 |
| 交付态（delta 在位） | 69 | 5850 |

- 通过数增量 **+9～+10** = 本次新增用例数；
- 失败数落在 **68–69 的同一噪声带**；
- **逐文件归因**：三轮全量各自多出**一个不同**的文件且每轮都不同 ——
  `tests/canceled-legacy-read.test.ts`（别的窗口未跟踪的 WIP 测试）、
  `tests/header-progress-e2e.test.ts`（既知 Chrome 启动抖动）、
  `tests/reqboard/settings-init.test.ts`（三轮中仅一轮）；
  三者**单跑均通过**，且与本需求改动的模块无交集。
- 结论（如实）：在多窗口并行编辑的工作区里，全量的**细粒度前后逐文件比对不可作为判据**；
  本需求改用「目标与相关用例全绿 + tsc 0 + 构建 OK + 新增用例数对得上」作为可复核判据。

## 五、未覆盖 / 未自动化

- 无端到端接口可跑（本次改动是**门禁函数的前置条件**，没有 HTTP / UI 面）；
  等价验证是直调 `assertClauseCoverageGate` 的四组合断言（本仓既有测法）。
- 工作区级 tsc 曾在交付前被别的窗口的 `SubmitArtifact.ts`（326 行未提交改动）打破（2 处 TS2339），
  具名记录在 t3 实施汇报里；该窗口修复后复查为 **退出码 0**。
