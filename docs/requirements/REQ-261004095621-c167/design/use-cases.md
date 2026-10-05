---
requirement_refs: [FR-1, FR-2, FR-3]
---

# 用例文档（REQ-261004095621-c167） <!-- serves: FR-1, FR-3 -->

## UC-1：点一下模型控件，控件就没了（现状主流程） `serves: FR-1`

- **角色**：GUI 使用者（要在会话里换模型）。
- **前置**：桌面端任意会话，编辑器工具栏显示模型控件。
- **主流程**：① 用户点模型控件 → ② 菜单开始渲染（按 provider 分组） → ③ 分组组件类型为 `undefined` → ④ React 抛 `#130`。
- **后置**：DSH 插槽把该席位**退役**，`conversation.input.model` 的 `occupants[0].active` 变 `false`，
  工具栏那一格变空白且不再恢复（刷新页面才回来）。
- **异常流**：菜单里选模型失败（`session/writer-held`）→ 走 Toast 提示，与本缺陷无关。
- **观察项**：控件空白 + 控制台一行 `slot entry crashed in 'conversation.input.model'`。

## UC-2：三步取证，判定归属 `serves: FR-1`

- **主流程**：① `Slots.listSubTree` 看 `active`/`registrant` → ② 控制台取崩溃原文与堆栈 →
  ③ `npm pack` 对标 app.asar 内同名文件的符号。
- **判据**：`registrant` 不是本仓 + 符号缺失 → 归属 DSH 安装；`registrant` 是本仓 → 归属本仓并转 FR-4 审计。
- **异常流**：拿不到控制台 → 按 `design/interfaces.md` 附录的契约评估是否重开 FR-2（本期不做）。
- **产出**：`evidence/dsh-model-seat-crash.md`（含可复核命令）。

## UC-3：重装客户端后验证恢复 `serves: FR-3`

- **前置**：用户已重装/更新 DeepSeek Harness（primitives 与 model-selection 同源）。
- **主流程**：① 打开会话 → ② 点模型控件 3 次 → ③ 每次复查 `occupants[0].active`。
- **后置**：`active` 恒 `true`，菜单能正常展开与选择 → 判定标准 1 达成。
- **异常流**：仍 `false` → 见 UC-4。

## UC-4：重装后仍崩（例外流） `serves: FR-3`

- **主流程**：① 取第二次崩溃原文 → ② 用同一方法（提取 app.asar → 与发布版逐符号对标）再查 →
  ③ 报告追加证据与新发现（可能是第二个缺失 API）→ ④ 再给修复/规避建议。
- **替代路径**：用户暂时无法重装 → 长期用 `/model` 命令换模型（报告 §5 已给）。
- **红线**：任何情况下都**不**用本仓注册项顶替该席位（遮蔽真因、责任错位、不随版本存活）。
