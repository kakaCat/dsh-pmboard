---
req_id: REQ-261003204143-3219
serves: FR-1, FR-2, FR-3
---

# 架构设计（REQ-261003204143-3219）

> 轻档 bug 的最小架构说明；完整推理见同目录 design.md（已确认）。

## 目标与总体方案 `serves: FR-1, FR-3`

**问题**：`reqboard_capture` 输出 schema 的 `answers` 嵌套声明（4 键）与用例回执（5 键）漂移，
绑定层 `additionalProperties:false` 校验把每份回执整体拒收——弹框立项必炸。

**设计方案**：不改校验行为（它是对的），把 `answers` 键清单收敛为一处共享常量
`CAPTURE_ANSWER_KEYS`（capture-mapping.ts），三处同源：类型派生（tsc 守）→
schema 生成（CaptureTool 不再手写五键）→ 契约用例键集断言（运行时守）。

**不这么做的后果**：只补声明不改机制 = 下次加第六问时同样的漂移再炸一次（本次就是这么炸的）。

## 模块改动地图 `serves: FR-3`

```
 capture-mapping.ts ──导出──▶ CAPTURE_ANSWER_KEYS（单一事实源，新增）
       │                            │
       │ CaptureMapping.answers     ├─▶ CaptureTool.ts：answers.properties
       │ 类型由其派生（tsc 守）      │    由常量生成（不再手写）
       │                            │
       ▼                            ▼
 mapCaptureAnswers 产出键      output.schema 声明键
       └──────┬─────────────────────┘
              ▼
 tests/capture-output-contract.test.ts 键集断言（运行时守，新增）
```

**改动清单**：修改 2 个源文件 + 新增 1 个测试文件；无删除、无新依赖、无新接口面。

## 依赖与边界 `serves: FR-1`

- 复用 dsh-tools 导出的 `validateJsonSchemaValue`（绑定层同款校验器），不引新包。
- 不碰 SubmitTool / RESPONSE_SOURCES / 五问逻辑（并行窗口 REQ-261003204149-1e80 在制）。
