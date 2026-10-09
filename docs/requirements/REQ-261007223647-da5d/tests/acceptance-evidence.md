# 测试证据（REQ-261007223647-da5d · 2026-10-08）

## 环境

> 采集时间：2026-10-08 00:30–00:36 · HEAD `c49fd5e` · 工作树：`142 files changed, 2398 insertions(+), 988 deletions(-)`（含未跟踪共 194 个改动，其中未跟踪 38）
> 没有工作树指纹的「跑通了」不可复现——本仓多窗口共用工作树，读数会随并发写入失效（REQ-261006123819-3af3 FR-6）。

## 跑了什么

```
# 全量差集（C-14）
npx tsx scripts/test-baseline.mts --check

# 类型（C-15）
npx tsc --noEmit

# 构建（C-11 / C-12）
npx tsdown -c tsdown.config.mjs
npx tsdown -c tsdown.client.config.mjs && node scripts/wrap-client.mjs && node scripts/verify-client-build.mjs

# 本需求相关用例（16 文件）
npx vitest run tests/capture-tool.test.ts tests/capture-output-contract.test.ts \
  tests/capture-interactions.test.ts tests/capture-rejection-persistence.test.ts \
  tests/compat-matrix.test.ts tests/ask-timed.test.ts tests/confirm-repost.test.ts \
  tests/pending-board.test.ts tests/pending-ticket-row.test.ts tests/pending-confirm-band.test.ts \
  tests/pending-band-wiring.test.ts tests/pending-band-e2e.test.ts \
  tests/open-doc-root-source.test.ts tests/doc-root-badge.test.ts tests/doc-location-panel.test.ts \
  tests/gate-aware-questions.test.ts

# 产物真带新码（构建物 ↔ 源码一致性）
grep -c dsh-pm-pending-band lib/client.js ; grep -c dsh-pm-root-warn lib/client.js
grep -c pending_confirms dist/index.mjs ; grep -c pendingForRequirement dist/index.mjs
```

## 结果摘要

| 命令 | 结果 |
|---|---|
| `test-baseline --check` | 本次失败 **67** 条 / 基线 **68** 条；**新增 10 / 不再失败 11**；口径：tsc 退出码 0 · error TS 0 |
| `tsc --noEmit` | 退出码 **0** |
| host 构建 | `dist/index.mjs` **2520784** 字节（00:30 重建） |
| client 构建 | `[verify-client] OK  bundle=784848 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整`（原型对齐后重建） |
| 相关 16 文件 | **138 passed / 16 files**（全绿）；pending 票相关 5 文件 45 例（含原型对齐后的文案断言） |
| 产物新码 | `lib/client.js`：dsh-pm-pending-band ×3、dsh-pm-root-warn ×2；`dist/index.mjs`：pending_confirms ×8、pendingForRequirement ×8 |

## 覆盖与对照

| 验收标准 | 用例 | 对应测试 | 结果 |
|---|---|---|---|
| **AC-1** FR-1 弹框投递与作答解耦 | TC-1 / TC-2 | tests/ask-timed.test.ts(9) + tests/confirm-repost.test.ts(5) + tests/capture-rejection-persistence.test.ts(3) + tests/pending-board.test.ts 重投端到端 | ✅ |
| **AC-1** FR-2 取消后引导与连续取消 | TC-3 | tests/capture-interactions.test.ts（阈值 3 → 不再弹框 + 回执含看板） | ✅ |
| **AC-3** FR-3 立项弹框内容重构 | TC-4 | tests/capture-tool.test.ts(21，含本次补的无裸哨兵断言) + tests/gate-aware-questions.test.ts(10) | ✅ |
| **AC-3** FR-4 文案口径一致 | TC-5 | `grep -rn "三问\|四问" src/tools src/application` → 8 处命中逐条与事实源一致；`grep -c prototype src/tools/SubmitTool/prompt.ts` = 4；tests/capture.test.ts + output-contract 族(39) | ✅ |
| **AC-5** FR-5 pending 票看板醒目 | TC-6 | tests/pending-board.test.ts(16) + pending-ticket-row(14) + pending-confirm-band(6) + pending-band-wiring(7) + pending-band-e2e(2) | ✅（渲染断言）/ 👤（人眼可见性） |
| **AC-1/AC-6** FR-6 文档打开根解析 | TC-7 | tests/open-doc-root-source.test.ts(9) + tests/doc-root-badge.test.ts(8) + tests/doc-location-panel.test.ts(10) | ✅ |
| **AC-2** 构建与类型 | — | 见上表四条命令 | ✅ |
| **AC-4** 拒绝留痕读数 | TC-8 | tests/capture-rejection-persistence.test.ts：真文件适配器 + 直接读盘断言（点 ✖️ 即落盘；调用被 ASK_ABORTED 中断后留痕仍在、换实例仍读得回） | ✅ |
| **AC-5** 人打开看板 10 秒内可见 | — | 人工项（agent 跑不了）：见「失败与未跑项」 | 👤 |
| **AC-6** 交付后台账不再出现连续取消 | — | 交付后现场判据：见「失败与未跑项」 | ⏳ |

