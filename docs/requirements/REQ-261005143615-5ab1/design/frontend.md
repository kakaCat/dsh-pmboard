# 设计 · 客户端（REQ-261005143615-5ab1） `serves: FR-3, FR-4`

## 呈现项（路径格） `serves: FR-4`

| 数据 | 显示 | 打开 |
|---|---|---|
| 有 `absPath` | **绝对路径**为主（用户要的口径）；其下小字给台账相对路径（`data-doc-relpath`）供对账 | `data-open-doc = absPath`（`openDocInSidebar` 已支持绝对路径） |
| 无 `absPath` + `file-missing` | 相对路径 + 划线 + 「文件缺失」 | 不可点（摘掉 `data-action`，维持既有假出口纪律） |
| 无 `absPath` + `unknown` | 相对路径 + 「未判定（读根不可得）」+ 提示该需求声明的工作区 | 不可点，但**不划线**（不是缺失，是判不了） |

## 文案与状态 `serves: FR-3`

- `stateText('unknown')` = 「未判定」；`stateNote('unknown')` = 「读根不可得：候选工作区在这台机器上都不存在，无法判断文件在不在」。
- 划线样式只挂在 `file-missing`（[docs.ts:263](../../../../../src/client/views/panels/docs.ts#L263) 现有内联
  `text-decoration` + `.dsh-pm-doc-missing` 双保险**保持不变**），`unknown` 行不得套用。
- 本面板不出现 `overflow: auto|scroll`（既有纪律），绝对路径超长按既有表格换行处理。

## 其他同源改动 `serves: FR-4`

- 「生成物」块（`generatedSection`）同样优先显示 `absPath`；
- 「其它发现」的样例路径是分组计数用的样例，本次不动（有 `absPath` 时后续可跟改，本设计不承诺）。

## 兼容 `serves: FR-4`

- 服务端不注入 `absPath`（旧服务端）→ 路径格逐字回旧显示；
- 服务端给 `unknown` 而客户端是旧版 → 由 `stateText` 未知值兜底渲染，不崩、不误报缺失。
