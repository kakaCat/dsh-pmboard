# T4 红标色值与无障碍定稿证据（REQ-261006211623-9dc1）

covers: t-7cc3c1, t-a74105, t-3ce6d0, t-be7da0

> 任务卡 `t-7cc3c1`（红标色值按无障碍定稿并重建客户端）的交付物。覆盖条款 FR-6 · 采集日期 2026-10-06

## 1. 改了什么（4 个文件）

| 文件 | 改动 |
|---|---|
| `src/client/styles/node-panel.ts` | `.dsh-pm-np-chain-missing` 色值改定稿（`#991b1b` on `rgba(220,38,38,.10)`）+ 加 `1px solid rgba(220,38,38,.4)` 描边；新增 `.dsh-pm-np-chain-dot`（6px 圆点） |
| `src/client/styles/subtask.ts` | `.dsh-pm-chain-missing` 同上色值 + 描边 |
| `src/client/styles/report.ts` | 新增 `.dsh-pm-dag-summary [data-dag-chain-missing] { color:#991b1b; font-weight:600 }`（落点③ 汇总条） |
| `src/client/node-panel.ts` | 角标 markup 加圆点：`<span class="dsh-pm-np-chain-dot" aria-hidden="true"></span>链未生成`（圆点不参与可访问名） |

## 2. 验收读数

```
$ grep -n "991b1b" src/client/styles/node-panel.ts src/client/styles/subtask.ts src/client/styles/report.ts
node-panel.ts:279  … background: rgba(220,38,38,.10); color: #991b1b; border: 1px solid rgba(220,38,38,.4);
subtask.ts:30      … background: rgba(220,38,38,.10); color: #991b1b; border: 1px solid rgba(220,38,38,.4);
report.ts:1158     … color: #991b1b; font-weight: 600;
（3 处规则命中；另有 2 行注释引用同色值）

$ pnpm build:client
[verify-client] OK  bundle=729071 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

$ npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts tests/node-panel.test.ts
 ✓ card-layer 14 · query-report 42 · dag-panel 23 · node-panel 28
 Test Files 4 passed (4) · Tests 107 passed (107)
```

## 3. 与权威原型 `prototypes/dag-chain-missing.html#FR-6` 逐条对照

| # | 原型契约（锚点行） | 实现 | 结论 |
|---|---|---|---|
| 1 | 红标不只靠颜色，必须带文字（原型 `:218`） | 三处出口文字分别是「链未生成」「链未生成」「子卡链未生成 N 张」 | ✅ 一致 |
| 2 | 落点① 圆点 + 文字，圆点 `aria-hidden`（原型 `:108`、`:218`） | `node-panel.ts:283` 加 `.dsh-pm-np-chain-dot`（6px 圆点，`aria-hidden="true"`） | ✅ 一致（本轮补的） |
| 3 | 色值 `#991b1b` on `rgba(220,38,38,.10)`（原型 `:24`、`:74`、`:118`、`:125`） | 三处规则同源色值 | ✅ 一致 |
| 4 | 可访问名含状态与原因，不塞 live region（原型 `:215`、`:424-425`） | 角标 `title` 保留原因原文；未新增 live region | ✅ 一致 |
| 5 | 不新增色令牌、仅这三处（原型 `:418-420`） | 只改这三处规则 + 圆点；未动色令牌与其它面板 | ✅ 一致 |
| 6 | 红标不引入动画（原型 `:136`） | 未加动画 | ✅ 一致 |

**差异（如实登记）**：落点③ 汇总条在原型里是 `.dag-summary .hot { color:#991b1b; font-weight:600 }`（无背景）——
实现按原型只上色 + 加粗，未加背景/内边距（本轮先写成带背景，核对原型后已改回一致）。

## 4. 对比度独立复算（不只抄设计里的数）

按 WCAG 2.x 相对亮度公式（前景文字 vs 有效背景 = 10% / 16% 色叠白）：

| 方案 | 文字 | 有效背景 | 对比度 | AA（≥4.5:1） |
|---|---|---|---|---|
| 定稿（本次） | `#991b1b` | `rgb(251.5,233.3,233.3)` | **7.12:1** | ✅ |
| 改前（琥珀） | `#a86a00` | `rgb(252.6,239.8,219.3)` | **3.94:1** | ❌ |

设计与本次独立复算的差异：设计写 ≈6:1、本次复算 7.12:1（叠白背景下更高），两者都 ≥ AA 阈值；
改前的 3.94:1 与设计写的 3.9:1 一致——**旧色确实不达标，改因成立**。

## 5. 归属与边界

- 本卡是本需求里**唯一改代码**的卡；`src/client/styles/report.ts` 的 diff 里另有并发窗口在制改动
  （该文件被他们同时编辑），本卡只加了 §1 表中那一格规则。
- 客户端 bundle 已重建（`lib/client.js`，`[verify-client] OK`）——构建新鲜度门所需。
- 未新增/改动任何色令牌，未触碰验收单 / 原型门 / 归档校验。

## 6. 测试段全量读数（改代码后重测 · 2026-10-06）

```
$ npx vitest run --reporter=json          # 全量
失败 69 条 · 基线 68 条 · 新增 9 · 落本次改动相关测试上的新增失败 0 条
新增失败按文件：client-view 3 · error-code-inventory 2 · live-tasks-single-source 2 ·
artifact-openable 1 · typecheck 1（全部为并发窗口在制面）

$ npx tsc --noEmit -p tsconfig.json
错误 1 条 · 基线 0 条：tests/query-docs-roots.test.ts（并发窗口在制文件）
本卡改动的 4 个文件：0 条类型错误
```

**归属与结论**：本卡改代码后客户端 4 个测试文件 107 例全绿、`[verify-client] OK`；
新增失败与 tsc 错误全部落在并发窗口在制面（client 面板 / error-code 清单 / live-tasks 谓词 /
docs 根解析），与本卡改动无交集。**严格口径未满足**（69 > 68、tsc 1 > 0）如实报出，
链尾卡 t5 会在并发改动落地后重跑同一判据。
