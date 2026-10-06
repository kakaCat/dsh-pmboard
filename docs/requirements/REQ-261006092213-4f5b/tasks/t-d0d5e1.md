# t-d0d5e1 建结果匹配纯函数与体检（接口先行）·研发

> 需求：REQ-261006092213-4f5b 验收项由 agent 实测完成：人只做审核员

## 在做什么
建结果匹配纯函数与体检（接口先行）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T01:43:28.999Z，窗口 session-ef6b5ae7-bec8-4b04-817d-402f9df3e53b）

建成结果匹配与体检纯函数模块：引用键按来源而非验收项 id，四类体检一次报全，写入带来源标注。

### 完成项

- 新建 src/domain/workflow/ResultBinding.ts：isForeseeableItem / refKeyOf / matchStructuredResults / applyStructuredResults
- 匹配按 ref 与验收项来源同构，不依赖验收项 id（旧路径不可达的根因就此绕开）
- 四类体检各自归入 missing / unmatched / duplicate / invalid，返回值不被丢弃
- 写入纪律：标 resultSource=agent、人填过不覆盖、超长截断 500 字符
- 新建 tests/result-binding.test.ts：13 项用例，含系统项豁免与引用键不含项 id 的结构断言
- npx vitest run tests/result-binding.test.ts 13/13 通过；npx tsc --noEmit 0 错误

### 改动文件

- `src/domain/workflow/ResultBinding.ts`
- `tests/result-binding.test.ts`
- `docs/requirements/REQ-261006092213-4f5b/design/interfaces.md`
- `docs/requirements/REQ-261006092213-4f5b/design/data-model.md`

### 下一步

复核子卡独立复查该模块与设计口径；随后测试子卡跑验收命令。

---
## 汇报 2（2026-10-06T01:49:55.204Z，窗口 session-ef6b5ae7-bec8-4b04-817d-402f9df3e53b）

按独立复核结论返工：修掉阻断级同键误写、非法输入不响亮、错误码无法分派、计数口径含糊四处，并同步设计文档。

### 完成项

- 复核判需修，返工已落：可预见项识别口径改为按项判定（需求级项只认判据文本等值）
- 新增冲突不变量 conflict：两个可预见项同键即响亮报出
- 新增两条真 buildSheet 回归用例：E2E 覆盖「有」行、原型豁免说明行不得抢走需求级结果
- 非法输入改全函数：results 非数组或元素为原始值一律进 invalid，不抛异常
- 体检拆成 invalid 与 empty 两族，并定死判定顺序（形状→命中→重复→完整性）
- 计数定死：apply 返回 matched 与 changed，返回体 results_bound 取 changed
- apply 内也守 needsHuman 非空（不留半截记录）；人保护范围收窄为只保护 result 与来源
- 设计文档同步：interfaces 的签名与错误码表、backend 的集合口径、data-model 的保护范围
- 复验：23 项单测全绿、tsc 0 错误、设计文档门禁自检无违规

### 改动文件

- `src/domain/workflow/ResultBinding.ts`
- `tests/result-binding.test.ts`
- `docs/requirements/REQ-261006092213-4f5b/design/interfaces.md`
- `docs/requirements/REQ-261006092213-4f5b/design/backend.md`
- `docs/requirements/REQ-261006092213-4f5b/design/data-model.md`

### 下一步

复核者第二轮复验；通过后由测试子卡跑验收命令收口。

---
## 汇报 3（2026-10-06T01:53:41.741Z，窗口 session-ef6b5ae7-bec8-4b04-817d-402f9df3e53b）

按第二轮复核的两条设计口径问题返工：修正提交侧步骤序（先组装后硬门）、定义返工续版越界 ref 的放行口径，并把三条建议落成代码与断言。

### 完成项

- R1 已改：backend.md 步骤序改为先组装 buildSheet（纯函数不落库）再跑硬门，并写明预览单与落库单必须同一份
- R2 已定：新增 splitUnmatched，把本版不含但存在的 ref 归 outOfScope 放行，unknown 才拒
- 新增真 buildSheet 续版用例：v1 未过项 → v2 reworkOnly，全量交代时需求级 ref 归 outOfScope
- apply 增 conflict 前置条件：同键时一个字段都不写，并有断言
- F8 采纳零成本漂移锁：断言文本绑定路径的截断长度等于本模块常量
- 脏项硬化：判据字段非字符串时不抛异常、也不当作需求级项（覆盖复核标注的存疑项）
- docs 清单补齐：interfaces 豁免清单补 E2E 覆盖「有」行与原型豁免说明行，backend 返回体键补全
- 复验：29 项单测全绿、tsc 0 错误、设计文档门禁自检无违规

### 改动文件

- `src/domain/workflow/ResultBinding.ts`
- `tests/result-binding.test.ts`
- `docs/requirements/REQ-261006092213-4f5b/design/backend.md`
- `docs/requirements/REQ-261006092213-4f5b/design/interfaces.md`

### 下一步

第三轮限定复核（R1/R2 + 新增断言）；通过后由测试子卡跑验收命令收口 t1。

---
## 汇报 4（2026-10-06T01:56:06.950Z，窗口 session-ef6b5ae7-bec8-4b04-817d-402f9df3e53b）

补全返工续版口径：knownKeys 必须含本轮对照项键且条件化加入，并把配方与反例锁进用例。

### 完成项

- R2 补全：knownKeys 配方改为四类，原型对照键与裁定对照键按本轮实际产出条件化加入
- 写明两条反例纪律：不得放宽成全部活卡、对照项键不得无条件加入
- 新增用例锁定配方：真 buildSheet 出四项的续版单，全量交代后按正确配方 unknown 为空
- 同用例固化反例：旧配方会把两个对照项误判 unknown（拒死返工轮的现场）
- 文档小疵清理：backend 陈旧措辞改为同一份组装产物；interfaces 错误码表补仅 unknown 部分
- 复验：30 项单测全绿、tsc 0 错误

### 改动文件

- `docs/requirements/REQ-261006092213-4f5b/design/backend.md`
- `docs/requirements/REQ-261006092213-4f5b/design/interfaces.md`
- `tests/result-binding.test.ts`

### 下一步

第四轮限定复核（knownKeys 配方）；通过后关复核子卡，进测试子卡收口 t1。

---
