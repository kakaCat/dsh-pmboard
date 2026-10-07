---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 前端设计（REQ-261007133149-0716）

> 上游：[requirement.md](../requirement.md)、[architecture.md](architecture.md)、
> [interfaces.md](interfaces.md)。**本需求不产生新版 UI**：所有可见外观逐键不变（FR-3 证明）。

## 原型页面 `serves: FR-1`

权威原型（`prototypes/INDEX.md` 唯一 authoritative）：[anatomy.html](../prototypes/anatomy.html)
——**组件解剖图**，不是视觉稿。它回答三个问题（改代码前只读这一页）：

1. 谁拥有哪块界面（10 个组件的 DOM 根 + 服务条款）；
2. 它的外观现在写在哪（`report.ts` 章节 + 实测行号 + 代表选择器）；
3. 改它时**不必读**什么（点名的行段 + 实测行数与占比）。

## 组件树 `serves: FR-1`

```
报告壳 [data-report-shell]
├── head   常驻头部        [data-report-seg="head"]    标识行/标题行/闸门条/结论行/下一步/阶段条/最近评论
├── band   状态带三格      [data-report-seg="band"]    做到哪了 / 缺口（焦点）/ 结果与成效
├── tabs   进度带 + Tab 栏 [data-report-seg="tabs"]
└── panel  当前面板         [data-panel="<key>"]
    ├── trunk 汇报 / docs 文档 / dag DAG / dialogue 对话
    └── verify 验收 / token Token / prompts 提示词
（公共层：base 基底 / tokens 令牌 / shared 焦点环·窄档·目标尺寸·动效·字阶 + 口径处处相同的成组规则）
```

未激活面板**不在 DOM**（既有纪律，探针 A4 守着）；本需求不动这条。

### 组件清单（叶子 = 拆卡粒度单位） `serves: FR-1`

| 组件 id | 组件 | DOM 根 | 叶子（拆卡粒度） |
|---|---|---|---|
| C-1 | head 常驻头部 | `[data-report-seg="head"]` | 标识行 / 标题行 / 闸门条 / 结论行 / 下一步 / 阶段条 / 最近评论 |
| C-2 | band 状态带三格 | `[data-report-seg="band"]` | 做到哪了 / 缺口（焦点）/ 结果与成效 |
| C-3 | tabs 进度带 + Tab 栏 | `[data-report-seg="tabs"]` | 进度带 / Tab 栏 |
| C-4 | trunk 汇报 | `.dsh-pm-trunk` | 模块网格 / 模块卡 / 亮点与成效 |
| C-5 | docs 文档 | `[data-panel="docs"]` | 确定文档 / 生成物 / 其它发现 / 门禁留痕 / 归档 |
| C-6 | dag DAG | `[data-panel="dag"]` | 工具行 / 画布容器 / 空态 |
| C-7 | dialogue 对话 | `[data-panel="dialogue"]` | 吸顶分页条 / 气泡流 / 只读说明 |
| C-8 | verify 验收 | `[data-panel="verify"]` | RTM 主表 / 行展开 / 材料 / 历史 / 空态 |
| C-9 | token Token | `[data-panel="token"]` | 汇总卡 / 按节点表 |
| C-10 | prompts 提示词 | `[data-panel="prompts"]` | 注入信息 / 片段列表 / 规定 vs 实际 |

## 目录与包结构 `serves: FR-1, FR-2`

```
src/client/styles/
  report.ts            ← 出口：REPORT_CSS = 按固定顺序 join(分片)；名字/导出不变
  report/
    tokens.ts base.ts shared.ts
    head.ts   band.ts  tabs.ts
    manifest.ts        ← 组件归属清单（data-model 定义，唯一真相）
    panels/{trunk,docs,dag,dialogue,verify,token,prompts}.ts
```

**为什么文件与目录同名并存**：`styles/report.js` 的既有 import 一行不改（FR-6 的"对外名字不变"），
分片走 `report/` 子目录——解析无歧义（`./report.js` → 文件；`./report/x.js` → 目录内）。

## 样式分层与拼接顺序 `serves: FR-2, FR-6`

```
1 base.ts     ⓪ 基底（面板包装器 / [hidden] / 折叠块合上必须藏）
2 tokens.ts   ① 设计令牌
3 shared.ts   ⑫–⑱ 宽选择器层（焦点环 / 窄档 / 目标尺寸 / 动效 / 字阶）+ 口径处处相同的成组规则
4 head.ts     ② 常驻头部（含属于它的尾块：头部连带修正）
5 band.ts     ③ 状态带三格（含 FR-2 尾块）
6 tabs.ts     ④ 进度带 + Tab 栏（含 FR-4 尾块）
7 panels/*    ⑥–⑪ 各面板（含属于它的尾块，如 FR-8 → verify）
```

