# REQ-261001101739-25c6 数据模型 · 样式表归属账本 `serves: FR-1, FR-2, FR-3`

> 本需求**不新增/不修改任何业务数据字段**：没有台账字段、没有 HTTP 出入参、没有持久化。
> 唯一「数据模型」是浏览器 DOM 里那张样式表的**属性契约**，以及宿主侧对它的**归属账本**。

## D-1 · 样式表属性契约（本次唯一改动的数据结构）`serves: FR-1, FR-2`

| 属性 | 类型 | 必填 | 取值 | 写入者 | 语义 |
|---|---|---|---|---|---|
| `data-plugin` | string | **是（本次新增）** | `"dsh-pmboard"` | 本插件建表时 / 归属纠正时 | 归属章：宿主按此值登记与删除本表 |
| `data-plugin-css` | string | 是（既有） | `"dsh-pmboard/styles.css"` | 本插件建表时 | 表身份：本插件用它判断「表是否已在」 |
| `textContent` | string | 是 | 全部 CSS 分片拼接（≈123 KB / 997 条规则） | 本插件建表时 | 样式本体；本需求**不改内容** |

**不变量（可断言）**：

| 编号 | 不变量 | 检查 |
|---|---|---|
| D-INV-1 | 文档中 `style[data-plugin-css="dsh-pmboard/styles.css"]` 数量恒为 1 | `document.querySelectorAll(...).length === 1` |
| D-INV-2 | 该表 `data-plugin === "dsh-pmboard"` | 属性断言（修复前为 `null`） |
| D-INV-3 | 该表 `textContent.length` 在本需求前后一致（123466） | 长度断言（证明 CSS 未被改动） |

## D-2 · 宿主侧归属账本（只读事实，本插件不写）`serves: FR-1, FR-3`

| 账本 | 位置 | 键 | 值 | 本插件的关系 |
|---|---|---|---|---|
| 模块记录 owned 样式 | 宿主 `ClientModuleRecord.styles` | 模块 id（= 包名 `dsh-pmboard`） | `data-plugin-css` 值数组（无该属性时回落 `data-plugin` 值） | 工厂执行期注入 → 本表被登记；替换时宿主据此删除 |
| DOM 归属标记 | `<style data-plugin>` | 插件 id | 元素集合 | `claimStyles` 写、`removeOwnedStyles` 读 |

账本生命周期（本次修复的着力点）：

```
materialize(本插件)
  └─ factory()  ← 此刻注入 → 本表带 data-plugin
  └─ claimStyles('dsh-pmboard') → owned = ['dsh-pmboard/styles.css']

replace(本插件)
  └─ removeOwnedStyles('dsh-pmboard') → 删除本表（正确、且必要）
  └─ modules.import(本插件) → factory 重跑 → 重新注入（≈5ms）
  └─ entry.refresh() → apply() → injectStyles() 幂等命中

materialize(别的插件)
  └─ claimStyles(别的插件) → 跳过本表（已有 data-plugin）→ 本表不进它的 owned

replace(别的插件)
  └─ removeOwnedStyles(别的插件) → 与本表无关
```

## D-3 · 无变更声明（明确不做）`serves: FR-2`

| 对象 | 本次是否变更 |
|---|---|
| 需求/任务台账字段（`RequirementRecord` / `TaskRecord`） | 否 |
| `/dashboard/api/reqboard/**` 出入参 | 否 |
| 流程图节点模型（`buildFlowChartModel` 的七节点 / 四态 / token / 计数） | 否 |
| CSS 规则与 `@container` 档位阈值 | 否（证据：D-INV-3 的文本长度不变） |
| 槽位注册（名称 / id / order / inject） | 否 |

结论：**无迁移脚本、无数据回填、无版本兼容开关**；兼容性只在 DOM 层（旧无主表被归属纠正接管），
见 `architecture.md` 的「兼容与迁移」。
