# t-dea44a 逐码演练：让每个能触发的错误码都有一条断码用例·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
逐码演练：让每个能触发的错误码都有一条断码用例·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/error-code-matrix.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T07:17:40.070Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

新增错误码触发矩阵：23 个真零覆盖码里补上 18 条真触发用例，读数降到 5（上限 5）

### 完成项

- 新增 tests/helpers/code-trigger-harness.ts：defineCodeTriggers 展开参数化「触发 → 断码」用例，含三条自检（specs 非空 / 码必须命中口径清单 / 同码不得重复）
- 新增 tests/error-code-matrix.test.ts：18 条 TriggerSpec，每条真的走到产生点并断到码本身，不断中文文案
- direct 档 6 条：依赖门自引用、阶段占位符残留、文档根来源非法、席位上非法、组合根缺预算端口、查询不存在需求
- fault 档 5 条：无弹框通道、非 live driver、坏系统记录文件、假后台投递端口、skill 资产包损坏
- fixture 档 5 条：顶层卡当子卡、验收单版本不匹配、终态需求推进、客户端详情结算抛错、交接写盘失败
- 文档门两条：9 类文档未齐（DOC_INCOMPLETE）与验收项不可照着验（ACCEPTANCE_NOT_EXECUTABLE）
- 读数：大写码 132 · 字面量覆盖 120 · 常量覆盖 7 · 零覆盖 5 · 假阴性率 5.30%（此前零覆盖 23）
- 仍零覆盖的 5 个码已明确：AWAITING_MANUAL / DESIGN_COVERAGE_GATE / IMPLEMENTATION_COVERAGE_GATE / NOT_AUTORUN / REQ_NOT_FOUND（下一步进豁免白名单）
- 验收命令：npx vitest run tests/error-code-matrix.test.ts → 22/22 通过，退出码 0；无覆盖读数超限
- 反向演练：临时改坏 NO_UI 触发条件后重跑必红并点名该码，sha256 逐字节还原一致

### 改动文件

- `tests/helpers/code-trigger-harness.ts`
- `tests/error-code-matrix.test.ts`

### 下一步

本卡复核（t-780910）核对三条自检与读数口径；随后由豁免白名单卡（u5）承接仍零覆盖的 5 个码

---
