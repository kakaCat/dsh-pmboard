---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 测试用例（REQ-261007133149-0716）

> 判据矩阵：每条用例都给**命令 + 期望读数**，且每条门禁配一条**反向验证**（故意违规必须红）。
> 缺口（无判据）在这里是不允许的——本需求的每一条 FR 都必须有可跑的东西。

## 覆盖矩阵 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 条款 | 用例 | 命令 | 期望 |
|---|---|---|---|
| FR-1 | TC-1 | `npx tsx scripts/report-style-snapshot.mts --check`（同源采样器读 10 个 DOM 根） | 10 个根的命中数全 ≥1；报告里 10 个组件逐个在位 |
| FR-2 | TC-2 / TC-4 | `pnpm build:client`；`npx tsx scripts/report-style-ownership.mts` | 退出码 0；`[verify-client] OK … 样式归属章在场, CSS 分片完整`；归属报告「越界 0 处 / 公共层含组件取值 0 处」 |
| FR-3 | TC-3 | `npx tsx scripts/report-style-snapshot.mts --check` | 退出码 0；逐组件「不同键数」全 0 |
| FR-4 | TC-5 | `pnpm typecheck`；`npx vitest run tests/report-tabs.test.ts tests/report-shell.test.ts tests/report-contract.test.ts` | 退出码 0；全绿 |
| FR-5 | TC-6 / TC-7 | `npx tsx scripts/report-style-snapshot.mts --check`；`npx tsx scripts/report-style-ownership.mts` | 正向 0；**反向（故意违规）非 0 且点名到组件** |
| FR-6 | TC-8 | 拼接后 `shasum -a 256 src/client/styles/report.ts`；`git diff --stat src/client/api.ts` | 与改造前哈希一致；取数协议零差异 |

## TC-1 组件边界可指认（FR-1） `serves: FR-1`

**做了什么 → 看到什么**

1. 用既有标本（`scripts/fixtures/req-detail-specimen.mts`）渲染七个面板各一次。
2. 按 `manifest.ts` 的 `root` 逐个 `querySelector`：

```
预期：10 个组件根全部命中（单页 4 个：head/band/tabs + 当前面板；七页并集 = 10）
失败即红：某根命中 0 → 说明 DOM 根写错或渲染变了（不许改地图迁就）
```

## TC-2 分片拼接不破坏构建（FR-2） `serves: FR-2`

```
pnpm build:client
预期：退出码 0，且输出含 [verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整
（"CSS 分片完整"这条校验正是为分片化准备的既有判据）
```

## TC-3 外观零变更（FR-3 · 本需求的核心判据） `serves: FR-3`

```
npx tsx scripts/report-style-snapshot.mts --check
预期：退出码 0；报告逐组件列出「键数 / 不同键数」，不同键数全 0
覆盖条件：七个面板 × {1280,900} × {inflight,terminal} + 首屏四段
失败即红：任何差异 → 输出 `组件 · 选择器 · 属性 · 基线值 → 现值`（点名到组件与属性）
```

**反向验证（必须做）**：临时把某组件一条规则改一个值 → 同一命令**退出码 1 且点名该组件**；
还原后恢复 0。（防"恒绿装饰"。）

## TC-4 分片归属（FR-2 / FR-5） `serves: FR-2, FR-5`

```
npx tsx scripts/report-style-ownership.mts
预期：退出码 0；输出「组件越界 0 处 / 公共层含具体组件取值 0 处」
判定：① 每条规则的主选择器属于它所在分片的组件；② shared.ts 只含宽选择器与"口径处处相同"的成组规则；
      ③ 公共件走逐条带理由的白名单
```

**反向验证**：把 `.dsh-pm-rtm-*`（verify 的选择器）临时写进 `panels/docs.ts` →
**退出码 1 且点名**「docs.ts · .dsh-pm-rtm-… · 依据：它属于 verify」；挪回后恢复 0。

## TC-5 面板契约类型钉住（FR-4） `serves: FR-4`

