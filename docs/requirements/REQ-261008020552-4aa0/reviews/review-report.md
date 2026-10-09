# 评审报告（REQ-261008020552-4aa0）

> 评审对象：五个回滚单元 U1~U5（对应五张卡）。每单元走「研发 → 联调 → 复核 → 测试」子卡链，
> 复核结论逐卡落账在 `tasks/<id>.md`；本报告汇总口径与结论。

## 一、评审口径 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 维度 | 判据 |
|------|------|
| 行为等价（refactor 类型档） | 既有行为测试原样绿（除 D-3 申报点与基线登记红外）；`git diff` 逐行核对只含描述/注释/申报面 |
| 形状零变化 | 参数键名/类型/必填/枚举/`additionalProperties`/返回体/错误码逐字不动（门禁形状不变式钉住） |
| 减负双向 | 没减够（字符上限）+ 减过头（细则之家逐条调真实函数取 message）|
| 装配面一致 | I-1~I-3 不变量（目录 / 注册名 / 工厂扫描）与 README/package.json 口径一致 |
| 边界 | 不夹带别窗口在飞改动、不触碰用例判定/状态机/台账/HTTP/client |

## 二、逐单元结论 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 单元 | 卡 | 复核结论 | 关键证据 |
|------|----|---------|---------|
| U1 archive_amend 收编 | t-5ae432 | **无偏离** | `AmendArchiveManifest` diff 仅 D-3 的 8 处前缀 + 1 处头注释；op=archive 返回键集 = 原工具 + op；守卫分流覆盖（archive 保留前置） |
| U2 note_interruption 收编 | t-aa5503 | **无偏离** | `NoteInterruption` diff 仅 D-3 的 3 处前缀 + tool 字面量 + 注释；守卫按 op 分流有专门行为测试；`protocol.ts` 同文件其余 diff 经内容辨认为别窗口在飞工作（G10 双拼单源化等，非本批） |
| U3 task_move 减负 | t-6b550f | **无偏离** | diff 仅描述字符串 + 1 处未用导入摘除；591 ≤ 630；行为锁 100 测试 |
| U4 submit 减负 | t-9f79be | **无偏离**（一处之家位置 refined 已申报） | diff 仅描述压缩 + 两处回执纯追加；footprint 三量口径落 `FootprintError`（形状拒绝回执）而非软门 warnings——理由：软门只在 files 超阈值/多锚点时触发，写错三量时最先看到的是形状拒绝；files floor 口径原本就在 `assertFootprintFloor` |
| U5 同步面收尾 | t-0f675d | **无偏离** | 旧名零命中；19 口径四处文档一致；变更历史行 + front-matter 补记；三项非本批债务登记交还 |

## 三、发现与处置 <!-- serves: FR-2, FR-5 -->

| # | 发现 | 处置 |
|---|------|------|
| R-1 | 收编直面无前置差异：`NoteInterruptionTool` 没有 `assertNoPendingConfirm`，而 task_amend 壳对所有 op 统一前置——直接合并会静默改变行为 | design §3.2 定死「按 op 分流」并加专门行为测试（TC-5） |
| R-2 | 阶段越界提示表按工具名判定，task_amend 被限在 implementing/accepting——归档态调 op=archive 会被误注纠偏 | design §3.4 定死 `TASK_AMEND_OP_STAGES` op 化（archive/interruption 全阶段） |
| R-3 | `README/package.json` 计数与 README 三处口径受 `readme-tool-face` 机械锁——计数必须随收编卡同步，不能留到 U5 | U1/U2 各自同步计数（21→20→19），U5 复核确认 |
| R-4 | 消息卫生棘轮按层计数，回执追加一个 `+` 即计数上升 | U4 把追加句折进既有模板串（application 533 持平）；Footprint 改 `fmt` 使 domain 计数反降 |
| R-5 | `interruption-checkpoint` 3 条红看似本批引入 | 取证：属基线登记红（`test-baseline.failures.txt:30-32`，MoveRequirement checkpoint 面，别窗口在飞需求改动所致），与本批零交集 |

## 四、遗留（交还） <!-- serves: FR-5 -->

三项非本批债务与两项有意不做（`dist/` 未重建、未 git commit）见 [notes/known-debt.md](../notes/known-debt.md)。
