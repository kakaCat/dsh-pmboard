---
serves: [FR-1, FR-2, FR-3, FR-5, FR-6]
---

# 架构设计（REQ-261007133149-0716）

> 上游：[requirement.md](../requirement.md)（6 条条款）。本设计的硬边界：**树内任何改动都不得
> 改变用户可见外观**——由 FR-3 的逐组件快照逐键比对机械证明，不靠自述。

## 目标与总体方案 `serves: FR-1, FR-2, FR-6`

把报告壳的外观从「单一 2387 行 + 片尾跨组件覆盖」重排成「**一个组件一个分片，拼接出口不变**」：

```
需求文档（本需求）          结构改造                    读面变化
  FR-1 组件边界成文   →  prototypes/anatomy.html  →  agent 改前只读一页地图
  FR-2 分片 + 归位    →  styles/report.ts(出口) + styles/report/*  →  改一个组件只读一个目录
  FR-4 契约类型钉住   →  report-tabs.ts 注册表单点推导  →  漏实现/键漂移编译期红
  FR-3/FR-5 证明与门禁 →  快照基线 + 归属门禁  →  外观漂移当场点名到组件
```

**三条不可让的约束**（违反即设计错误）：

1. **对外名字不变**：`src/client/styles/report.ts` 仍存在、仍导出 `REPORT_CSS`，内容改为按固定
   顺序拼接分片——所有既有 import 一行不改（`styles/report.js` 解析到文件，分片走 `report/` 目录）。
2. **拼接顺序 = 原文件的相对顺序**：分片只做**物理搬家**，跨分片不重排。理由：宽选择器
   （`[data-report-shell] *` 一类）与组件规则**能匹配同一元素**，重排就可能改胜者。
3. **零外观变更**由 FR-3 快照证明；任何一条判据红即回滚该分片（不是改快照放过）。

## 模块改动地图 `serves: FR-1, FR-2`

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/client/styles/report.ts` | 改 | 从「全部规则」变成**拼接出口**：按固定顺序 join 分片，导出名 `REPORT_CSS` 不变 |
| `src/client/styles/report/tokens.ts` | 新增 | ① 壳体与设计令牌（`--pm-*`） |
| `src/client/styles/report/base.ts` | 新增 | ⓪ 基底（面板包装器 / `[hidden]` 钉法 / 折叠块钉法） |
| `src/client/styles/report/shared.ts` | 新增 | ⑫–⑱ 跨组件层：焦点环 / 窄档 / 目标尺寸 / 动效 / 字阶收口 / **口径处处相同的成组规则** |
| `src/client/styles/report/head.ts` | 新增 | ② 常驻头部（含闸门条 / 阶段条 / 最近评论 / 头部连带修正） |
| `src/client/styles/report/band.ts` | 新增 | ③ 状态带三格 + FR-2 尾块 |
| `src/client/styles/report/tabs.ts` | 新增 | ④ 进度带 + Tab 栏 + FR-4 尾块 |
| `src/client/styles/report/panels/{trunk,docs,dag,dialogue,verify,token,prompts}.ts` | 新增 | ⑥–⑪ 各面板 + 属于它的覆盖规则（含 FR-8 尾块 → verify） |
| `src/client/views/report-tabs.ts` | 改 | 契约显式化 + 从注册表单点推导 `ReportTabKey` |
| `src/client/api.ts` | 改 | `endpoint` 联合从注册表推导（请求语义零改动） |
| `scripts/report-style-snapshot.mts` | 新增 | FR-3 快照采集/比对（本期新建） |
| `scripts/report-style-ownership.mts` | 新增 | FR-5 归属门禁（本期新建） |
| `scripts/req-report-probe.mts` | 不动 | 既有探针继续作为行为判据（A1~A13） |

## 关键算法 1：`:is()` 组的两分与「拆组保特异性」 `serves: FR-2`

**问题**：`PREFIX :is(.a, .b, .c)` 的特异性 = `s(PREFIX) + max(sp(.a), sp(.b), sp(.c))`。
朴素拆分（`PREFIX .a`）= `s(PREFIX) + sp(.a)`，若 `sp(.a) < max` 则**特异性被降低**，
与别处规则比较时可能换胜者 → 静默改外观（本需求最不能出的错）。

**处置（二分 + 一条补特异性写法）**：

```
① 口径处处相同的组（声明逐字相同、语义就是"所有 X 都一样"）
   → 整组原样搬进 shared.ts（一个字都不改）→ 零特异性风险。例：⑰ 收敛层的
     "所有卡片描边用 --pm-line"、㉑ 卡片语汇的"所有卡=白面+1px+8px+内边距"。