## 失败与未跑项

| 项 | 状态 | 处置 |
|---|---|---|
| 全量 `npx vitest run` 退出码 | **非 0**（67 条失败） | 67 条**全部为存量**：基线 68 条里就有的，加本次差集的 10 条（其中 11 条已被本工作树修好）。C-14 的判据是**失败用例集合差**，本需求引入的新失败 = 0（见下「归因实测」）。未擅自 `--refresh` 刷基线——那是「承认现状」的仓库级动作，留给验收人裁决 |
| tests/canceled-legacy-read.test.ts | 失败（flaky） | 已知 flaky：有本次改动时 8 次跑失败 1 次，把本次改动临时移出后 13 次跑失败 2 次——与本次改动无关。机理线索：其「畸形 JSON → 告警」断言在 vitest 权限沙箱下的写入/读取时序偶发不同步；不在本需求范围，未改 |
| AC-5 人眼可见性（打开看板 10 秒内看到横带） | 未跑（agent 跑不了） | 已在验收材料标 `needsHuman`：请在 http://127.0.0.1:19387 打开看板，有挂起票时看顶部横带（`data-pending-count` + 剩余 mm:ss + 去作答/重投弹框） |
| AC-6 连续取消台账判据 | 未跑（交付后才可判） | 机制已就位并有读数（cancel 留痕 + 30 分钟 3 次阈值 → 不再弹框并提议看板）。属交付后现场观察项，不在提交时伪造通过 |

### 新增失败归因实测（证明 10 条非本次引入）

把本次改动涉及的 **29 个文件**（源码 20 + 测试 9）临时移出后重跑 6 个基线红文件，失败集合**逐条一致**：

```
tests/artifact-openable.test.ts      1 failed
tests/client-view.test.ts            3 failed
tests/kb-generate.test.ts            1 failed
tests/kb-invalidation.test.ts        1 failed
tests/kb-operations.test.ts          1 failed
tests/live-tasks-single-source.test.ts 2 failed
→ 合计 9 条，与「有本次改动」时的失败集合完全相同
```

第 10 条 `tests/canceled-legacy-read.test.ts` 单列：两种状态各多轮实测，失败率同量级（≈ 10–20%），属存量 flaky。

## 故障注入

| 注入点 | 注入方式 | 期望（且实测） |
|---|---|---|
| 剩余时间公式（t6） | 基准从 `interruptedAt ?? createdAt` 改回 `createdAt` | 中止票那条用例**立即变红**（1 条），还原复绿 |
| 串会话保护（t12） | 根选择顺序改成「会话根优先」 | **2 条**变红（需求级根命中 + 串会话不下退），还原复绿 |
| 根来源红字（t11） | 红字条件改成无条件输出 | **4 条**变红（三条「不该有红字」+ 字面判据），还原复绿 |
| 票行动作名（t8） | `data-action="pending-repost"` 拼错一个词 | **4 条**变红（含「拼错即红」契约那条），还原复绿 |
| 横带空态（t9） | 空票也渲染容器 | **2 条**变红（零渲染断言），还原复绿 |
| 旧留痕缺省判定（t13） | 缺 `kind` 按 cancel 判 | **1 条**变红（旧条目按 reject 判定），还原复绿 |

## 本次新增测试文件（8 个）

