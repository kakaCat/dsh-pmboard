# AskConfirm.ts 事故与恢复素材（2026-10-04）

## 发生了什么

t5 的**反向演练还原**步骤里，我用了 `git checkout -- src/application/use-cases/AskConfirm.ts`
作为「还原」手段。该命令**执行成功**，把文件回退到 HEAD（2026-09-30）版本 ——
抹掉了 **其它窗口在 09-30 之后对该文件的全部改动**（B12 读端口迁移、awaiting-confirm 停手位集成、
挂起确认 ticket 登记等），以及我的 t5 改动。

- 影响面：仅 `src/`（源码与测试）；**运行中的插件用的是 `dist/`（10-03 23:06 构建），未受影响**。
- 该命令只作用于这一个文件路径。

## 已收集的恢复素材

1. `AskConfirm.dist-region.js` —— 从 `dist/index.mjs` 抽出的**该模块编译产物**（265 行，
   含 JSDoc 注释，`//#region src/application/use-cases/AskConfirm.ts` 到 `//#endregion`）。
   这是 10-03 23:06 构建时的**完整逻辑**，可作为恢复的主源。
2. 会话 `session-a8201e1d` 里 09-30 前后的**整份旧版读取**（336 行）—— 只比当前损坏版多 3 行差异，
   说明它反映的是**旧版**，不能作为新版来源（已排除）。
3. 本窗口（session-2680cf17）在损坏**之前**对该文件的两段读取（第 60–100 行、第 196–240 行），
   内容在本窗口对话记录里，可作为新版 TS 正文的**逐字取样**。

## 恢复计划（待办）

- 以 `AskConfirm.dist-region.js` 为逻辑源、以两段逐字取样为正文锚点，重建 `src/application/use-cases/AskConfirm.ts`；
- 重新施加 t5 的缺省宽限改动（`effectiveGrace` 三档语义）；
- 验收判据：`npx tsc --noEmit` 回到 144；`tests/ask-confirm-blocking.test.ts` 5 条全绿；
  `tests/ask-confirm-pending.test.ts` 回到既有 1 条失败（TC-7 存量）；`tests/ask-confirm.test.ts` 既有 1 条失败；
  `tests/ask-confirm-default-grace.test.ts` 7 条全绿。

---

## 深挖结论（2026-10-04，回答「构建之后有没有人改过这个文件」）

### 一、构建之后**没有任何写入**

全量扫描 82 个会话（含跨工作区），构建时间（`dist/index.mjs` = 10-03 23:06）之后与
`AskConfirm.ts` 有关的交互**只有 3 次只读 + 1 次只读结果**：

| 时间（10-03） | 会话 | 交互 | 性质 |
|---|---|---|---|
| 23:07:09 | session-278681bb | `bash grep -n "advance\|moveRequirement\|confirm" … AskConfirm.ts` | 读 |
| 23:11:44 | session-278681bb | `bash grep -n "applyConfirmDecision\|recordDeclinedConfirmation" …` | 读（留下行号指纹） |
| 23:11:48 | session-278681bb | `bash sed -n 336,372p … AskConfirm.ts` | 读（留下原文片段） |
| 23:24:10 | session-e41cdc1d | 一次 grep 结果（命中在别的文件） | 只读结果 |

⇒ **dist（23:06）就是最新可用源，未遗漏任何后续写入。**

### 二、重建的保真度：**代码逐字一致，只少格式**

用上面两次只读留下的**行号指纹 + 原文片段**对账：

| 指纹 | 原件（10-03 23:11） | 重建 | 判定 |
|---|---|---|---|
| `import { applyConfirmDecision, recordDeclinedConfirmation }` | 行 32 | 行 33 | ✅ 在（头部多 1 行注释） |
| JSDoc / 块注释行数 | 34 | 34 | ✅ **完全一致** |
| `answers: readonly AskAnswer[],` | 行 336 | 行 285 | ✅ 在（偏移 −51） |
| `await recordDeclinedConfirmation(deps, {` | 行 347 | 行 294 | ✅ 在（偏移 −53） |
| `const outcome = await applyConfirmDecision(deps, exec, {` | 行 369 | 行 314 | ✅ 在（偏移 −55） |
| 原件 336–372 正文片段 | — | 逐字一致（`picked`/`affirmative`/`nowTs`/`recordDeclinedConfirmation({…})`） | ✅ |
| 总行数 | ≥372（读到 372，估计 ~389） | 336 | 差 ≈53 行 |

**差额全部是格式**：被打包器丢弃的**行内 `//` 注释**（老版有 24 条，重建只有 10 条）、
多行函数签名被压成单行、空行；**没有丢失任何逻辑**（4 个指纹的标识符全在，JSDoc 数完全相同）。

### 三、残留（诚实边界）

- 那 ~14 条行内注释**不可恢复**：10-02 19:45 的整份读取（383 行）在会话记录里**被截断到 113 行**，
  拿不到正文；其余可用读取都早于构建。
- 已按原件证据把 `settleAnswers` 的签名改回**多行**（原件 `sed` 片段可证）。
- 其余格式（行内注释、其余多行签名）作为**风格债**留给 t10 统一整形；行为已由用例锁定。

### 四、恢复后的复核（可复跑）

```
npx tsc --noEmit | grep -c 'error TS'   → 144（与开工基线一致）
npx vitest run tests/ask-confirm-blocking.test.ts … → blocking 5/5 绿、default-grace 7/7 绿
npx vitest run  （全量）→ 48 failed files / 98 failed tests / 3615 passed
  · 与事故前最后一次全量（t4 基线）的**失败名称集完全一致**（零差异）
```
