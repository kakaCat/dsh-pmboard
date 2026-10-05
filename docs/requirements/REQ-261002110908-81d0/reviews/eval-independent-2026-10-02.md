# 独立测评报告：REQ-261002110908-81d0 修复质量（2026-10-02）

> 测评人：本窗口 agent（独立复测，非原交付窗口）｜ 测评对象：长文本入参致整轮失败的修复
> 方法：不信文档、逐项复跑——所有结论附我亲手执行的命令与实测输出。
> 说明：81d0 因落库死锁停摆，实现由重开需求 REQ-261002115204-ba52 记账交付；测评以**实际落盘的修复**为准。

## 总评：A 档（90/100）

修复真实有效、测试可证伪、边界声明诚实。扣分项：一处测试证据数字今日不复现（-5）、clear_pause 返回体仍有活缺陷（-5，属同需求修复范围的残留）。

## 一、承诺兑现度（25/25）

| 承诺 | 复测证据 | 结果 |
|---|---|---|
| 共享常量 `LONG_TEXT_ARG_NOTE`（三锚点、唯一来源） | 读 `src/tools/shared.ts:32-33`：「短句 ≤60 字 / 「」代引号 / 拆多次调用」三锚点齐全 | ✅ |
| 覆盖清单 15 字段 / 8 工具 | `shared.ts:41-57` 实数 15 条；grep 确认 8 个工具文件全部真实引用该常量（task_report/submit/ask_confirm/task_move/capture/note_interruption/task_adopt/task_regenerate），无一复制粘贴 | ✅ |
| 实施片段加「汇报自检」 | `src/domain/prompt/generated/fragments.ts` 的 heavy 与 light 两档 overrides 均含「汇报自检」条目；`node scripts/check-prompt-fragments.mjs` → exit 0（片段↔产物一致） | ✅ |
| 遍历用例守覆盖 + 反向证伪 | `npx vitest run tests/arg-guidance.test.ts` → **10 passed**（实测复跑） | ✅ |
| 既有行为零变更 | `npx vitest run tests/task-report.test.ts tests/tools-schema.test.ts` → **49 passed**（7+42，与证据文档一致） | ✅ |

## 二、实现正确性（25/25）

- 单一事实源成立：常量只定义一次，15 个挂接点全部是「引用」而非「复制」——改一处全仓生效，这正是回滚演练能 4 红的原因；
- 测试不依赖字面量：arg-guidance.test.ts import 常量本身做断言，约定被改措辞时按锚点语义判红，不是脆弱的字符串快照；
- 零行为变更声明可信：task-report 7 例与 tools-schema 42 例全绿，schema 门禁对全部工具生效。

## 三、测试有效性（25/25）——亲手重做回滚演练

```
① 删掉常量里「；文本过大拆成多次调用」→ npx vitest run tests/arg-guidance.test.ts
   → Tests 4 failed | 6 passed   ✅ 变红（与证据文档声称的 4 failed 一致）
② 还原 → 同命令 → Tests 10 passed  ✅ 复绿
```

结论：用例**不是恒真断言**，约定被篡改时真的会红。这是本测评最有力的一条证据。

## 四、边界诚实度（15/25）

| 项 | 评价 |
|---|---|
| 适配器粒度修复声明在边界外（DSH 核心，另立需求） | ✅ 诚实——本修复是**提示词层的概率削减**，不是 JSON 容错根治；模型理论上仍可写出坏 JSON。文档没把"缓解"吹成"治愈" |
| `grep -c 汇报自检 fragments.ts` 证据声称 3，**今日实测 2** | ⚠️ -5：片段本体在位、一致性校验通过，但这条计数证据不再复现（疑似 ba52 记账期后续编辑所致）。证据文档应标注时效 |
| `reqboard_clear_pause` 仍有活缺陷 | ⚠️ -5：本需求修复了其接线（功能确已生效——今日实测解锁成功），但返回体仍报 `value is not lossless JSON`（今日实测两次）。功能修好了、输出契约没修好，建议补一张小卡 |

## 五、旁证（弱证据，不计分）

本次会话中 agent 多次提交含「」引号的长中文汇报（本需求交付的 eval-suite 编制过程），全程零 MALFORMED_RESPONSE——与修复意图方向一致，但属单次会话轶事证据。

## 结论与建议

1. **修复可以信赖**：三锚点约定真实接线、覆盖完整、测试可证伪；
2. 刷新测试证据文档中 `汇报自检` 计数（3→2）或注明取证时点；
3. 为 `reqboard_clear_pause` 返回体序列化缺陷立项（小卡）；
4. 根治层面（DSH 适配器对工具参数 JSON 的容错/局部失败化）仍是真问题，按原声明另立需求推动。
