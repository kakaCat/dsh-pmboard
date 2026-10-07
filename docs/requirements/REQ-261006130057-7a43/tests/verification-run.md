# 测试证据（REQ-261006130057-7a43）

> 记录**实际跑过的命令与当时的输出摘要**（末次运行 2026-10-06/07，改动全部落盘后）。
> 完整判据输出另存 `evidence/`（`verify-dialogue-smoke.txt`、`uc-walkthrough.md`）。

## 1. 几何探针（七 Tab 口径）

```
$ npx tsx scripts/req-report-probe.mts
[四观测量复测（T-19；阈值在探针断言里，不进 geometry 块）]
  w=1280 inflight：tabsTop=556 headHeight=352 bandHeight=172 verifyTabIndex1Based=5
  w=900  inflight：tabsTop=831 headHeight=352 bandHeight=443 verifyTabIndex1Based=5
  w=1280 terminal：tabsTop=417 headHeight=214 bandHeight=170 verifyTabIndex1Based=5
  w=900  terminal：tabsTop=667 headHeight=242 bandHeight=388 verifyTabIndex1Based=5

PROBE PASS（4/4 组合：1280/900 × 在途 implementing/终态 archived；四问可答 / 7 Tab 次序（验收第 5 位）/
Tab 栏 top 分档上限（713 @1280 · 1153 @900）/ 评论列表整块 ≤ 260px / 横向溢出受控（登记源之外零残余）/
无内层滚动容器（.chat-scroll 460px 唯一豁免）/ 未激活面板缺席（六键）/ 头部三层 + 操作区聚合右端 /
状态带三格 ≤ 220px ｜ A13 六面板全过）
exit=0
```

- A3：白名单外内层滚动 0 处；`.chat-scroll` 为唯一豁免（注释写明 D-5/D-7 出处）。
- `.dsh-pm-tabs` 900 档实测 `scrollWidth == clientWidth` → 未内溢，故**未**加白名单（结论已记录）。
- 命中区（≥24×24）两条历史豁免（`dsh-pm-comments-all` / `dsh-pm-doc-open`）已随本轮修复**销账**，
  另连带修掉 `dsh-pm-gate-link`（原 22px 高），现全部为硬判据。

## 2. before/after 对照出图

```
$ npx tsx scripts/req-7a43-ui-shot.mts
SHOT PASS（5/5 张 after：1280×在途 / 900×在途 / 1280×终态 / verify / dialogue；
before 三档引用齐；目录 docs/requirements/REQ-261006130057-7a43/evidence）
exit=0
```

- 5 张 after：`ui-after-1280-inflight.png`、`ui-after-900-inflight.png`、`ui-after-1280-terminal.png`、
  `ui-after-1280-inflight-verify.png`、`ui-after-1280-inflight-dialogue.png`（均 2 倍图）。
- 3 张 before 副本（`ui-before-*.png`）：sha256 与 `REQ-261005155003-f32f/evidence/ui-after-*.png`
  源图一致，脚本内**硬守卫**（副本被删/被换即判红）。

## 3. 对比度（新增四对）

```
$ npx tsx scripts/req-detail-ui-contrast.mts
CONTRAST PASS（报表：docs/requirements/REQ-261005155003-f32f/evidence/contrast-report.txt）
exit=0
```

