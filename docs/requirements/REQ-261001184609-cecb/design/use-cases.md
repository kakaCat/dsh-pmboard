---
req: REQ-261001184609-cecb
doc: use-cases
serves: FR-1, FR-2, FR-3
---

# 用例

## UC-1 agent 落结果，人只点通过（serves: FR-1, FR-2）

前置：任务卡全部完成，agent 已跑过验证命令。
步骤：① agent 调 submit(kind=verification, evidence=["t-abc :: npx vitest run x → 6 passed"])；
② 人打开验收单；③ 对该项点“通过”（不输入任何文本）。
期望：该项 result 来自 agent，status=passed，opinion=该 result。

## UC-2 无法自动验证的项（serves: FR-3）

前置：某项需看界面视觉。
步骤：① 该项标记 needsHuman + humanReason；② 人在弹框里看到“需人工确认：界面视觉”并填写所见。
期望：该两项单独可辨，不被误当普通项；人填的内容进 result（resultSource='human'）。

## UC-3 反例：agent 没跑就想通过（serves: FR-2）

步骤：某可自动验证项无 result，人直接点“通过”。
期望：status=unverified（不冒充通过），并在看板标为待复核。
