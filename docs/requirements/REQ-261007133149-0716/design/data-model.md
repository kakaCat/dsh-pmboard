---
serves: [FR-1, FR-2, FR-3, FR-5]
---

# 数据模型设计（REQ-261007133149-0716）

> 本需求是客户端结构改造，**不新增/变更任何业务数据字段**（台账、RTM、取数响应一律不动）。
> 这里定义的是三份**结构化工件**——它们就是本需求真正的"数据"，也是门禁读的东西。

## 新增/修改的数据结构 `serves: FR-1, FR-2`

### 组件归属清单 `component-manifest` `serves: FR-1, FR-2`

来源：原型 [anatomy.html](../prototypes/anatomy.html) 的 10 张组件卡（人读版）；
机器版落 `src/client/styles/report/manifest.ts`（**唯一真相**，门禁与文档都读它）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `'head' \| 'band' \| 'tabs' \| 'trunk' \| 'docs' \| 'dag' \| 'dialogue' \| 'verify' \| 'token' \| 'prompts'` | 是 | 组件标识（= 分片名；面板组件与 `Panel.key` 一致） |
| `root` | `string` | 是 | DOM 根选择器（照抄现有 `data-*` / 类名，**不新造**） |
| `shard` | `string` | 是 | 分片文件（工作区相对） |
| `prefixes` | `string[]` | 是 | 该组件拥有的选择器前缀集合（归属门禁用它判"越界"） |
| `serves` | `string[]` | 是 | 服务条款（`FR-1`…`FR-6`） |
| `dependsOn` | `string[]` | 否 | 依赖的公共层 / 端点（人读用） |

**约束**：`id` 唯一；`root` 必须在真实渲染里 `querySelector` 命中 ≥1（FR-1 判据 ②）；
`shard` 与 `id` 一一对应（`panels/*` 用同目录命名）。

### 外观快照基线 `style-snapshot` `serves: FR-3, FR-5`

落 `docs/requirements/REQ-261007133149-0716/evidence/style-snapshot.json`（基线）+ 脚本产出的
diff 报告。**是"当前外观的事实"，改外观必须显式更新**。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schema` | `1` | 是 | 基线格式版本（只增不改；新版本另起文件） |
| `env` | `{ chrome: string; dsf: number; viewport: {width:number;height:number} }` | 是 | 采集环境（跨版本差异必须显式登记，不许放宽） |
| `cases` | `{ key: string; panel: string; width: 1280\|900; state: 'inflight'\|'terminal' }[]` | 是 | 采样条件集合 |
| `entries` | `Entry[]` | 是 | 逐组件读数 |

`Entry`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `component` | 组件 id | 归属组件（门禁可按组件点名） |
| `selector` | `string` | 采样选择器（组件根或其后代） |
| `path` | `string` | 结构路径（`tag:nth-child` 串），保证跨条件稳定可比 |
| `props` | `Record<string, string>` | 归一化后的计算样式读数（键 = CSS 属性名） |
| `box` | `{ w: number; h: number; dx: number; dy: number }` | 几何（取整；`dx/dy` = 相对父盒） |
| `absent` | `true` | 该条件下该元素不存在（显式缺失；**不是**"无差异"，也不是 0 补齐） |

**兼容性**：只增键；读数缺失写 `absent` 而不是补 0（本仓"不拿 0 冒充未知"的既有纪律）。

### 公共件白名单 `ownership-whitelist` `serves: FR-2, FR-5`

落 `scripts/report-style-ownership.mts` 内的常量数组（判据与阈值只放门禁脚本）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `selector` | `string` | 是 | 被判为"跨组件公共件"的选择器 |
| `why` | `string` | 是 | **逐条理由**（宽泛豁免一律不接受） |
| `owner` | `'shared' \| <组件 id>` | 是 | 它归谁（`shared` = 公共层） |

## 关键决策与取舍 `serves: FR-1, FR-3`

| 取舍 | 候选 | 裁定 | 理由 |
|---|---|---|---|
| 组件清单放哪 | 文档里手写 vs 代码常量 | **代码常量 `manifest.ts`** | 文档会漂移；门禁与文档都读同一份常量，文档由它生成核对 |
| 快照基线格式 | 逐元素全量 DOM 快照 vs 归一化读数 | **归一化读数** | 全量 DOM 快照对无关变动（注释/属性顺序）敏感，会变成噪音门禁 |
| 缺失态 | 补默认值 vs `absent` | **`absent`** | 补 0/默认值会把"没采到"伪装成"没变化"，正是 FR-3 边界条件禁止的 |
| 白名单位置 | 分片内注释 vs 门禁脚本常量 | **门禁脚本** | 判据与阈值只放门禁（interfaces 的纪律） |

## 技术方案与亮点 `serves: FR-2, FR-5`

- 三份工件都**机器可读**：清单驱动归属判定，快照驱动外观判定，白名单驱动豁免——
  三者都不依赖"人记得住"，这正是本需求要买的"agent 少犯错"。
- 快照的 `component` 字段让门禁的红可以**点名到组件**（而不是只报"有差异"）。