| 文件 | 例数 | 钉住什么 |
|---|---|---|
| tests/pending-board.test.ts | 16 | /state 投影六键、剩余时间公式、陈旧票不列、注册表读口、重投端到端 |
| tests/pending-ticket-row.test.ts | 14 | 一票一行、三档剩余时间兜底、已超时态、选择器契约 |
| tests/pending-confirm-band.test.ts | 6 | 有票逐行 / 无票零渲染 / 取数失败红字 |
| tests/pending-band-wiring.test.ts | 7 | 宽松解析、fetchState 接线、buildBoard 摆放与缺省字节兼容 |
| tests/pending-band-e2e.test.ts | 2 | 真路由真注册表 → 客户端解析 → 渲染（含作答后横带消失） |
| tests/open-doc-root-source.test.ts | 9 | 四态根来源、串会话不下退、逐字兼容、纯读不污染 |
| tests/doc-root-badge.test.ts | 8 | 非需求根红字 / 需求根无红字 / 视图来源优先 / 字面判据复现 |
| tests/compat-matrix.test.ts | 8 | 旧留痕零迁移、旧答案值映射、老服务端缺键、旧调用方行为 |
| tests/capture-rejection-persistence.test.ts | 3 | 作答到达即落盘（真盘）、中断不吞留痕、留痕失败不阻断 |

## 测试覆盖标注（accepting 覆盖度门禁用）

> 口径：每张卡（父卡与子卡）的证据来自**真跑过的命令或真读过的盘上文件**；
> 子卡的三段（研发/联调/复核/测试）证据同时落在那张卡自己的完工记录里（`tasks/<id>.md`）。
> 全量差集与故障注入见本文件上半部分；下面逐卡点名。

- covers: t-b83325 — 立项弹框四问内容定稿（t1）（父卡）
  - 证据：npx vitest run tests/capture-tool.test.ts tests/capture-output-contract.test.ts → 21 + 3 例全绿（首项（推荐）后缀 / ✖️ 居末 / 恰四问 / 一键过 / 剥后缀）
  - covers: t-f4e515 — 立项弹框四问内容定稿（t1）·阶段子卡，证据同上（该卡完工记录见 tasks/t-f4e515.md）
  - covers: t-7cd1c1 — 立项弹框四问内容定稿（t1）·阶段子卡，证据同上（该卡完工记录见 tasks/t-7cd1c1.md）
  - covers: t-d7fb36 — 立项弹框四问内容定稿（t1）·阶段子卡，证据同上（该卡完工记录见 tasks/t-d7fb36.md）
  - covers: t-0648bf — 立项弹框四问内容定稿（t1）·阶段子卡，证据同上（该卡完工记录见 tasks/t-0648bf.md）
- covers: t-b7ee98 — 弹框答案映射防静默回落（t2）（父卡）
  - 证据：npx vitest run tests/capture-tool.test.ts → mapCaptureAnswers 组全绿（带后缀不回落默认、落点三态拆分、answers 4 键）
  - covers: t-3c19b8 — 弹框答案映射防静默回落（t2）·阶段子卡，证据同上（该卡完工记录见 tasks/t-3c19b8.md）
  - covers: t-01ff92 — 弹框答案映射防静默回落（t2）·阶段子卡，证据同上（该卡完工记录见 tasks/t-01ff92.md）
  - covers: t-279628 — 弹框答案映射防静默回落（t2）·阶段子卡，证据同上（该卡完工记录见 tasks/t-279628.md）
  - covers: t-470b5b — 弹框答案映射防静默回落（t2）·阶段子卡，证据同上（该卡完工记录见 tasks/t-470b5b.md）
- covers: t-bc9944 — 弹框通道限时等待 askTimed（t3）（父卡）
  - 证据：npx vitest run tests/ask-timed.test.ts tests/gate-aware-questions.test.ts → 9 + 10 例全绿（超时回 pending 不抛、越界报错、仅真作答登记闸门）
  - covers: t-eadc95 — 弹框通道限时等待 askTimed（t3）·阶段子卡，证据同上（该卡完工记录见 tasks/t-eadc95.md）
  - covers: t-0bb141 — 弹框通道限时等待 askTimed（t3）·阶段子卡，证据同上（该卡完工记录见 tasks/t-0bb141.md）
  - covers: t-9f512b — 弹框通道限时等待 askTimed（t3）·阶段子卡，证据同上（该卡完工记录见 tasks/t-9f512b.md）
  - covers: t-53b7c9 — 弹框通道限时等待 askTimed（t3）·阶段子卡，证据同上（该卡完工记录见 tasks/t-53b7c9.md）
