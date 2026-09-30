# 验收通道修复留证 · 2026-09-30 21:0x

> **TL;DR**：人工验收门当时**两条通道都断**，各有独立原因。两处都已修复并重建产物，与本次交付的
> FR-1~FR-4 无关，但**不修则人无法完成验收**，故作为「解除人工门阻断」一并处理并留证。

## 一、会话弹框路径：`POPUP_PASS_FALLBACK is not defined`

| 项 | 内容 |
|---|---|
| 现象 | 调用 `reqboard_accept_sheet` 直接抛 `ReferenceError: POPUP_PASS_FALLBACK is not defined`（整条弹框验收路径不可用） |
| 根因 | 并发「覆写式同步」留下的**半截编辑**：该兜底文案在 `AcceptSheet.ts` 只被**使用**、从未**定义**（全仓 `grep` 仅 1 处命中，即使用点） |
| 语义 | 2d65 FR-1 要求「通过也必须填实际结果」，而本机弹框是「选项 **或** 自定义输入」二选一——选了点选项就拿不到 custom，空意见会被域门 `opinion_required` 拒绝；兜底文案就是为此而生 |
| 修复 | 在 `AcceptSheet.ts` 定义 `POPUP_PASS_FALLBACK = '（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）'`——如实写明"未附实际结果"，不伪装成已复核 |
| 验证 | `tsc` 213 → **212**（该文件 0 错误）；`tests/accept-sheet-tool.test.ts` + `tests/accept-verdicts-snapshot.test.ts` → **9 passed**；`tsdown` Build complete，文案已进包 |

## 二、看板逐项路径：前端提示/发送与域门脱节

| 层 | 修复前 | 修复后 |
|---|---|---|
| UI 提示 | `stage-panel.ts` placeholder：「**不通过时**填意见（必填）」 | 「**通过填实际结果 / 不通过填意见（均必填）**」 |
| 前端发送 | `board-mount.ts`：opinion 为空则**不带该字段**，直接 POST | 先在本层拦下：点名缺哪几项 + 说明通过项要填什么，**不发请求** |
| 后端门禁 | `verdicts.ts`：通过也要求 opinion（2d65 FR-1）——**规则正确，无需改** | 不变 |

**为什么这是真问题**：用户按 placeholder 的暗示「勾通过 + 留空」，必然被服务端 `400 通过的验收项必须填写实际结果（opinion）` 拒绝，而前端只把原始错误 `window.alert` 出来——**人工门看起来"点不动"**，且原因指向不明。

**验证**：`tsc` 保持 212；`tests/acceptance-criteria.test.ts`(37) + `board-attach`(6) + `e2e-accept-override`(1) + `compat-regression`(7) → **51 passed**；`build:client` → `wrapped dsh-pmboard -> lib/client.js` 且 `[verify-client] OK`，两处改动均已在包内（`grep` 命中）。

## 三、生效条件（操作）

| 通道 | 生效条件 |
|---|---|
| 看板逐项 | **刷新页面**（浏览器重新加载 `/plugins/dsh-pmboard/client.js`）；页面若被宿主缓存则需重启宿主 |
| 会话弹框 | **重启宿主**（加载 21:0x 重建的 `dist`） |

## 四、备注：本次事故的第五处半成品

这是同一个并发改写批次留下的**第五处**不完整产物（前四处：缺 4 个源码模块 → 缺插件装载层 `cordis.patch.yml` → `AcceptSheet.ts:160` 语法损坏 → `POPUP_PASS_FALLBACK` 未定义）。四处已修，第五处即本文件第二部分的前端脱节。再次印证：**该批次写入不完整，工作区需要隔离并把关键文件纳入 git**。
