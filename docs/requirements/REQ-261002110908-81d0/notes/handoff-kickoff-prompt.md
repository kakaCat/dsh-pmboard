# 交接：在新窗口重开一条需求把工作走完（可直接粘贴的开工指令）

> 背景：REQ-261002110908-81d0 死在 implementing / 0 卡死锁（取证见同目录 incident-autorun-deadlock.md）。
> 立项必须是「顶层窗口 + 直接人工回合 + 未绑定」，所以只能由人在 GUI 新开窗口发起；子会话做不到（REQBOARD_DIRECT_HUMAN_REQUIRED）。
> 用法：新开一个会话窗口 → 把下面代码块里的内容整段粘进去发送。

```text
接着做一条**重开**的需求（原需求 REQ-261002110908-81d0 死在死锁里，见文末证据）。请严格按下面执行，不要重写代码。

【第一步：立项】
用 reqboard_capture 立项（会弹三问）：名称候选按序——
1) 长文本工具参数写法约定：防整轮失败的入参约束
2) 工具参数非法 JSON 致整轮失败：写进描述与提示词的约定
3) 汇报文本引号转义治理：降低整轮报废概率
类型选 feature，难度 expert，文档位置用默认 docs/requirements/<REQ>/，工作区用当前会话空间（/Users/mac/Documents/ai/dsh/dsh-pmboard）。
立项后把新 REQ id 写进每一步的文件名里。

【已经做完的事——不要重做，直接复用】
代码改动已全部落地并自测通过（2026-10-02，窗口 session-be1bdc3d）：
- src/tools/shared.ts：新增 LONG_TEXT_ARG_NOTE（42 字，三锚点：每条短句≤60 字 / 需引号用「」/ 超长拆成多次调用）与 LONG_TEXT_FIELDS（15 条覆盖 8 个工具）
- src/tools/TaskReportTool/{prompt.ts,TaskReportTool.ts} 与 SubmitTool / AskConfirmTool / TaskMoveTool / CaptureTool / NoteInterruptionTool / AdoptTaskTool / RegenerateTool 共 8 个工具的长文本字段 description 接入该常量（**入参 schema 零变更**）
- src/domain/prompt/fragments/implementing/light/overrides.md（覆盖 4）与 heavy/overrides.md（覆盖 8）加「汇报自检」；按 C-16 重生成 src/domain/prompt/generated/fragments.ts（C-17 校验通过）
- tests/arg-guidance.test.ts 新增（TC-1/1b/2/4/5 共 10 条，含两条反向证伪）；tests/fixtures/stage-prompts-baseline-p1.json 按 scripts/dump-stage-prompts.mjs 刷新
- 全量回归：失败集合与基线逐一对齐（49 文件 / 98 用例），通过数 2991→3001；npx tsc --noEmit 197=197；pnpm build exit 0
证据与材料（**直接复用**，别重新摸索）：docs/requirements/REQ-261002110908-81d0/notes/ 下五份——
  incident-autorun-deadlock.md（事故取证）/ baseline-2026-10-02.md（开工基线）
  work-done-during-wedge.md（工作→卡片映射：哪张卡对应哪些文件与命令证据）
  proposed-fix-clear-pause.md（范围外的解锁补丁，**本条不做**）
  draft-bug-requirement-autorun-recovery.md（死锁的独立 bug 需求草案，**另立**，不在本条范围）

【本条要走的流程（各人工门我会在看板点确认）】
1. requirement.md：复用旧需求 requirement.md 的内容（3 条 FR：入参写法约定 / 同类工具共享覆盖 / 实施片段纪律），把 REQ id 换成新 id，加一行 provenance 说明来源；reqboard_submit(kind=requirement) → reqboard_ask_confirm(kind=requirement)
2. design/：复用旧 design/ 五份（architecture / data-model / interfaces / test-cases / use-cases），同样只换 id 与 provenance；reqboard_submit(kind=design) → reqboard_ask_confirm(kind=design)
3. decomposition.md：复用旧计划（5 张卡的 key/依赖/验收标准一字不改），并给每张卡的『接收任务』格只写裸计划键；reqboard_submit(kind=plan, tasks=[5 张]) → 请在看板批准计划
4. 落库：批准后自动落库；若没自动落，手动 reqboard_decompose()（新需求不会遇到旧那条的死锁）
5. 逐卡：reqboard_task_move(to=in_progress) → 按 work-done-during-wedge.md 把已完成的事实与命令证据写进完工记录（reqboard_task_report）→ reqboard_task_move(to=done)
6. reqboard_submit(kind=verification)：材料直接引 work-done-wedge 与 baseline 两份 note 的命令与结果
7. 归档：按 feature 规则提交（合并去向 docs/architecture，申报 manual_updates 把「长文本入参写法约定」写进项目说明书）

【边界（不要做）】
- 不改 DSH 核心适配器（deepseek-harness/.../llm-deepseek/src/translate.ts）——『整轮失败粒度』另立需求；
- 不做死锁那批修复（S1–S7 / BUG-1…BUG-8）——已在草案里，另立；
- 不改任何工具入参 schema / 错误码 / 落盘格式。

【若发现代码与上面描述不符】停下来问我，不要自行扩大范围。
```

## 提醒（与工作无关但必须知道）

- **本窗口的 Dive 循环不会因为新窗口而停止**：它由本窗口 `dive.activation=armed` + 1000 轮上限驱动。要停：A（修 clear_pause + 重载）／B（停机改台账）／③（中断本轮，会留 `armed+phase=paused`）。
- 新需求走完后，这条旧需求建议你在看板**取消**（取消只有人能操作），否则它会一直挂在 implementing/0 卡。