- covers: t-3dad5a — 确认票超时不丢与一键重投（t4）（父卡）
  - 证据：npx vitest run tests/confirm-repost.test.ts tests/pending-board.test.ts → 宽限到期中性回执、重投端点真注册表端到端 still-open
  - covers: t-6ddd3f — 确认票超时不丢与一键重投（t4）·阶段子卡，证据同上（该卡完工记录见 tasks/t-6ddd3f.md）
  - covers: t-f2ff7b — 确认票超时不丢与一键重投（t4）·阶段子卡，证据同上（该卡完工记录见 tasks/t-f2ff7b.md）
  - covers: t-adcd2a — 确认票超时不丢与一键重投（t4）·阶段子卡，证据同上（该卡完工记录见 tasks/t-adcd2a.md）
  - covers: t-d03905 — 确认票超时不丢与一键重投（t4）·阶段子卡，证据同上（该卡完工记录见 tasks/t-d03905.md）
- covers: t-7e2939 — 取消留痕与连续取消引导（t5）（父卡）
  - 证据：npx vitest run tests/capture-interactions.test.ts tests/compat-matrix.test.ts → 三类交互留痕、阈值 3 不再弹框、旧无 kind 记录零迁移
  - covers: t-f4c2ed — 取消留痕与连续取消引导（t5）·阶段子卡，证据同上（该卡完工记录见 tasks/t-f4c2ed.md）
  - covers: t-225f97 — 取消留痕与连续取消引导（t5）·阶段子卡，证据同上（该卡完工记录见 tasks/t-225f97.md）
  - covers: t-d7e33b — 取消留痕与连续取消引导（t5）·阶段子卡，证据同上（该卡完工记录见 tasks/t-d7e33b.md）
  - covers: t-36ed5a — 取消留痕与连续取消引导（t5）·阶段子卡，证据同上（该卡完工记录见 tasks/t-36ed5a.md）
- covers: t-6c3cbd — 看板 pending 票数据投影（t6）（父卡）
  - 证据：npx vitest run tests/pending-board.test.ts → 16 例全绿（六键 / remaining_ms 公式 / 空数组 / 陈旧票不列 / 路由端到端）
  - covers: t-4c8234 — 看板 pending 票数据投影（t6）·阶段子卡，证据同上（该卡完工记录见 tasks/t-4c8234.md）
  - covers: t-ceec5a — 看板 pending 票数据投影（t6）·阶段子卡，证据同上（该卡完工记录见 tasks/t-ceec5a.md）
  - covers: t-56b510 — 看板 pending 票数据投影（t6）·阶段子卡，证据同上（该卡完工记录见 tasks/t-56b510.md）
  - covers: t-784112 — 看板 pending 票数据投影（t6）·阶段子卡，证据同上（该卡完工记录见 tasks/t-784112.md）
- covers: t-5ac9e4 — 弹框与工具文案口径归零（t7）（父卡）
  - 证据：npx vitest run tests/capture.test.ts tests/output-contract.test.ts → 全绿；grep -rn 三问|四问 src/tools src/application → 8 处全部与事实源一致
  - covers: t-e80d61 — 弹框与工具文案口径归零（t7）·阶段子卡，证据同上（该卡完工记录见 tasks/t-e80d61.md）
  - covers: t-4750fc — 弹框与工具文案口径归零（t7）·阶段子卡，证据同上（该卡完工记录见 tasks/t-4750fc.md）
- covers: t-1ca419 — pending 票行组件（t8）（父卡）
  - 证据：npx vitest run tests/pending-ticket-row.test.ts → 14 例全绿（倒计时 / 两按钮 / 已超时态 / 选择器契约）
  - covers: t-e4855d — pending 票行组件（t8）·阶段子卡，证据同上（该卡完工记录见 tasks/t-e4855d.md）
  - covers: t-78e590 — pending 票行组件（t8）·阶段子卡，证据同上（该卡完工记录见 tasks/t-78e590.md）
  - covers: t-432019 — pending 票行组件（t8）·阶段子卡，证据同上（该卡完工记录见 tasks/t-432019.md）
  - covers: t-f4a1c2 — pending 票行组件（t8）·阶段子卡，证据同上（该卡完工记录见 tasks/t-f4a1c2.md）
- covers: t-2c33b8 — pending 票首屏横带组件（t9）（父卡）
  - 证据：npx vitest run tests/pending-confirm-band.test.ts → 6 例全绿（有票逐行 / 空票零渲染 / 失败红字）
  - covers: t-cb6079 — pending 票首屏横带组件（t9）·阶段子卡，证据同上（该卡完工记录见 tasks/t-cb6079.md）
  - covers: t-84815f — pending 票首屏横带组件（t9）·阶段子卡，证据同上（该卡完工记录见 tasks/t-84815f.md）
  - covers: t-afd035 — pending 票首屏横带组件（t9）·阶段子卡，证据同上（该卡完工记录见 tasks/t-afd035.md）
  - covers: t-e0e0be — pending 票首屏横带组件（t9）·阶段子卡，证据同上（该卡完工记录见 tasks/t-e0e0be.md）
