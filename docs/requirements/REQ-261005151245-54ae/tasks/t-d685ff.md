# t-d685ff 契约与继承模块（端口三方法 + 标题递增 + 落定编排）·复核

> 需求：REQ-261005151245-54ae 开窗补齐继承：新窗口写入标题并继承源窗口模式与 LLM 模型

## 在做什么
契约与继承模块（端口三方法 + 标题递增 + 落定编排）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T07:38:53.173Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

复核结论：t1 判通过。首轮抓出的一条真阻断（读画像失败被写成源没有）已修复并用例反转锁死，两条设计明文文案补齐覆盖，另把一处只被用例消费的设计外字段换成被生产代码消费的回带值。

### 完成项

- 第一轮只读复核：给出 1 条阻断（readProfile 非对象返回被当成空画像，把「读不到」写成「源没有」）与 9 条建议，实测证据齐全（tsx 实证 + 逐字比对 12 条文案 + 层边界 grep）
- 第二轮只读复核：确认阻断 1 与建议 1/2/4（连带 3/6/8/9）全部闭环，判 t1 复核通过；前置两处同卡修正已由研发方补齐
- 阻断修复：非对象返回改判「读不到」，三项 failed；方法缺失判断移入 try（本函数从此真的永不抛）
- 补齐两条设计明文却零覆盖的文案用例（未装配写标题能力 / 未装配设模型能力）
- 把「键不存在」的两处断言收紧为 toStrictEqual / not.toHaveProperty
- 删掉设计外的 carriedBy 字段，改为回带 agentPreset；三处调用点统一改调它，模块外不再各自读 profile
- 标题递增正则补 u 标志并改用模板串，与宿主 increasedForkTitle 逐字一致
- 两处与代码矛盾的旧注释已改写（空画像口径 / carriedBy 残留）
- 四项加性偏差登记到归档可见位置（notes/design-deviations.md）

### 改动文件

- `src/application/internal/window-inherit.ts`
- `src/application/ports.ts`
- `tests/open-window-inherit.test.ts`
- `docs/requirements/REQ-261005151245-54ae/notes/design-deviations.md`

### 下一步

复核通过，本卡收口；偏差登记文件在归档时按 kind=notes 收进文档清单。

---
