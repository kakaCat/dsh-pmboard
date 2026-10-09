# 原型对照（REQ-261007223647-da5d · 2026-10-08）

> 本文件是验收单第 16 项 `prototype-compare` 的证据：权威原型 = `prototypes/detail.html`
> （`prototypes/INDEX.md` 标唯一 authoritative），锚点 `#FR-1` ~ `#FR-6` 与 `requirement.md` 功能点同号。
> 采集：2026-10-08 · HEAD `c49fd5e` · 工作树 `142 files changed, 2398 insertions(+), 988 deletions(-)`。
>
> **怎么人眼看**：打开 <http://127.0.0.1:19387> → 看板首页（FR-5 横带）／任一需求详情右上「📂 文档位置」行（FR-6 红字徽章）；
> 拿本页锚点表逐行对照原型的同名锚点区块。

## 锚点 ↔ 实现 ↔ 可复核断言

| 锚点 | 原型画的是什么 | 实现落点 | 可复核断言（命令） |
|---|---|---|---|
| #FR-1 | 票先落台账、作答即落盘、工具超时不吞票 | `src/application/internal/ask-timed.ts`、`capture-rejections.ts`、`src/http/routers/requirements.ts` 的 repost 端点 | `npx vitest run tests/ask-timed.test.ts tests/capture-rejection-persistence.test.ts` |
| #FR-2 | 取消后给替代路径、连续取消不再裸重弹 | `CaptureRequirement.ts` 的 cancel/timeout 分支 + `recentCaptureCancels` 阈值 3 | `npx vitest run tests/capture-interactions.test.ts` |
| #FR-3 | 两段 4 问、题干带理由、推荐置首带「推荐」标、✖️ 置末、⚡ 一键过 | `src/application/internal/capture-mapping.ts`（题目构造与映射） | `npx vitest run tests/capture-tool.test.ts` |
| #FR-4 | 问数与文案口径一致、无机器词 | `CaptureTool/prompt.ts`、`CreateTool/prompt.ts`、`capture-section.ts`、`volatile-notice.ts`、`QueryState.ts` | `grep -rn "三问\|四问" src/tools src/application` → 8 处全部与事实源一致 |
| #FR-5 | 看板首屏顶部横带：每行 🔔 + 类型·REQ + 剩余时间 + 「去作答」/「重投弹框」；第二行示例已超时 | `src/client/views/pending-confirm.ts` + `board-mount.ts` 接线（`data-pending-count` 等数据属性） | `npx vitest run tests/pending-ticket-row.test.ts tests/pending-confirm-band.test.ts tests/pending-band-e2e.test.ts` |
| #FR-6 | 地址错根 → 面板红字「地址可能不准（根来源：回落）」 | `src/client/open-doc.ts`（根诊断）+ `req-doc-location.ts`（红字徽章） | `npx vitest run tests/doc-root-badge.test.ts tests/open-doc-root-source.test.ts` |

## 差异清单（2026-10-08 按验收人裁定「先对齐原型」逐条闭环）

| # | 原型（线框）写的 | 对齐后实现 | 状态 |
|---|---|---|---|
| 1 | 票行前缀有 🔔 图标 | 行首 `.dsh-pm-pending-bell` 输出 🔔（`aria-hidden`，读屏器忽略装饰） | ✅ 已对齐 |
| 2 | 行标题「验收确认 · REQ-…」 | 「设计文档待确认 · REQ-t8」——**门名在前、REQ id 在后**，形状与线框一致 | ✅ 已对齐 |
| 3 | 按钮文案「重投弹框」 | 逐字改为「重投弹框」（`data-action="pending-repost"` 行为不变） | ✅ 已对齐 |
| 4 | 倒计时「剩余 26:41」（mm:ss） | 「剩余 29:00」mm:ss；本地每秒递减，到零「已超时」 | ✅ 已对齐 |
| 5 | 超时行写「已超时 —— 票仍有效，可一键重投」 | 超时行补 `.dsh-pm-pending-note`「票仍有效，可一键重投」 | ✅ 已对齐 |

对齐后的复核命令（全部实跑）：

```
npx vitest run tests/pending-ticket-row.test.ts tests/pending-confirm-band.test.ts \
  tests/pending-band-wiring.test.ts tests/pending-band-e2e.test.ts tests/pending-board.test.ts
→ Tests 45 passed / 5 files

client 构建 → [verify-client] OK  bundle=784848 bytes
产物核对：grep -c 重投弹框 lib/client.js = 1；grep -c dsh-pm-pending-bell lib/client.js = 2
```

## 未做视觉截图的原因（如实说明）

本窗口没有浏览器/截图能力（无 DOM 环境与截图工具），故本对照的证据是**锚点文本级 + 渲染断言级**：
原型锚点区块内容见 `prototypes/detail.html`，实现侧渲染产物由 `tests/pending-ticket-row.test.ts`
等用例逐字符串断言（例如 `data-pending-count="1"`、`data-action="pending-answer"`、「已超时」）。
**外观层面的最终判断仍需人眼看一眼**（看板首页与需求详情的文档位置行），这也是本项被列为人工核对项的原因。
