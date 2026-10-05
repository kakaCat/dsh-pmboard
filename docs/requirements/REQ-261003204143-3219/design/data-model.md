---
req_id: REQ-261003204143-3219
serves: FR-1, FR-3
---

# 数据模型（REQ-261003204143-3219）

> 本需求不改台账 schema、不改落盘格式；唯一"数据"是工具回执的 answers 对象形状。

## answers 回执形状 `serves: FR-1, FR-3`

| 键 | 类型 | 来源 | 说明 |
|---|---|---|---|
| title | string | 第 1 问 | 用户确认的需求名称 |
| category | string | 第 2 问 | 需求类型（非法回落默认并记 defaults_used） |
| difficulty | string | 第 3 问 | 提示词难度（同上） |
| docLocation | string | 第 4 问 | 文档位置 |
| workspace | string | 第 5 问 | 工作区作答原样（哨兵值或自定义绝对路径） |

**不变量**：回执 answers 键集 ≡ `CAPTURE_ANSWER_KEYS` ≡ 输出 schema 声明键集
（三方同源；由 tsc 类型派生 + 契约用例键集断言共同守护）。

## 存量兼容 `serves: FR-1`

回执是纯响应体、不落盘、无存量数据——无迁移、无兼容负担。
`additionalProperties:false` 语义不变（仍是漂移的告警器，不是被修对象）。