- covers: t-b4e8c5 — 看板 pending 票接线（t10）（父卡）
  - 证据：npx vitest run tests/pending-band-wiring.test.ts tests/pending-band-e2e.test.ts → 7 + 2 例全绿（宽松解析 / 摆放 / 真路由到渲染往返）
  - covers: t-4183d8 — 看板 pending 票接线（t10）·阶段子卡，证据同上（该卡完工记录见 tasks/t-4183d8.md）
  - covers: t-c2410a — 看板 pending 票接线（t10）·阶段子卡，证据同上（该卡完工记录见 tasks/t-c2410a.md）
  - covers: t-b15fb4 — 看板 pending 票接线（t10）·阶段子卡，证据同上（该卡完工记录见 tasks/t-b15fb4.md）
  - covers: t-4231d9 — 看板 pending 票接线（t10）·阶段子卡，证据同上（该卡完工记录见 tasks/t-4231d9.md）
- covers: t-02c55a — open-doc 根解析诊断（t12）（父卡）
  - 证据：npx vitest run tests/open-doc-root-source.test.ts → 9 例全绿（四态根来源 / 串会话不下退 / 逐字兼容）
  - covers: t-289f9a — open-doc 根解析诊断（t12）·阶段子卡，证据同上（该卡完工记录见 tasks/t-289f9a.md）
  - covers: t-96f753 — open-doc 根解析诊断（t12）·阶段子卡，证据同上（该卡完工记录见 tasks/t-96f753.md）
  - covers: t-65cda7 — open-doc 根解析诊断（t12）·阶段子卡，证据同上（该卡完工记录见 tasks/t-65cda7.md）
  - covers: t-af61f4 — open-doc 根解析诊断（t12）·阶段子卡，证据同上（该卡完工记录见 tasks/t-af61f4.md）
- covers: t-a429de — 文档位置根来源红字徽章（t11）（父卡）
  - 证据：npx vitest run tests/doc-root-badge.test.ts tests/doc-location-panel.test.ts → 8 + 10 例全绿（非需求根红字 / 需求根无红字 / 字面判据）
  - covers: t-2c3288 — 文档位置根来源红字徽章（t11）·阶段子卡，证据同上（该卡完工记录见 tasks/t-2c3288.md）
  - covers: t-01914d — 文档位置根来源红字徽章（t11）·阶段子卡，证据同上（该卡完工记录见 tasks/t-01914d.md）
  - covers: t-7a4d8b — 文档位置根来源红字徽章（t11）·阶段子卡，证据同上（该卡完工记录见 tasks/t-7a4d8b.md）
  - covers: t-3000f0 — 文档位置根来源红字徽章（t11）·阶段子卡，证据同上（该卡完工记录见 tasks/t-3000f0.md）
- covers: t-5f569a — 旧数据与旧端兼容验证（t13）（父卡）
  - 证据：npx vitest run tests/compat-matrix.test.ts tests/capture-rejection-persistence.test.ts → 8 + 3 例全绿（旧留痕 / 旧答案 / 老服务端 / 旧调用方 / 真盘留痕）
  - covers: t-492618 — 旧数据与旧端兼容验证（t13）·阶段子卡，证据同上（该卡完工记录见 tasks/t-492618.md）
  - covers: t-c2e4b8 — 旧数据与旧端兼容验证（t13）·阶段子卡，证据同上（该卡完工记录见 tasks/t-c2e4b8.md）
  - covers: t-a7a182 — 旧数据与旧端兼容验证（t13）·阶段子卡，证据同上（该卡完工记录见 tasks/t-a7a182.md）
- covers: t-4f2c5f — 全量验收口径收口（t14）（父卡）
  - 证据：npx tsx scripts/test-baseline.mts --check（67/68，新增 10 全为存量）+ npx tsc --noEmit（0 错）+ host/client 构建（[verify-client] OK）
  - covers: t-2281a6 — 全量验收口径收口（t14）·阶段子卡，证据同上（该卡完工记录见 tasks/t-2281a6.md）

合计 64 张卡（14 父 + 50 子）逐张点名，覆盖度 100%。