| 组合 | 实测 | 判据 |
|---|---|---|
| `#d70015` on `--pm-danger-tint` (#fdf2f3) | 4.92:1 | ≥4.5 |
| `#c93400` on `#fdf2f3` | 4.82:1 | ≥4.5 |
| `#6e6e73` on `#fdf2f3` | 4.63:1 | ≥4.5 |
| `#c93400` on `--pm-warn-tint` (#fffbeb) | 5.09:1 | ≥4.5 |

## 4. 单元/渲染测试（witness 用例）

```
$ npx vitest run tests/verify-panel tests/dialogue-panel tests/report-tabs tests/docs-panel \
    tests/docs-panel-states tests/report-shell tests/report-degrade tests/report-content \
    tests/report-firstscreen-gaps tests/trunk-panel tests/probe-hard-criteria \
    tests/acceptance-criteria tests/query-verify tests/query-dialogue
Test Files  14 passed (14)
Tests       405 passed (405)   ← D-10~D-13 返工后（返工前 343）
exit=0
```

要点用例：
- `tests/verify-panel.test.ts`（20 例）T-1~T-6：RTM 表每 FR 一行、覆盖链 ✓/✗ 真文本、两态空态不画表、
  行展开 result/needsHuman、徽标 pending 口径（`not_verifiable` 不算待裁决）、docs 迁移指引条。
- `tests/dialogue-panel.test.ts`（24 例）T-7~T-11：气泡三态、**无**回复框/检索框、吸顶 pager 是 scroll
  第一子元素、`pageKnown=false` 降级、正序、过滤不变量反例。
- `tests/report-shell.test.ts`（64 例，含 T-12）：头部三层、闸门提示条 + `scroll-gap-focus` 锚链、
  终态豁免、操作集合不增不减。

## 5. 全量测试与基线比对（C-14）

```
$ pnpm test
Test Files  37 failed | 523 passed | 3 skipped (563)
Tests       68 failed | 6550 passed | 22 skipped (6640)
exit=1

$ pnpm baseline:check
[基线] 本次失败 68 条 · 基线 68 条
[差集] 新增失败 9 / 不再失败 9
[口径] tsc 退出码 2 · error TS 1 条
```

归因（逐条）：新增 9 条**全部**属另一窗口在途改造，本需求零新增 ——
`client-view`(3) ← `src/client/views/board.ts` / `verification.ts`（该文件内带着其它 REQ id）、
`typecheck`(1) ← `tests/query-docs-roots.test.ts` TS2415（另一窗口 `harness.ts` 新增 `private root` 冲突）、
`error-code-inventory`(2) / `live-tasks-single-source`(2) / `artifact-openable`(1) 均为其它子系统。
**未执行 `--refresh`**（避免替他人销账）。

## 6. 构建（C-11 / C-12）

```
$ pnpm build
ℹ lib/client.cjs  729.54 kB │ gzip: 200.97 kB
✔ Build complete in 936ms
wrapped dsh-pmboard -> lib/client.js 640833 bytes
[verify-client] OK  bundle=729836 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
exit=0
```

## 7. 真实 HTTP 联调（服务端契约）

```
$ npx tsx docs/requirements/REQ-261006130057-7a43/evidence/verify-dialogue-smoke.mts   # 打印 PORT 后常驻
$ curl -s http://127.0.0.1:<port>/dashboard/api/reqboard/requirements/REQ-.../verify
  success: True  keys: [coverage, history, materials, pendingCount, sheet, tracking]
  pendingCount: 2  tracking fr_ids: [t-aaa, REQ-LEVEL, t-bbb]
  coverage: {FR-1:{design:true,tasks:true,tests:true}, FR-2:{design:true,tasks:false,tests:false}, …}
$ curl -s '.../dialogue?before=2500&limit=1'
  page: {total: 3, hasMore: True, before: 2000}  items: [('agent', 2000)]
```

完整输出见 `evidence/verify-dialogue-smoke.txt`。

## 覆盖声明（covers：逐任务 → 判据）

> 门禁口径：每张任务卡（含子卡）都要在本文件里有 `covers: t-xxx` 标注，指向覆盖它的判据。

### 父卡

- covers: t-a85893 —— §7 真 HTTP 联调 + §4 `tests/query-verify`（T-20/21/22）
- covers: t-b10534 —— §4 `tests/report-tabs`（七枚/次序/徽标/占位）+ §1 探针 Tab 次序与 verifyTabIndex1Based=5
- covers: t-2bb923 —— §4 `tests/verify-panel`（20 例 T-1~T-6）+ §2 `ui-after-1280-inflight-verify.png`
- covers: t-e804cb —— §4 `tests/report-shell` T-12（三层/锚链/终态豁免）+ §2 `ui-after-1280-inflight.png`
- covers: t-4ec806 —— §4 `tests/report-firstscreen-gaps` + §1 探针状态带三格 ≤220px + §3 对比度 danger-tint 三对
- covers: t-3525b5 —— §4 `tests/trunk-panel` + `tests/report-firstscreen-gaps`（T-14/T-15）
- covers: t-3cd4ac —— §4 `tests/dialogue-panel`（24 例 T-7~T-11）+ §2 `ui-after-1280-inflight-dialogue.png`
- covers: t-8d7820 —— §4 `tests/docs-panel`/`token-panel`/`prompts-panel`/`dag-panel` + §1 探针 A13 六面板
- covers: t-748369 —— §1 探针四观测量 + §2 出图 5+3 + §3 对比度四对 + §4 `tests/probe-hard-criteria`
- covers: t-14b3d7 —— §5 全量基线比对 + §6 构建 + `evidence/uc-walkthrough.md`（UC-1~UC-6）

### 子卡（研发/联调/复核/测试）

- covers: t-aaae13 —— `tests/query-verify` 14 例（新建）
- covers: t-e2d5ef —— `evidence/verify-dialogue-smoke.txt`（真 HTTP curl 两端点）
- covers: t-a5be8d —— `reviews/delivery-review.md` t1 行（P1 取根 + P2-3 已修）
- covers: t-e0996e —— §5 全量 `pnpm test` + `baseline:check`
- covers: t-1889b9 —— `tests/report-tabs` 14 例（新建）
- covers: t-77920f —— 标本页真渲染七枚 Tab 次序核对（`tests/report-tabs` 内）
- covers: t-c532ab —— `reviews/delivery-review.md` t2 行（红徽标 P1 已修 + 断言）
- covers: t-fee396 —— §4 消费面 159/159（report-tabs/shell/degrade/hydrate/client-page-panel/api-client/routes）
- covers: t-24d820 —— `tests/report-firstscreen-gaps` 26 例 + band 三套件
- covers: t-64482d —— `reviews/delivery-review.md` t5 行（对比度 P1 → #fdf2f3）
- covers: t-20ec1e —— §3 对比度 danger-tint 三对硬断言
- covers: t-8fb41e —— `tests/dialogue-panel` 24 例（气泡/只读/吸顶/正序/过滤）
- covers: t-3a61d6 —— §2 `ui-after-1280-inflight-dialogue.png`（含白底白字修复复验）
- covers: t-ab3c69 —— `reviews/delivery-review.md` t7 行（5×P2 处置）
- covers: t-4b18a5 —— §4 dialogue 消费面 196/196 + §6 构建
- covers: t-1f3296 —— `tests/report-shell` T-12 六例（新建）
- covers: t-737c82 —— `reviews/delivery-review.md` t4 行（锚链改 data-action + 切片收窄）
- covers: t-3e25f6 —— §4 head 消费面 196/196 + §6 构建
- covers: t-66b05f —— `tests/docs-panel`/`token-panel`/`prompts-panel`/`dag-panel` 110 例
- covers: t-1c83d6 —— `reviews/delivery-review.md` t8 行（`--pm-ok` 悬空令牌 P1 已修）
- covers: t-b683bc —— §4 四面板消费面 195/195
- covers: t-258f49 —— `tests/trunk-panel`（模块头一行化/网格/空节）+ `tests/report-firstscreen-gaps` T-14
- covers: t-3c4e71 —— `reviews/delivery-review.md` t6 行（0 返工项）
- covers: t-6a3dd2 —— §4 t6 消费面 167/167 + §6 构建
- covers: t-dfbdec —— `tests/verify-panel` 20 例（新建）+ `tests/docs-panel` 迁移条
- covers: t-254220 —— 验收面板真渲染截图（RTM 归组/降级/裁决控件）
- covers: t-4a56a7 —— `reviews/delivery-review.md` t3 行（10/10 核对通过）
- covers: t-0ebc99 —— §4 verify 消费面 226/226 + §6 构建
- covers: t-544b9d —— §1 探针 + §2 出图 + §3 对比度（t9 三脚本）
- covers: t-9d655a —— `reviews/delivery-review.md` t9 行（命中区 P1 销账 + 4×P2）
- covers: t-05f770 —— §5 基线比对（新增 9 条逐条归因他窗口，本需求零新增）
- covers: t-6f4123 —— §5 全量 + §6 构建 + `evidence/uc-walkthrough.md`


---

# 补记：验收期返工轮（D-10 ~ D-13）

> 人的验收反馈（原话见 requirement.md D-10~D-13）触发第二轮：**逐 Tab 与权威原型对照** + 两个 Tab 的页面适配。
> 本轮新增证据：`evidence/tab-parity-<key>.png`（7 个 Tab，每张 = 上「原型面板块」下「当前实现」）。

## 8. 逐 Tab 原型对照（新增脚本）

```
$ npx tsx scripts/req-7a43-tab-parity.mts --width 1280
OK trunk / docs / verify / token / prompts / dag / dialogue（各出原型 + 实现两张）
TAB PARITY PASS（7 个 Tab × 原型/实现两张）
exit=0
```

- 原型侧 = 从 `prototypes/detail.html` 抽出 `#panel-<key>` 面板块 + 原型 CSS 单独渲染（不是整页截图，
  避免顶部导览区把面板挤出画面）；实现侧 = `specimenShellForPanel`（真 render + 真 CSS + 同源标本）。
- 拼合图（上原型 / 下实现）：`evidence/tab-parity-{trunk,docs,verify,token,prompts,dag,dialogue}.png`。

## 9. 返工逐项（对应 D-10~D-13）

| 项 | 改前 | 改后 | 判据 |
|---|---|---|---|
| 文档 Tab 路径/状态/打开 | 绝对路径 + 长解释 + 蓝链接 | 短名（`requirement.md`/`design/frontend.md`，全路径进 title）+ 彩色短词 chip + 灰「打开」 | `tests/docs-panel` 短名/title/chip 断言 + parity 图 |
| 验收 Tab 行键 | 追溯 id（`t-xxxxxx`/`REQ-LEVEL`/`PROTOTYPE`/`DECISION`） | **`FR-1 … FR-8` 每 FR 一行**（编号 + 名称）+ 对照项另起 aux 组 | `tests/verify-panel` T-2b/T-2c + 探针「8 行 · 8 个 `data-fr-name` 非空」 |
| 验收 Tab FR 名称 | 只有编号 | 编号 + 名称（服务端从 `requirement.md` 解析 `frNames`，读不到则只留编号，不编） | `tests/query-verify` T-20b + 探针名称断言 |
| 提示词 Tab 片段 | 正文默认铺开 | 一行摘要 + 原生 details 就地展开；合并段/口径说明折起；chips 补「已投递进会话」 | `tests/prompts-panel` 28 例 + parity 图 |
| Token Tab 表列 | `阶段/调用/输入/输出/合计/占比/每次调用均/缓存命中率` | 原型列序 `节点｜阶段｜输入｜输出｜缓存命中｜合计｜时长`；口径/可优化点/成本三段折起 | `tests/token-panel` 27 例 + parity 图 |
| 汇报 Tab 模块标题 | 实现思路 / 范围边界 / 关键决策与取舍 / 亮点与差异 | 怎么做 / 边界 / 关键决策 / 亮点与成效（原型用词） | `tests/trunk-panel` + parity 图 |
| DAG 画布高度 | `max-height: 640px` 固定 | 高度随视口自适应 `clamp(360px, 100vh-400px, 900px)`、宽度铺满 | 探针 A3（视口自适应豁免）+ parity 图 |
| 对话聊天区高度 | 固定 `460px` | `clamp(320px, 100vh-420px, 880px)`（占满 Tab 栏以下可用高度） | 探针 A3 + parity 图 |

**顺带修掉的两个真问题**：
1. **版心右缘被裁 20px**：`.dsh-pm-detail[data-report-shell]` 用 content-box + `max-width:1280` + `padding: 0 20px`
   → 总宽 1320 > 视口 1280，**所有 Tab 的末列都被切**。加 `box-sizing: border-box`，内容宽回到 1240（与原型 `.wrap` 同口径）。
2. **标本 token 数字不自洽**：`byStage[].totalTokens` 与「输入+输出」不一致 → 输入占比显示 **132%**。按原型口径（合计 = 输入+输出）修正标本：合计列 1.48M、输入占比 89%。

## 10. 返工后门禁复跑

```
$ npx tsx scripts/req-report-probe.mts        → PROBE PASS 4/4（含新增「8 行 FR 名称非空」断言）
$ npx tsx scripts/req-7a43-ui-shot.mts        → SHOT PASS 5/5
$ npx tsx scripts/req-detail-ui-contrast.mts  → CONTRAST PASS（四对 4.92/4.82/4.63/5.09）
$ npx tsx scripts/req-7a43-tab-parity.mts     → TAB PARITY PASS（7 Tab × 2 张）
$ npx vitest run <15 个 witness 套件>          → 405 passed
$ pnpm build && pnpm build:client             → exit 0；[verify-client] OK bundle=748664 bytes
```
