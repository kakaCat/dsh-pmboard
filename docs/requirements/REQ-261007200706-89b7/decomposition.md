# 拆分计划：reqboard 体检第二批文案契约漂移修复（REQ-261007200706-89b7）

> 依据：requirement.md（FR-1~FR-7、D-1）+ design/architecture.md + design/migration.md。
> 纪律：一次只改一类东西；纯文案卡走 change-only（研发+复核）；探针扩面走完整 refactor 链；链尾总验收。

## 目标与做法

**目标**：agent 可见字符串与实现逐字对齐，七组漂移（G1/G2/G3/G6/G7/G8/G9）清零，
并用扩面后的 prompt-path-probe 把「文案引用的仓内路径必须存在」锁进 `pnpm prompts:check`。

**做法**：按设计文档的分组一刀一类——

1. **t1** 先把 8 处死路径引用换掉（含 GUI 文案 + build:client 验证）；
2. **t2** 扩展探针扫描面（src/tools + capture-section + client 文案）、加注释剥离与禁词前缀
   硬规则、挂进 prompts:check——排在 t1 后，否则探针把未修的死路径报成缺口；
3. **t3~t8** 逐组清理（问数口径 → submit 六类+细则下沉 → 叙事清零 → 注记拆分 →
   ask_confirm/预算描述 → 元数据残留），共享文件的卡串行防互相踩踏；
4. **t9** 链尾总验收：全量回归命令 + 七组 grep 判据汇总复核。

**为什么串行居多**：多张卡碰同一批 prompt 文件（SubmitTool/prompt.ts 被 t1/t4/t5 碰、
capture-section.ts 被 t1/t3 碰、AskConfirmTool/TaskMoveTool 被 t6/t7 碰），
并行必撞；串行链与自动实施链的单卡投递语义一致，无吞吐损失。

## 覆盖对照表（FR → 卡，人读汇总；门禁只认卡上 requirement_refs）

| FR | 承载卡 | 验收锚点摘要 |
|----|--------|-------------|
| FR-1 | t1（文案面）、t2（机械检查） | 死路径 grep 零命中；prompts:check 含探针且 exit 0；specimen 必红 |
| FR-2 | t3 | 问数字样仅命中事实源文件；CreateTool prompt 含 doc_location |
| FR-3 | t4 | 六类+prototype 支；description ≤1300；负例回执 code 不变 message 含细则 |
| FR-4 | t5 | agent 可见面 REQ/FR 编号零命中（cutoff 行除外）；RunStatusTool 描述瘦身 |
| FR-5 | t6 | 「拆成多次调用」命中行全部归属保留表；内联复制归零 |
| FR-6 | t7 | 「全部写路径」表述在场；budget 父描述含 expectedWindowIndex |
| FR-7 | t8 | 「13 个」零命中；repository.directory 删除；build/typecheck 0 |
| 全部 | t9 | 四层等价证据 + 判据汇总表全过 |

## 任务表

