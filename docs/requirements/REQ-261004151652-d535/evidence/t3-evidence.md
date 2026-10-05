# t3 证据：构建 + 基线回归 + 兼容/回滚 + 三档截图（REQ-261004151652-d535）

## 构建（规范 C-11 / C-12）

```
$ pnpm build                        # 宿主 + 客户端
✔ Build complete … [verify-client] OK  bundle=343522 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
exit=0
dist/index.mjs  15:33（新）
lib/client.js   15:33（新）
```

## 基线回归（逐文件 diff，而不是比失败数）

```
$ pnpm test
 Test Files  46 failed | 341 passed | 3 skipped (390)
      Tests  96 failed | 3967 passed | 20 skipped (4083)

$ diff <开工前基线失败文件集合> <本次失败文件集合>
（完全相同：0 差异）
```

- 开工前基线 = **46 文件 / 96 用例**（沿用上一需求归档时实测的同一口径，逐文件集合已存档）。
- 本需求**自身新增/更新的用例全部通过**；失败集合零差异 ⇒ 未引入任何新红。
- 通过用例 3925 → 3967（本需求新增守卫 + 仓库自身数据变化；失败数不变是决定性的）。
- 汇总：`evidence/full-suite-final.txt`、`evidence/full-suite-after-t1.txt`（过渡态，多 1 个文件）、`evidence/full-suite-after-t2.txt`。

```
$ pnpm typecheck   → 146 个错误（与基线持平；本需求触碰的文件 0 个）
```

## 三档截图（真 CSS + 真模型 + 真 Chrome；生成器 `evidence/shot-specimen.mts`）

| 截图 | 视口 / 容器 | 看到什么 |
|---|---|---|
| `header-node-tokens-1280.png` | 1280 / 1232（明细宽档） | 7 个节点名，**每个名字正下方是它自己的数**（827.8k / 10.9M / 922.0k / 12.7M），连线在，**无累计徽章**（不重复） |
| `header-node-tokens-700.png` | 700 / 652（中档） | 只剩当前节点「实施」，**12.7M 就在它名字下方**，无连线、无累计徽章 ← **本需求的核心修复点**（旧规则这一档是「有名字没数」） |
| `header-node-tokens-560.png` | 560 / 512（紧凑档） | 圆点 + `3/12` + 累计徽章 `25.3M`（图标已收起），明细全隐 |

**必须说清的偏差（与上一需求同源，不藏）**：这三张是**标本页**截图，不是运行中 GUI 的截图——
宿主把插件 dist 常驻内存，重建不换已加载模块；本会话审批被禁用（`plugin_manager` 需 danger-full-access → 自动拒绝），
我无权重载宿主。标本与真组件同构（同类名、同 DOM、同一份 CSS、同样走 `fmtTokens`）。
人工重载 DSH 后，会话头部即按这三档规则渲染。

## 兼容与回滚（逐条）

| 项 | 结论 | 依据 |
|---|---|---|
| 后端接口与数据契约 | **零变更**（`requirement.tokenTotal`、`nodes[].tokens` 逐字不变） | `src/http/routers/stages.ts` 本次未改；接口单测 9 条全绿 |
| 组件 DOM 结构与类名 | **零变更** | `src/client/conversation-progress.ts` 本次未改；TC-2e 结构断言仍绿 |
| 节点点击 / 展开面板 / 文档链接 | 行为不变 | 徽章与节点数都不挂 `data-action`；端到端用例（真实浏览器）2 条全绿 |
| 无 token 的节点 | 只有名字、无数字（**不补 0**） | 数据侧 `nodes[].tokens` 键缺席（既有用例）；渲染层无 0 文本 |
| 降级路径（不支持容器查询 / 无容器祖先） | 全部明细可见 + 累计徽章隐藏（与宽档一致） | 探针 `--fallback` PASS（`evidence/t2-probe-fallback-green.txt`） |
| 回滚 | 三处独立可回：① `FLOW_TIERS.token` 回 1000；② `.dsh-pm-flow-meta` 回横排；③ 徽章回常显（去掉默认 `display:none`） | 三处各自有单测/探针断言守着；无数据迁移、无 schema、无开关、无缓存 |

## 验收反馈整改：字体与配色（用户原话「字体太大、颜色不对、样式和之前不一样」）

**病因**：改上下两行之后，节点名 8px（状态色）与节点数 10px（正文黑 `--dsw-text-primary`）并置——
**数字比名字大、还更深**，主次颠倒，所以看着不像一套。

**整改**（三处，只动字号与颜色）：

| 元素 | 改前 | 改后 | 理由 |
|---|---|---|---|
| 节点数 `.dsh-pm-flow-token` | 10px / 正文黑 | **8px / 次要灰**（`--dsw-text-secondary`） | 与名字同号、退居辅助；名字保留状态色（绿=已完成 / 蓝=当前 / 灰=未到）作为语义主色 |
| 计数 `.dsh-pm-cprog-inline-count` | 10px | **9px** | 随节点数字一起收一档，芯片内文字同尺度 |
| 累计徽章 `.dsh-pm-token-badge` | 10px | **9px** | 同上（卡面与列表共用该类，一并统一） |

**整改后**：`evidence/font-after-fix.png`（真 CSS + 真 Chrome，1280 宽）。
**候选对照留档**：`font-A.png`（现状=主次颠倒）、`font-B.png`、`font-C.png`、`font-D.png`
（四张是给用户挑的候选；用户裁定「再小一点 + 颜色不对」，据此定稿为上表）。

**整改后的回归**（全绿，未因字号变化而回退）：
```
vitest run tests/header-progress-responsive.test.ts tests/header-progress-e2e.test.ts → 24 passed
tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，PROBE PASS
pnpm build:client → [verify-client] OK
```

## 顺带修掉的一个真缺陷（t2 阶段发现，留档）

CSS 分片拼接顺序是 BASE → BOARD → TOKEN，同特异性时**后被追加者胜**：
「窄档显示累计徽章」若不提高特异性，会被 TOKEN_CSS 里的默认 `display:none` 压住（探针报 `TOTAL_MISSING`）。
修法：显示规则带 `.dsh-pm-cprog-inline` 前缀；单测 TC-2f 断言该前缀，并实测去掉即红。
