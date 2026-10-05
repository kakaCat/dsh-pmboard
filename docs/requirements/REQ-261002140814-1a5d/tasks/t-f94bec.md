# t-f94bec 契约门禁补洞：值为 undefined 的属性判红

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
契约门禁补洞：值为 undefined 的属性判红

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① npx vitest run tests/output-contract.test.ts 全绿；② grep -n "obj\[k\] === undefined" tests/output-contract.test.ts 无输出；③ 反向自检用例存在且断言判红（注入 undefined 值属性时门禁必须报错）

## 实施方案（implementation）
tests/output-contract.test.ts 的 assertConformsToSchema：删除 `|| obj[k] === undefined` 豁免（该豁免让 ClearPause 的 undefined 回执全绿溜过），改为声明键的值若为 undefined 即判红；保留既有故障注入用例并补一条‘给断言喂 { declared: undefined } 必红’的反向自检。若删豁免后暴露其它工具的同类缺陷，按需求边界只登记发现，不在本需求修。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T06:17:07.686Z，窗口 session-496379d5-446c-4a51-9710-2fe1ce0eb676）

补上让这个缺陷当初能全绿溜过的那道门：契约测试不再把「值为空」当成「没有这个字段」。补洞当场又抓到第二处同类活缺陷（ask_confirm 的答复字段），按边界登记为显式留债而不是顺手改。

### 完成项

- 删掉「值为 undefined 当省略」的豁免：值为 undefined 的属性一律判红（与 status-lossless 同口径）
- 新增反向自检：喂旧形状（previous_activation: undefined）必红、真正省略该键必过
- 门禁立刻抓到第二处同类活缺陷：ask_confirm 非肯定项且未填意见时 user_feedback 为 undefined（AskConfirm.ts:312）
- 按已批边界只登记不修：做成显式留债（修好即强制摘牌，到期 2026-10-16）
- 另 3 条既有失败与本改动无关：TaskAdopt / Knowledge / Regenerate 三个工具缺响应源映射，门禁读不到它们的返回键

### 改动文件

- `tests/output-contract.test.ts`

### 下一步

t5 集中出证据：全量测试与基线比对、构建、端到端人工确认

---