| 计划 key | 任务 | 验收 | 工作量 |
|---------|------|------|--------|
| t1 | 替换 8 处死路径引用（SubmitTool/prompt.ts、capture-section.ts、client/views/verification.ts、protocol.ts、ArtifactSpec.ts、errors.ts），client 改动后跑 build:client | `grep -rn "agent-dh/docs/architecture/requirement-archive\|docs/standards/tool-development" src` 零命中；`pnpm build:client` exit 0 且 verify-client OK | 小（6 文件字符串替换 + 一次构建） |
| t2 | 扩展 prompt-path-probe：扫描面加 src/tools/capture-section/verification.ts、.ts 注释剥离、FORBIDDEN_PATTERNS（agent-dh/、docs/standards/ 不可豁免）、specimen 补反例、prompts:check 接线、测试断言 | `pnpm prompts:check` exit 0；`tsx scripts/prompt-path-probe.mts --specimen` exit 1；测试含禁词前缀必红与新扫描面在场断言 | 中（探针逻辑改动 + 测试） |
| t3 | 立项问数口径统一：三问/四问/五问字样全仓清零（事实源 capture-mapping.ts 除外）、README 两处对齐、CreateTool/prompt.ts 补 doc_location ⚠️超容量(建议2批) | `grep -rn "三问\|四问\|五问" src README.md --include=*.ts` 仅命中 capture-mapping.ts；`grep -n doc_location src/tools/CreateTool/prompt.ts` 命中；capture/create 契约测试绿 | 中（~20 文件文案，多为单行） |
| t4 | submit prompt 不数类数 + 补 prototype 支 + plan/archive 细则下沉拒绝回执 + description 预算断言 | prompt 含 prototype 支；`grep "五类\|五个提交入口"` 零命中；`SUBMIT_PROMPT.length ≤ 1300` 断言过；负例 plan/archive 提交回执 code 不变且 message 含细则要点 | 中（文案 + 两个用例的 message 增肥 + 预算测试） |
| t5 | REQ/FR 历史叙事清零：RunStatusTool 两段修复史、SubmitTool/prompt.ts :18/:27-31、CaptureTool/prompt.ts:21、四个 Tool.ts schema 描述内编号；出处挪代码注释 | agent 可见面 `grep "REQ-2[0-9a-z]\|REQ-e"` 零命中（prompt.ts:15 cutoff 行除外）；RunStatusTool description 较 810 字符基线下降；受影响测试更新后绿 | 中（7 文件文案 + 注释挪移） |
| t6 | LONG_TEXT_ARG_NOTE 拆 STYLE/SPLIT 常量，10 处引用点按设计处置表归位，内联复制统一回常量 | `grep "拆成多次调用" src/tools` 命中行全部归属保留表（task_report/ask_confirm/submit）；`grep` 内联整句复制零命中；layer-boundary 测试绿 | 小（shared.ts + 10 处引用点） |
| t7 | ask_confirm 拦截清单改「全部写路径」定性表述 + TaskMoveTool budget 父描述补 expectedWindowIndex | `grep "全部写路径" src/tools/AskConfirmTool/prompt.ts` 命中；budget 父 description 含 expectedWindowIndex；ask-confirm-prompt.test.ts 更新后绿 | 小（2 文件 + 测试断言） |
| t8 | cordis.patch.yml 注释「13 个」改不数数表述 + package.json repository 清理（删 directory、url 对齐 origin） | `grep "13 个" cordis.patch.yml` 零命中；repository.directory 键不存在、url = dsh-pmboard.git；`pnpm build && pnpm typecheck` exit 0 | 小（2 文件） |
| t9 | 链尾总验收：四层行为等价证据（test 基线/typecheck/prompts:check/build）+ 七组 grep 判据汇总复核 | `pnpm test` 与基线比对无新增失败；typecheck/prompts:check/build exit 全 0；specimen 红；判据汇总表七组逐条过 | 小（纯跑命令 + 汇总，无代码改动） |

## 依赖与排序

```
t1 ──▶ t2（探针扫 t1 改过的面，时序约束）
t1 ──▶ t3 ──▶ t5（共享 capture-section / CaptureTool·SubmitTool prompt）
t1 ──▶ t4 ──▶ t5（共享 SubmitTool/prompt.ts）
t5 ──▶ t6 ──▶ t7（共享 AskConfirmTool / TaskMoveTool）
t8（独立）
t1~t8 ──▶ t9（总验收，纯时序约束）
```

## 风险与回滚

- 风险集中在 t2（探针逻辑改动）：注释剥离若误伤字符串内的 `//`（如路径含双斜杠注释样文本），
  靠 specimen 与既有 fragments 面回归兜住；回滚 = `git revert` 单卡提交，prompts:check 串同提交回滚。
- t4 的 message 增肥是有意行为变化（code 不变），下游若断言旧 message 精确串须同步——已登记。
- 其余各卡为字符串常量替换，回滚零成本；无数据迁移、无台账格式变化。
