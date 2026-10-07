---
serves: [FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 接口设计（REQ-261007133149-0716）

> 本需求的"接口"有三类：① 面板契约（客户端类型面）② 两条门禁脚本的 CLI 契约 ③ 不许变的既有
> 契约（DOM `data-*` 与取数请求）。三类都必须"能用一段话讲清输入输出"，否则边界没切好。

## 接口清单 `serves: FR-4, FR-5`

| 接口 id | 接口 | 形态 | 输入 | 输出 | 错误语义 |
|---|---|---|---|---|---|
| IF-1 | `Panel` 契约 | TS 接口（`report-tabs.ts`） | 载荷（`unknown`，面板自守卫） | HTML 字符串 | 不抛：载荷不认识时出「三态说辞」而不是白屏 |
| IF-2 | `REPORT_TABS` 注册表 | 常量数组（单点真相） | — | `Panel[]`（顺序即展示顺序） | 键重复 / 顺序漂移 → 契约用例红 |
| IF-3 | `ReportTabKey` | 类型（**推导**） | — | `REPORT_TABS` 的键联合 | 删掉手写联合这份第二真相 |
| IF-4 | 取数端点名 | 类型（**推导**） | — | 同一份键联合 | api.ts 不再手写第二份清单 |
| IF-5 | `report-style-snapshot.mts` | CLI | `--check` / `--write`、可选 `--width/--state` | 逐组件「键数 / 不同键数」报告 | 退出码 1 = 有差异（点名组件与属性） |
| IF-6 | `report-style-ownership.mts` | CLI | 无参（读分片目录 + 清单） | 越界条目清单 | 退出码 1 = 组件选择器出现在别的分片 |

## IF-1 新增的接口一：`Panel` 契约（类型钉住） `serves: FR-4`

```ts
/** 一个 Tab 面板：注册即装配，实现它就算接上壳（漏任何必需成员 = 编译期红）。 */
export interface Panel {
  readonly key: ReportTabKey            // 展示键（也是取数端点名，单点）
  readonly label: string                // Tab 文案
  readonly icon: string                 // 内联 SVG（唯一图标源 icons.ts）
  badge(data: unknown): string | undefined   // 角标；无值不渲染，不许显示 0
  render(data: unknown, ctx: ReportTabCtx): string  // 纯字符串渲染（本仓既有纪律）
}
```

**推导要求**：

1. `REPORT_TABS: readonly Panel[]` 是**唯一清单**；`ReportTabKey = (typeof REPORT_TABS)[number]['key']`
   由它推导——手写的 `'trunk' | 'docs' | …` 联合删除。
2. 取数端点名与 `ReportTabKey` **同源**（api.ts 从注册表读，不另写一份）。
3. **未知键行为不变**：`isReportTabKey` 守卫与"不静默回落"语义逐字保留（本次只收敛类型与清单，
   不改运行时判定）——契约用例把它钉住。

**错误语义**：面板 `render` 收到不认识的载荷时**不抛**，按既有三态（未接线 / 文件缺失 /
读不到）出人话占位；这条是既有行为，本需求不得回退（探针 A13 与既有用例守着）。

## IF-5 新增的接口二：外观快照脚本（FR-3 判据） `serves: FR-3, FR-5`

```
npx tsx scripts/report-style-snapshot.mts --check   # 与基线比对，退出码 0/1
npx tsx scripts/report-style-snapshot.mts --write   # 写/更新基线（改外观时必须显式跑）
```

| 维度 | 口径 |
|---|---|
| 采样对象 | 10 个组件的 DOM 根及其子树（按组件分组，逐组件出读数） |
| 采样内容 | ① 计算样式：外观可判属性（`color/background-color/border*/padding/margin/gap/font-*/line-height/letter-spacing/border-radius/box-shadow/opacity/display/position/overflow/white-space`）② 几何：`getBoundingClientRect()` 宽高与相对父盒的偏移（取整） |
| 采样条件 | 七个面板 × `{1280, 900}` × `{inflight, terminal}` + 首屏四段（head/band/tabs/comments）；固定 `--force-device-scale-factor=1`、固定 Chrome 版本 |
| 输出 | 每组件一行：`键数 / 不同键数`；差异逐条给 `组件 · 选择器 · 属性 · 基线值 → 现值` |
| 退出码 | `0` = 全等；`1` = 有差异（**点名到组件与属性**）；`2` = 环境不可用（找不到 Chrome） |
| 缺失态 | 某组件在某条件不存在 → 记 `absent`（**不是**"无差异"）；`absent` 在基线里也要显式存在 |

**纪律**：脚本里放阈值与口径，分片里不放；跨浏览器版本的读数差异必须**显式登记**，
不许放宽比对（例：某属性在新版 Chrome 序列化形式变化 → 归一化规则写进脚本并说明）。

## IF-6 新增的接口三：分片归属门禁（FR-5 判据） `serves: FR-2, FR-5`

```
npx tsx scripts/report-style-ownership.mts   # 退出码 0/1
```

**输入**：`src/client/styles/report/*` 全部分片 + 一份**归属清单**（组件 ↔ 选择器前缀 ↔ 分片文件）。
**判定**：

1. 每条规则的**主选择器**（去掉前缀后）必须属于它所在分片的组件集合；
2. `shared.ts` 只允许两类内容：① 宽选择器（岛级：以 `.dsh-pm-detail[data-report-shell]` 直接起头、
   匹配任意后代的规则）② **口径处处相同**的成组规则（组内声明逐字相同）；
3. 公共件（按钮 / 提示文字 / 芯片等跨组件件）走**逐条带理由**的白名单（写在脚本里，不是分片里）。

**输出**：越界清单，每条含 `分片 · 选择器 · 判定依据（它属于哪个组件）`；退出码 1 = 有越界。

## 删除的接口 `serves: FR-4`

| 删除项 | 位置 | 替代 |
|---|---|---|
| 手写的 `ReportTabKey` 联合 | `report-tabs.ts` 的类型声明 | `(typeof REPORT_TABS)[number]['key']` 推导 |
| 手写的取数端点名清单 | `api.ts` 的 `endpoint` 联合 | 同一份推导（同源） |

## 不许变的既有契约（本次只读不写） `serves: FR-6`

| 契约 | 内容 | 为什么不动 |
|---|---|---|
| DOM 标记 | `data-report-shell` / `data-report-seg="head|band|tabs|panel"` / `data-panel="<key>"` / `data-dag-tab` / `data-comment-*` / `data-rtm-*` 等 | 壳、面板、探针、用例全靠它取值；改名 = 静默失联（维护指南纪律 1） |
| 取数请求 | URL 形状、`before/limit` 参数、响应形状、缓存键语义 | FR-6 明令不改；本需求只收敛"清单"这份重复 |
| 事件通道 | `data-action="switch-tab" / "submit-verdicts" / "open-doc"` 等 | 写路径属既有能力，不得回退 |
| `REPORT_CSS` | 导出名与"一份拼接产物"的形态 | 消费方（styles.ts 注入、verify-client 的样式归属章校验）不动 |

## 关键决策与取舍 `serves: FR-4, FR-5`

| 取舍 | 候选 | 裁定 | 理由 |
|---|---|---|---|
| 契约强度 | 运行时断言 vs 类型钉住 | **类型钉住 + 一条契约用例** | 类型在编译期就红，比运行时便宜；用例补类型表达不了的（键唯一、顺序即展示序） |
| 端点推导 | 复制键联合到 api.ts vs 同源推导 | **同源推导** | 手写第二份清单正是"加 Tab 漏改一处"的根因 |
| 门禁实现 | ESLint 规则 vs 独立脚本 | **独立脚本** | 本仓既有惯例（脚本 + 退出码 + 反向验证），且不引入 lint 依赖 |
| 白名单 | 宽泛豁免整类 vs 逐条带理由 | **逐条** | 宽泛豁免 = 把这条判据关掉（本仓既有纪律） |

## 技术方案与亮点 `serves: FR-3, FR-5`

- **判据用"外观"而不是"源码"**：快照对"谁盖谁"免疫，agent 不必读懂层序。
- **两条门禁都能反向验证**：故意违规必须红（见 test-cases 的 TC-5 / TC-6），避免恒绿装饰。
