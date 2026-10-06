# t-bd8ab5 注入片段面加 D-x/原型纪律并重生成内联产物

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
注入片段面加 D-x/原型纪律并重生成内联产物

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs 退出码 0（源与 src/domain/prompt/generated/fragments.ts 一致）；npx vitest run tests/prompt-tiers.test.ts 全绿；源码级断言：iron-rules.md 文本含 'D-x' 与原型必交两条，brainstorming/feature.md 片段含 D-x 与原型清单项；git diff --stat vendor/ 为空（未改上游原文）。

## 实施方案（implementation）
只改本仓段（vendored 原文与 vendor 逐字节一致，不得手改上游）：① src/domain/prompt/fragments/common/iron-rules.md 加两条铁律——需求阶段裁定必须落账 D-x；UI 需求在需求阶段必交原型。② src/domain/prompt/fragments/brainstorming/feature.md 加 D-x 落账清单项 + 原型交付项 + 确认前自查清单。③ src/domain/prompt/fragments/design/feature.md、decomposing/feature.md、implementing/feature.md、accepting/feature.md 各补『引用原型锚点 / D-x』纪律；有 heavy/overrides.md 的档（design/implementing/accepting）同步补一条覆盖段；decomposing/ 实测只有 feature.md、无 overrides.md，如实说明不乱造文件。④ 重生成构建期内联产物：node scripts/inline-prompt-fragments.mjs，随后 node scripts/check-prompt-fragments.mjs 必须 exit 0（运行时不读盘，不重生成 = 注入的还是旧纪律）。⑤ 片段里出现的路径指针必须是真实存在的路径（供 t20 的 R3 扫描）。依据 design-brief §7 与 §10 #17。

## 上游产出摘要（dependsSummary）
- 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T06:01:57.243Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，「裁定要落账、原型要交」不再只写在需求文档里——它已经进了每个阶段注入给执行窗口的纪律，且重生成校验保证不会被悄悄改回旧版。

### 完成项

- 铁律面新增两条（裁定必落账、UI 需求必交原型），并守住轻档字符上限
- 五个阶段档各补本阶段该做的原型与裁定纪律，三份 heavy 覆盖档同步
- 内联产物重生成 + 校验退出码 0，且逆验证证明校验有效（产物多一字节即红）
- 16 份提示词相关用例 381 例全绿；另有 24 份间接依赖用例 146 例全绿
- 未碰上游原文一个字节（vendor 逐字节一致）

### 改动文件

- `src/domain/prompt/fragments/common/iron-rules.md`
- `src/domain/prompt/fragments/brainstorming/feature.md`
- `src/domain/prompt/fragments/design/feature.md`
- `src/domain/prompt/fragments/design/heavy/overrides.md`
- `src/domain/prompt/fragments/decomposing/feature.md`
- `src/domain/prompt/fragments/implementing/feature.md`
- `src/domain/prompt/fragments/implementing/heavy/overrides.md`
- `src/domain/prompt/fragments/accepting/feature.md`
- `src/domain/prompt/fragments/accepting/heavy/overrides.md`
- `src/domain/prompt/generated/fragments.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

t20 的 R3 探针需覆盖旧目录 token，或指出该 heavy 附加档待修正；t11 落地原型模板后，设计模板里的指针才不悬空。

---
