# 复盘：reqboard 体检第二批文案契约漂移（REQ-261007200706-89b7）

## 交付结果 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

七组漂移全部清零，九张卡（28 张含子卡）全 done，验收单 11 项全过（v2），需求已归档。
交付结论与逐项证据：`verification.md` + `tests/evidence.md`（E-1~E-7）。

## 做对了什么 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

1. **每组修复都配机械锁，而不是只改文案**：G1 的锁是探针扩面 + 禁词硬规则（挂 `prompts:check`）、
   G2 是事实源唯一 + grep 判据、G3 是预算断言 + 细则之家取证、G5/G6 是分类统计判据、
   G7 是**反向锁**（一次性字段不得含危险指引）、G8 是不枚举断言。体检报告只要求"改对"，
   这批把"改对"升级成"漂移回不来"。
2. **减法要取证"没减过头"**：FR-3 把细则从 description 挪走时，逐条确认每个规则在拒绝回执里有**全文之家**
   （`sidesDeclarationGap` / `docSectionGateFailure` / `requirement_uncovered` / 任务表门禁 / `plan-doc-table` /
   `assertArchiveMaterials`），并用 `tests/submit-prompt-budget.test.ts` 调真实 message 断言。
3. **同树 A/B 取代脏基线**：仓库 `test-baseline` 在本批开工前就红（工作树混着别条需求在飞改动），
   于是改用「回退本卡改动 → 跑 → 恢复 → 跑」的逐卡 A/B 与整批集合 diff，把"零新增红"变成可复核事实。
4. **判据不可执行时当场修订并留痕**：三处修订都写进了卡验收（同形异义的 QueryReport「四问」排除、
   FR-3 预算与"requirement 细则不动"不可兼得、FR-5 由源码 grep 改为运行时 description 判定），
   避免"悄悄放宽标准"。

## 踩过的坑 <!-- serves: FR-1, FR-3, FR-5, FR-7 -->

1. **探针第一版自己有个行号 bug**：块注释按整体替换会吞掉换行，导致报出的 `文件:行` 整体前移。
   修法 = 按原换行数回填换行；并把它写进新测试（行号保真断言）。
2. **扩面首跑暴露了报告没列的死指针**：`capture-section.ts` 教的 `python3 agent-dh/scripts/wiki_probe.py`
   在本仓不存在、`verification.ts` 还写着 `agent-dh/docs/` 前缀。设计已预告"首跑暴露的按探针纪律处置"，
   故当场修指针（不是加白名单）。
3. **登记表有洞**：`handoff.reason` 引用常量却**不在任何覆盖清单**里，旧用例天然盖不住它。
   分级时把它补进一次性表，从此受反向锁管。
4. **覆盖清单会与语义打架**：`arg-guidance` 原 TC-2 强制"清单内每个字段都要含三锚点"，
   正是这条把危险指引锁死在一次性工具上——不拆表就无法在不放宽原判据的前提下修正语义。

## 遗留项 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 遗留 | 影响 | 处置建议 |
|------|------|---------|
| `test-baseline` 基线脏 | 全量比对判据在当前工作树不可用 | 各在飞需求收工后 `tsx scripts/test-baseline.mts --refresh` 重建基线 |
| `size-budget` 既有红（`SubmitTool.ts` 517 行 > 400） | 尺寸门禁长期无人看 | 另立"拆文件"需求；本批只 +2 行注释未加剧 |
| `scripts/fix-missing-rtm.ts` stale import（`RTMGenerator` 不存在） | 该补生成脚本跑不起来 | 另立修缮项；本次 `rtm-accepting.yml` 由插件状态推进时自动生成 |
| 两条并行抖动用例（`canceled-legacy-read`、`reqboard/settings-init`） | 全量偶红，掩盖真信号 | 单独立项查共享临时目录/时钟依赖 |
| 验收前置的 3 份设计文档（`data-model`/`interfaces`/`test-cases`）未走 `kind=design` 登记 | RTM 的 design_docs 里 `registered=false` | 设计阶段已关闭；如需登记在后续窗口补登（不影响验收结论） |
| 本批设计阶段只交 2 份（architecture + migration），验收门禁却要 5 份 | 说明"设计必交文档集"两处口径不一致 | 建议把验收前置的 5 份口径前移进 `design→decomposing` 门禁，避免补档 |

## 认知更新（并入项目文档） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- `docs/architecture/project-manual.md` §「长文本工具入参的写法约定」→ 补记两级化、"多挂也是缺陷"。
- `docs/architecture/prompt-context-layering.md` §九 → agent 可见文案四条纪律与机械对账表。
