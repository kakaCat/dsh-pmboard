# 用例与交互路径 · REQ-261006092213-4f5b <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8 -->

> 六个用例覆盖：正常闭环、硬门拒绝、人看例外、零输入裁决、反例底线、兼容回滚。
> 每个用例给出**可观察结果**（能跑出证据的形态），不写"应该正确"这类空话。

## UC-1 agent 逐项实测并提交（正常路径） <!-- serves: FR-1 -->

- **角色**：实施 agent。
- **前置**：需求在 implementing；活卡中有顶层父卡；需求声明 sides 含 frontend 且原型已登记。
- **主流程**：
  1. agent 逐项跑验收依据（任务卡 `acceptance` 里写着的那条命令）。
  2. 调 `reqboard_submit(kind=verification, summary, evidence, results=[…])`。
  3. 系统算出可预见项集合 → 硬门通过 → 组装验收单并把结果写进对应项。
- **可观察结果**：
  - 每项 `result` 非空、`resultSource === 'agent'`；返回体 `results_coverage === 'complete'`。
  - 需求进入 accepting；`verification.md` 的「实际结果」列显示命令与输出摘要。
- **异常**：任一环节失败 → 按 UC-2 / UC-6 的分支处理。

## UC-2 漏项 / 坏引用 → 拒绝并点名（硬门） <!-- serves: FR-2 -->

- **角色**：实施 agent（被门禁拦下）。
- **主流程**：
  1. agent 少给一项（或 ref 指向不存在的任务 / 重复 ref / 既无 result 又无 needsHuman+理由）。
  2. 系统在校验阶段拒绝，**不写台账**（半成品不进验收单）。
- **可观察结果**：
  - 返回错误码与点名清单，形如：`缺 1 项未交代：task:t-7c41a9；补 result 或 needsHuman+humanReason`。
  - 台账 `verification` 未变（无新版本验收单）。
- **边界**：系统项不在点名范围（提交时才生成）。

## UC-3 无法自动验证的项（唯一要人填的分支） <!-- serves: FR-5 -->

- **角色**：实施 agent 声明 + 验收的人填写。
- **主流程**：
  1. agent 在 `results` 里给该项 `needsHuman:true` + `humanReason`（如「界面视觉需人对照权威原型」）。
  2. 系统落 `needsHuman` / `humanReason`，不要求 `result`。
  3. 弹框对该项保留第 2 问，题干含理由；看板该行带旗标。
- **可观察结果**：验收单该项 `needsHuman === true` 且理由非空；题干/界面能看到理由。
- **边界**：原型对照项由代码自动标（`prototype-compare`），agent 不标也算；其余项**无理由即拒**。

## UC-4 人零输入裁决 <!-- serves: FR-3, FR-4 -->

- **角色**：验收的人。
- **主流程**：
  1. 会话弹框：有结果的项只出现 1 问 → 选「通过」；或看板：勾「通过」直接提交（输入框留空）。
  2. 系统记 `passed`，`opinion` 取该项 `result`（留痕：谁都没打字，但结果有出处）。
- **可观察结果**：
  - 该项 `status === 'passed'`、`opinion` 等于 `result`、`decidedBy.kind === 'human'`。
  - 看板不再出现「通过必填实际结果」的拦截提示。
- **异常**：人改了输入框内容 → 记 `resultSource='human'` 且 `result` 更新为人的文本。

## UC-5 反例：没有结果就点通过 <!-- serves: FR-6 -->

- **角色**：验收的人（手滑或草率通过）。
- **前置**：该项无 `result`（如系统项、或老写法提交的项）。
- **主流程**：人点「通过」且不填任何文本。
- **可观察结果**：
  - 该项记 `unverified`（**不是** passed），台账可查。
  - 「全部通过 → 归档」确认**不弹出**；`reqboard_move(to=archived)` 亦不放行。
- **为什么留这个用例**：这是底线的守卫——去掉 `evidence[0]` 兜底后它才重新可测（此前恒不可达）。

## UC-6 老写法与回滚 <!-- serves: FR-8 -->

- **角色**：老调用方 / 维护者。
- **主流程**：
  1. 不带 `results` 调用 `reqboard_submit(kind=verification)`。
  2. 提交成功，返回体 `results_coverage === 'legacy'`；项无 `result`。
  3. 人裁决时按 UC-5 口径（填则 passed，留空则 unverified）。
  4. 维护者置 `DSH_REQBOARD_NO_ITEM_RESULT=1` → 回到今天行为（结构化绑定关闭 + `evidence[0]` 兜底恢复）。
- **可观察结果**：同一份材料在开关开/关两种口径下，裁决结果分别符合新旧语义，且**都不报错**。
- **边界**：存量在册验收单不被回写。