```
pnpm typecheck
预期：退出码 0
npx vitest run tests/report-tabs.test.ts tests/report-shell.test.ts tests/report-contract.test.ts
预期：全绿（键唯一 / 注册顺序即展示顺序 / 7 个面板都实现全接口 / 未知键不静默回落）
```

**反向验证**：在某个面板里临时删掉 `badge` 实现 → `pnpm typecheck` **必须失败**（漏实现即红）；
恢复后 0。

**不许变的行为**（既有判据，本需求不动）：`isReportTabKey` 守卫、未知键**不静默回落成 trunk**。

## TC-6 既有行为不回退（FR-3 / FR-6 · 回归） `serves: FR-3, FR-6`

```
npx tsx scripts/req-report-probe.mts
预期：PROBE PASS 4/4 组合 + A13 六面板全过
   · 1280/900 × inflight/terminal 四组合：四问可答 / 7 Tab 次序 / Tab 栏 top 分档上限 /
     评论块 ≤260px / 横向溢出 0 / 无内层滚动（仅 .chat-scroll 豁免）/ 未激活面板缺席 /
     头部三层 + 操作区右端 / 状态带三格 ≤220px
npx vitest run tests/{report-shell,report-tabs,report-content,report-degrade,verify-panel,docs-panel,token-panel,dialogue-panel,prompts-panel,probe-hard-criteria}.test.ts
预期：全绿
```

## TC-7 窄窗适配不回退（FR-3 · 回归） `serves: FR-3`

```
（用既有逐档量测手法）七面板 × {1400,1280,1152,1024,960,900,820,768,700,640,600,560}
预期：零页面级横向溢出、零壳内横向溢出、壳宽恒 = min(视口, 1280)
（这是上一轮"详情页不适配"修复的成果，本次重构不得回退）
```

## TC-8 可逆与兼容（FR-6） `serves: FR-6`

```
① 拼接：按固定顺序 join 分片 → shasum -a 256 与改造前的 report.ts 一致（逐字节相同）
② 取数协议：git diff --stat src/client/api.ts → 只应有"端点清单推导"的改动，URL/参数/响应形状零差异
   （用 git diff 逐段核对；形状类型若有变化必须由 TC-5 的用例证明运行时不变）
③ 回滚演练：把拼接产物替换出口 + 删分片目录 → TC-3 / TC-6 / TC-7 三条全绿
```

## 反向验证清单（防门禁变装饰） `serves: FR-5`

| # | 故意做的破坏 | 必须看到 |
|---|---|---|
| R-1 | 改一条组件规则的值，不更新基线 | `report-style-snapshot --check` 退出码 1 + 点名组件与属性 |
| R-2 | 把 A 组件的选择器写进 B 组件分片 | `report-style-ownership` 退出码 1 + 点名"它属于谁" |
| R-3 | 面板少实现一个契约成员 | `pnpm typecheck` 失败 |
| R-4 | 在注册表里重复一个键 | 契约用例红（键唯一） |
| R-5 | 交换注册表两项顺序 | 契约用例红（顺序即展示顺序） |

## 关键决策与取舍 `serves: FR-3, FR-5`

| 取舍 | 候选 | 裁定 | 理由 |
|---|---|---|---|
| 零变更判据 | 比 CSS 文本 vs 比计算样式 | **计算样式 + 几何** | 文本相同不保证级联结果相同；外观只有浏览器算出来的那份 |
| 反向验证 | 抽查 vs 逐门禁固定 5 条 | **逐门禁固定**（R-1~R-5） | 门禁会腐化；没有"故意违规必红"就等于没有门禁 |
| 回归范围 | 只跑页面套件 vs 套件 + 探针 + 窄档 | **三者都跑** | 重构动了级联与分片，探针与窄档正是它的两条独立判据 |

## 技术方案与亮点 `serves: FR-3, FR-5`

- 本需求的判据有**三层且互不依赖**：类型（编译期）→ 归属（静态扫描）→ 外观（浏览器读数）。
  任一层都能独立发现"改了没生效 / 改到了别处 / 悄悄改了外观"。