② 组件专属但当初为省事写成组的
   → 按组件拆开，每个副本**逐字保留原声明**，并把特异性补回原组最大值：
     · 组内各成员特异性本就相同（最常见：都是单类名）→ 直接拆，**天然等价**；
     · 组内特异性不齐（如混了 `.dsh-pm-comments > .dsh-pm-action-bar-label`）→ 用
       **同义重复属性选择器**补到原组最大值：PREFIX[data-report-shell][data-report-shell] .a
       （`data-report-shell` 是恒在场的常量属性，重复书写**恒真**：只抬特异性、不改语义）。
```

**为什么选重复属性而不是加一个自定义类**：不改 DOM（渲染层零改动、`data-*` 契约不动），
不引入只为特异性而存在的类名，且补的档数可机械算出（`max - sp(member)`）。

## 关键算法 2：拼接与回滚 `serves: FR-6`

```
REPORT_CSS =
  base.ts + tokens.ts + shared.ts(前段) + head.ts + band.ts + tabs.ts
  + panels/trunk.ts + docs.ts + dag.ts + dialogue.ts + verify.ts + token.ts + prompts.ts
  + shared.ts(后段：⑫–⑱ 宽选择器层，与原文件相对位置一致)
```

- **拼接 = 逆操作**：把各分片按上表顺序拼回单文件，产物**与改造前的 `report.ts` 逐字节相同**
  （`shasum -a 256` 一致）——这是 FR-6 的验收判据，也是"物理搬家"这一措辞的机械含义。
- 回滚 = 用拼接产物替换出口文件 + 删分片目录；三类判据（探针 / 用例 / 快照）全绿即等价。

## 依赖关系 `serves: FR-2, FR-4`

```
report.ts(出口) ──imports──▶ report/*（分片，纯字符串常量，无相互 import）
report-tabs.ts ──imports──▶ panels/*（面板实现）＋ REPORT_TABS（注册表，单点真相）
api.ts(取数) ──推导──▶ REPORT_TABS 的 endpoint 名（不再手写第二份清单）
```

**纪律**：分片之间**不互相 import**（纯常量拼接，顺序由出口决定）；面板契约的类型定义只放
`report-tabs.ts` 一处（api.ts 只读它，不反向定义）。

## 目录结构 `serves: FR-1`

```
src/client/styles/
  report.ts                  ← 出口（名字与导出不变）
  report/
    tokens.ts  base.ts  shared.ts
    head.ts    band.ts   tabs.ts
    panels/{trunk,docs,dag,dialogue,verify,token,prompts}.ts
```

## 关键决策与取舍 `serves: FR-2, FR-6`

| 取舍 | 选项 | 裁定 | 理由 |
|---|---|---|---|
| 出口形态 | 目录 `report/index.ts` vs 文件保留为出口 | **文件保留** | 目录会改所有 import 路径；本需求不接受对外名字变化（FR-6） |
| 组规则 | 全部拆到组件 vs 二分（同口径留 shared） | **二分** | "处处相同的口径"本就属于公共层；拆它只会把同一句话抄 N 份并制造特异性风险 |
| 特异性 | 拆组后用 `:where()` 抹平 vs 补回原值 | **补回原值** | `:where()` 归零会改变与其他规则的胜负关系，等于改外观 |
| 验证 | 只比 CSS 文本 vs 比计算样式 | **比计算样式 + 几何** | 文本相同不保证级联结果相同（顺序/特异性）；快照才是"外观"本身 |

## 技术方案与亮点 `serves: FR-3, FR-5`

- **门禁用"外观"当判据而不是"源码"**：快照采集的是浏览器算出来的样式与几何，因此它对
  "谁盖谁"的推理免疫——人（或 agent）不需要读懂层序，判据自己会点名。
- **反向验证写进验收**：门禁必须能"故意违规时红"，否则它只是装饰（见 test-cases）。
