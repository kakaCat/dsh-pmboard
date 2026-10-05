---
req_id: REQ-261003204143-3219
serves: FR-1, FR-3
---

# 接口设计（REQ-261003204143-3219）

> 本需求不改工具签名；接口变化只有一处：**输出 schema 的 answers 补声明 workspace**。

## 工具接口：reqboard_capture `serves: FR-1`

| 面 | 前 | 后 |
|---|---|---|
| 入参 | title_options / summary / reason | **不变** |
| 回执 answers 键 | 实发 5 键 / 声明 4 键（漂移） | 实发 5 键 / 声明 5 键（同源生成） |
| 校验结果 | 每份回执被绑定层拒收 | 通过（违例数 = 0） |

**调用方影响**：无破坏性变更——回执字段一个没少，只是声明终于如实。
此前因回执被拒收而拿不到 `requirement_id`/`board_link` 的调用方（agent）恢复可见。

## 模块间接口 `serves: FR-3`

新增导出（capture-mapping.ts）：`CAPTURE_ANSWER_KEYS`（常量）、`CaptureAnswerKey`（类型）。
消费方：CaptureTool.ts（生成 schema）、tests/capture-output-contract.test.ts（键集断言）。
无其它消费方；不导出即私有，无兼容性承诺负担。
