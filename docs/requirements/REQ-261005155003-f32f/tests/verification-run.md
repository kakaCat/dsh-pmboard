# 测试证据（REQ-261005155003-f32f）

> 本文件记录**实际跑过的命令与它们当时的输出**（末次运行 2026-10-05，改动全部落盘后）。
> 判据脚本的完整输出另存 `evidence/`。

## 1. 渲染探针（含本需求新增的 A7～A13）

```
$ npx tsx scripts/req-report-probe.mts
…（四组合逐条打印）…
[A13 五块未覆盖面板补测（原型只渲染 trunk；1280 档 · 在途）]
  docs      目标 36 个，最小 65.3×25px ｜ 字号 {11, 12, 13, 15, 20, 24} 最小 11px ｜ Tab 图标 6 个/14px ｜ affordance emoji 0 处 … → PASS
  dag       目标 15 个，最小 46×24px   ｜ 字号 {11, 12, 13, 15, 20, 24} 最小 11px ｜ Tab 图标 6 个/14px ｜ affordance emoji 0 处 … → PASS
  dialogue  目标 15 个，最小 42×24px   ｜ 字号 {11, 12, 13, 15, 20, 24} 最小 11px ｜ Tab 图标 6 个/14px ｜ affordance emoji 0 处 … → PASS
  token     目标 12 个，最小 65.3×25px ｜ 字号 {11, 12, 13, 15, 20, 24} 最小 11px ｜ Tab 图标 6 个/14px ｜ affordance emoji 0 处 … → PASS
  prompts   目标 22 个，最小 65.3×24px ｜ 字号 {11, 12, 13, 15, 20, 24} 最小 11px ｜ Tab 图标 6 个/14px ｜ affordance emoji 0 处 … → PASS
  A13 五块面板全部 PASS（目标尺寸 / 字阶 / 结构位 emoji 三条判据）
PROBE PASS（4/4 组合：1280/900 × 在途 implementing/终态 archived；… Tab 栏 top ≤ 713 …）
exit=0
```

关键读数（四组合）：

| 组合 | tabsTop | 状态带单格 | 操作条整块 | L0 三块落点 | 内层滚动 | 横向溢出 |
|---|---|---|---|---|---|---|
| 1280 在途 | 497 ≤ 713 | 162 ≤ 220 | 27 ≤ 72 | 全在首屏 | 0 | 无 |
| 900 在途 | 527 ≤ 713 | 162 ≤ 220 | 27 ≤ 72 | 全在首屏 | 0 | 无 |
| 1280 终态 | 437 ≤ 713 | 162 ≤ 220 | 39 ≤ 72 | 全在首屏 | 0 | 无 |
| 900 终态 | 441 ≤ 713 | 162 ≤ 220 | 39 ≤ 72 | 全在首屏 | 0 | 无 |

新增断言组（A7～A13）实测：焦点环 2px / ±2px / 4.7:1；最小命中区 42×24；最小字号 11px、
档位恰为六档、阶梯外 0；reduce 下过渡 0s；阶段点 ✓/▸ 与缺口 SVG 圆 + 真实文本标记齐；
H1 1.85 / H2 4.5 / H3 双通道 / H4 档数 4 / H5 主色 1 类；D-8 动作行 8 < 身份行 39。

## 2. 可失败性自证（证明判据真的会红，不是"只打印"）

| 变异 | 结果 |
|---|---|
| `--pm-target` 24px → 20px | 退出码 **1**；A8 报红 12 处（命中区 < 24×24） |
| 去掉全部 `:focus-visible` | 退出码 **1**；A7 报红 136 处（环样式 none） |
| `--f-small` 12px → 12.5px | 退出码 **1**；A9 报红 47 处（阶梯外字号） |
| `--pm-warn-text` 改回 `#a86a00` | 对比度脚本退出码 **1**（「警告文字 4.44:1 < 4.5:1」） |
| 去掉渲染里的 `aria-describedby` | `vitest run` 2 个文件 → **1 failed**；恢复后 84 passed |

