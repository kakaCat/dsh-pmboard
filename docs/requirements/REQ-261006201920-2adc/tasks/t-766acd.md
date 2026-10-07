# t-766acd 域层契约：占位符判据与声明式回填器·复核

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
域层契约：占位符判据与声明式回填器·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T12:38:27.642Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

复核段结论：无偏离。设计与实现逐条对应 8/8，目标命令 39 例全绿。

### 完成项

- 对照 design/architecture.md「占位符词表与回填器」逐条核对：8/8 符合（闭集与模板同处、REQ 与 taskId 取值、三类测试占位符、两脚本占位符、两条兜底、词表外即抛、模板字面量零改动、判据顺序）
- 对照 design/interfaces.md 域层签名：7/7 一致（见联调段汇报）
- 复核段目标命令全绿：npx vitest run tests/acceptance-placeholder.test.ts tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts → 3 files / 39 tests passed，exit 0
- 无偏离。两处加性细节（不影响契约）：新增导出 ANGLE_TOKEN 供断言用；兜底值提为具名常量 TEST_TARGET_FALLBACK 与 SCRIPT_TARGET_FALLBACK，便于用例与门禁引用
- 设计未覆盖但实现做了的：无；设计覆盖但实现未做的：无

### 下一步

进入 t1 测试段：跑目标命令并给出汇总读数

---