**顺序不变式（本设计的核心约束）**：

> 若两条规则在**改造前**的文本顺序是 A 在 B 前，且它们**能匹配同一元素**，
> 那么拼接后的顺序也必须 A 在 B 前。

满足方式：① 分片只做物理搬家，跨分片不重排；② 组件分片之间**互不匹配**（各拥有自己的前缀，
越界由门禁拦）；③ 宽选择器层（base/tokens/shared）留在组件分片**之前**，与原文件"前段是基底与
令牌、后段是组件"的相对位置一致。这三条合起来使"拼接 = 逆操作"成立（FR-6 逐字节验收）。

## 组件结构 `serves: FR-2`

每个分片的**内容契约**（门禁按此判归属）：

| 分片 | 允许包含 | 禁止包含 |
|---|---|---|
| `base.ts` / `tokens.ts` | 岛级规则（以 `.dsh-pm-detail[data-report-shell]` 直接起头、可命中任意后代）、令牌定义 | 任何单一组件的取值 |
| `shared.ts` | 宽选择器层；**口径处处相同**的成组规则（组内声明逐字相同） | 只服务一个组件的规则；带组件专属取值的规则 |
| `head/band/tabs.ts` | 该组件的选择器（含 `[data-report-seg]` 语境） | 别的组件的选择器 |
| `panels/<key>.ts` | 该面板的选择器（含 `[data-panel]` 语境）+ 属于它的尾块 | 别的面板 / 壳的选择器 |

## 页面与组件（编号表）`serves: FR-1, FR-2`

| # | 组件 | DOM 根 | 分片 | 服务条款 |
|---|---|---|---|---|
| 1 | head | `[data-report-seg="head"]` | `report/head.ts` | FR-1, FR-2 |
| 2 | band | `[data-report-seg="band"]` | `report/band.ts` | FR-1, FR-2 |
| 3 | tabs | `[data-report-seg="tabs"]` | `report/tabs.ts` | FR-1, FR-2 |
| 4–10 | trunk docs dag dialogue verify token prompts | `.dsh-pm-trunk` / `[data-panel="…"]` | `report/panels/<key>.ts` | FR-1, FR-2, FR-4 |

## 状态管理 `serves: FR-6`

**不动**：壳的懒加载、按 `reqId::tab::revision` 的缓存、分段替换（只换变化段，保住滚动/展开/草稿）、
未激活面板不进 DOM。本需求只改**外观的物理归属**与**类型/清单的单点化**，运行时行为逐字不变。

## 样式与主题 `serves: FR-2`

- 详情页是**浅色岛**：令牌取页面自持浅色原值，不引宿主主题变量（既有口径，不动）。
- 卡片语汇（白面 + 1px 描边 + 8r 圆角 + 内边距）、状态色（缺口红底 / 闸门琥珀 / 状态胶囊）
  **全部保持现状**：本需求只搬家，不改取值。
- 发丝线（`.5px`）只承担卡内分隔、卡描边 1px——既有两级线宽口径不动。

## 依赖与第三方库 `serves: FR-2`

**零新增依赖**：分片是纯字符串常量；两条门禁脚本用既有 `tsx` + headless Chrome + 既有标本
（`scripts/fixtures/req-detail-specimen.mts`）。不引入 lint 插件、不引入快照库。

## 关键决策与取舍 `serves: FR-2, FR-3`

| 取舍 | 候选 | 裁定 | 理由 |
|---|---|---|---|
| 组规则处置 | 全拆 vs 二分（同口径留 shared） | **二分** | "所有卡都一样"本就是公共口径；硬拆只会抄 N 份并制造特异性风险 |
| 拆组特异性 | 朴素拆 vs 补回原值 | **补回原值**（同义重复属性选择器，恒真） | 朴素拆会静默改胜者——正是本需求要消灭的那类错 |
| 验证口径 | 比 CSS 文本 vs 比计算样式 | **计算样式 + 几何** | 文本一致不保证级联结果一致；"外观"只有浏览器算出来的那份 |
| 死规则 | 顺手清理 vs 不动 | **不动** | 清理会与"零变更"冲突；本期只搬家（已落 D-4） |

## 技术方案与亮点 `serves: FR-1, FR-5`

- **读面缩小可量化**：改一个组件从"跨 6~9 处含 2387 行"降到"该组件一个分片（约 100~250 行）+
  一条契约"；原型里每个组件卡都标了"不必读"的行段与占比，agent 可以直接核对。
- **犯错面缩小可机械判定**：类型红（FR-4）、归属红（FR-5）、外观漂移红（FR-3）三级判据；
  三级都能"故意违规必红"地反向验证。
