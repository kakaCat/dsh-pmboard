# t-ea5c7e 门禁 how 指路改指 reqboard_ask_confirm·复核

> 需求：REQ-261007135258-331a 确认通道接线收敛：四条通道统一走「落章 + 推进 + 收尾」单点

## 在做什么
门禁 how 指路改指 reqboard_ask_confirm·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007135258-331a/design/` 逐条核对；`npx vitest run tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T06:05:02.255Z，窗口 session-f22c57a8-ab6f-4822-806f-7f852cf43e7e）

复核段：指路不再指向人工门命令。

### 完成项

- grep -rn "reqboard_move(requirement_id" 两个源文件 ⇒ 空输出
- how 文案含 reqboard_ask_confirm（用例断言）

### 改动文件

- `tests/stage-gate-timeline.test.ts`

---