## 3. 对比度报表

```
$ npx tsx scripts/req-detail-ui-contrast.mts
…（A 真文字 9 条 / B 非文本 8 条 / C 豁免 4 条 / D 芯片 tint 3 条 / E 浅色岛口径 9 条 / F 备用令牌 3 条）…
RESULT: PASS（A/B/D 全部计判项达标；C 逐条登记豁免；E 浅色岛口径成立；F 备用令牌在场）
CONTRAST PASS
exit=0
```
未见任何正文档 < 4.5:1 或非文本档 < 3:1；报表落 `evidence/contrast-report.txt`。

## 4. 出图脚本（原型几何 + 漂移）

```
$ npx tsx scripts/req-detail-ui-prototype-shot.mts
…（四段漂移核对 + FR-11/FR-13/D-8 逐节点断言 + 浅色岛 sha256 + FR-10 七项收敛）…
PROTOTYPE-SHOT PASS（4 张 after 图（含浅色岛 dark 对照档）+ 四段漂移核对 + FR-11 逐节点断言 + 几何断言 + FR-10 七项收敛全过）
exit=0
```
- 浅色岛：`ui-after-1280-inflight.png` 与 `ui-after-1280-inflight-dark.png` sha256 **相同**
  （`7641a105f6b2f39817309f47690153712eab1ca172fe4ce5fa1d34106a9e39c6`）。
- `proto-geometry`：**81 条**观测（与 after 图同一次运行产出）。

## 5. 全仓测试 / 类型 / 构建 / 知识层

