---
doc: design/use-cases
req: REQ-261007223647-da5d
serves: FR-1, FR-2, FR-3, FR-5, FR-6
---

# 用例流程（REQ-261007223647-da5d · 轻档）

## UC-1 立项（推荐路径，一键过） · serves: FR-3

agent 调 capture（带 title_options+reason）→ 第一段弹框：题干带理由、推荐候选置首（宿主已预选）
→ 人选「⚡ 全部按推荐值立项」→ 用例短路后 3 问、全记 defaults_used → 创建绑定推进。
变异：人选 ✖️（末位）→ 记 reject（到达即写）→ 30min 不弹；人取消 → 记 cancel + 回执带替代路径。

## UC-2 立项（细调路径） · serves: FR-3

第一段选候选/自定义名称 → 第二段 3 问（类型 / 算力档位 / 文件落点）→ 落点选项直接显示绝对路径预览
→ IF-2 拆分（workspaceRoot, docBasePath）→ 创建；自定义绝对路径不存在 → REQBOARD_INVALID_WORKSPACE。

## UC-3 确认票超时自愈 · serves: FR-1, FR-5

ask_confirm/submit 自动门走 askTimed（预算−2s）→ 人未在窗口内答 → 工具返回 pending+ticket
（不抛 interrupted）→ 票进 /state 投影 → 人看板首屏见票（剩余时间）→「去作答」落章 或
「重投弹框」redispatch；agent 侧凭 ticket 调 confirm_receipt 取回执。

## UC-4 连续取消引导 · serves: FR-2

同窗口 30min 内第 3 次取消 → capture 不再弹框，回执：「已连续取消 3 次，建议走看板立项
（/dashboard#pmboard）或文字直接给出四值」；留痕 kind=cancel 逐条可查。

## UC-5 文档打开 · serves: FR-6

点面板「📂 文档位置」/文档行 → absolutizeDocPath 三级回落（记录 rootSource）→ 打开落盘地址；
rootSource ≠ req-root → 面板红字「地址可能不准（根来源：X）」；复现 ./dsh 错地址时
诊断读数直接指出哪一级根拿错（R2 收口）。

## 失败路径汇总 · serves: FR-1, FR-2, FR-3

| 失败 | 行为 |
|---|---|
| 弹框通道不可用 | fallback=board 回执（现状不变），票仍落 registry |
| askTimed 越界 | REQBOARD_INVALID_INPUT（BAD_TIMEOUT 转译） |
| 留痕文件损坏 | 按无记录降级，不拦截（增强非门槛） |
| repost 未知/跨窗口 ticket | REQBOARD_UNKNOWN_TICKET（复用同码） |