| 命令 | 结果 |
|---|---|
| `npx vitest run` | **68 failed / 5622 passed / 22 skipped** —— 与开工前基线（68 failed）**持平**，未劣化 |
| `npx tsx scripts/req-report-probe.mts` | 退出码 0 |
| `npx tsc --noEmit -p tsconfig.json` | 退出码 **0**，输出 **0 行** |
| `pnpm build:client` | `[verify-client] OK  bundle=629148 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| `pnpm build` | 退出码 0（host + client） |
| `pnpm kb:build` | 退出码 0；生成物**零漂移** |
| `pnpm kb:check` | 未归类脚本一类**已修复**（覆盖度零缺口）；余 5 项落在本需求未触碰的页面，逐条归因见 `evidence/kb-check-status.txt` |

本需求相关的 6 个测试文件全绿：
`tests/report-shell.test.ts`（58）、`tests/report-firstscreen-gaps.test.ts`（26）、
`tests/report-degrade.test.ts`（18）、`tests/dialogue-panel.test.ts`、`tests/client-view.test.ts`（61）、
`tests/probe-hard-criteria.test.ts`（9）。

## 6. 断言同步的完整性

- `tests/report-shell.test.ts`：五处改写 + **三条新增**（aria-describedby 指向节点文本 === 服务端 consequence；
  头部不渲染评论输入框；详情页头部无评论框）
- `tests/report-firstscreen-gaps.test.ts`：三处改写 + 一条加强（对话 Tab 回复框裹在 `.dsh-pm-comment-form` 内）
- **零删除**：所有旧断言要么保留、要么把"存在"改成"不存在"（换判据不丢判据）

## 7. 覆盖标注（covers）

> 每个任务卡的验收判据都由下面这些**实际跑过**的命令覆盖；一条命令覆盖多张卡时逐卡标注。

- covers: t-390475 —— 浅色岛令牌与去宿主覆盖：对比度报表 E 段（`data-ds-dark-theme` 0 命中、8 个宿主令牌 0 引用）
- covers: t-dfc3e4 —— 同上（研发段）
- covers: t-e0b5bd —— 同上（复核段）
- covers: t-781e2f —— 同上（测试段：全仓用例 + 探针）
- covers: t-efb505 —— 图标源模块：探针 A13「Tab 图标 6 个 / 14×14px」
- covers: t-df3a58 —— 同上（研发段）
- covers: t-20a45a —— 同上（复核段）
- covers: t-b65a2d —— 同上（测试段）
- covers: t-9f4690 —— Tab 栏 SVG + tablist/tab 语义：`tests/report-shell.test.ts` Tab 用例 + 探针 A1/A13
- covers: t-3d7758 —— 同上（研发段）
- covers: t-816d13 —— 同上（复核段）
- covers: t-9557e9 —— 同上（测试段）
- covers: t-66cca7 —— 焦点环两档偏移：探针 A7
- covers: t-31ba82 —— 同上（研发段）
- covers: t-02f98e —— 同上（复核段）
- covers: t-30c0fa —— 同上（测试段）
- covers: t-0d8c9b —— 目标尺寸 ≥24×24：探针 A8 + A13
- covers: t-d64b22 —— 同上（研发段）
- covers: t-ca7f97 —— 同上（复核段）
- covers: t-27c9e7 —— 同上（测试段）
- covers: t-70b3f0 —— 动效令牌与 reduced-motion：探针 A10
- covers: t-827e35 —— 同上（研发段）
- covers: t-8ac205 —— 同上（复核段）
- covers: t-644764 —— 同上（测试段）
- covers: t-2055e5 —— 字阶六档与视觉层级：探针 A9 + A12（H1～H4）
- covers: t-7803b0 —— 同上（研发段）
- covers: t-0610b1 —— 同上（复核段）
- covers: t-6370c7 —— 同上（测试段）
- covers: t-efa046 —— 胶囊/圆角/边线收敛：出图脚本 FR-10 七项复测
- covers: t-b03e64 —— 同上（研发段）
- covers: t-02d5d0 —— 同上（复核段）
- covers: t-8403a5 —— 同上（测试段）
- covers: t-7e197f —— 头部两行与 D-8：探针 A12 D-8 三条
- covers: t-341103 —— 同上（研发段）
- covers: t-b1ec60 —— 同上（复核段）
- covers: t-b0e22e —— 同上（测试段）
- covers: t-c08714 —— 操作条文案收敛：出图脚本 FR-11 逐节点断言 + `tests/report-shell.test.ts`
- covers: t-a03149 —— 同上（研发段）
- covers: t-77438e —— 同上（复核段）
- covers: t-b38bae —— 同上（测试段）
- covers: t-0441dc —— 移除评论输入框：出图脚本 FR-13 逐节点断言 + 防删过头用例
- covers: t-a9e2cd —— 同上（研发段）
- covers: t-6d393a —— 同上（复核段）
- covers: t-09f05a —— 同上（测试段）
- covers: t-cdb864 —— 非颜色标记：探针 A11 + 灰度评审图
- covers: t-7f4e6d —— 同上（研发段）
- covers: t-a0c771 —— 同上（复核段）
- covers: t-707b9d —— 同上（测试段）
- covers: t-fcdf91 —— 对比度报表：`scripts/req-detail-ui-contrast.mts` 退出码 0 + 可失败性自证
- covers: t-ede02b —— 同上（研发段）
- covers: t-419ccd —— 同上（复核段）
- covers: t-0106fd —— 同上（测试段）
- covers: t-5c0373 —— 探针 A7～A13 断言组：探针退出码 0 + 三组可失败性自证
- covers: t-57082b —— 同上（研发段）
- covers: t-41aca5 —— 同上（复核段）
- covers: t-ddec08 —— 同上（测试段）
- covers: t-bce26d —— 断言同步：`npx vitest run` 两份文件 84 passed + aria-describedby 自证
- covers: t-fd33fe —— 同上（研发段）
- covers: t-3b01f0 —— 同上（复核段）
- covers: t-98db4f —— 同上（测试段）
- covers: t-819a63 —— 出图脚本改指 v3 与漂移改造：脚本退出码 0 + 浅色岛 sha256 + proto-geometry
- covers: t-5be57f —— 同上（研发段）
- covers: t-2d6ff2 —— 同上（复核段）
- covers: t-c192d2 —— 同上（测试段）
