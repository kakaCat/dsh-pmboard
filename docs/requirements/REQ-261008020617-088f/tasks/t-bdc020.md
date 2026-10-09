# t-bdc020 合并三个同构 RTM 门为单点并改走文档端口·研发

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
合并三个同构 RTM 门为单点并改走文档端口·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
npx vitest run tests/layer-boundary.test.ts → application/ 越界条数 15 → 9、application/gate/ 三条路径全部消失（整文件仍剩 tools/http 那条红，属另一条腿，依需求裁定 D-1 不在本需求范围）；npx vitest run tests/unit/gate → 3 文件 9 用例全绿（断言未改）；npx tsc --noEmit → 0 错；并附 git diff --stat 摘要。

---
## 汇报 1（2026-10-07T18:24:10.356Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

研发段完成：三份同构门合并为单点并改走文档端口，越界条数 15→9、gate 三条消失，三门单测 9/9 全绿且断言未改。

### 完成项

- 研发段实现：新增 src/application/gate/rtm-gates.ts，一份 rtmGateCheck(spec, req, docs) + 三个同名薄壳；删掉三份克隆（-285 行，+26 行改动）
- 规格化差异：三兄弟仅剩 gateName / code / passMessage / gapNoun / gapDetailLead / isGap 六项，读盘与错误兜底单点
- 验收①：npx vitest run tests/unit/gate → 3 文件 9 用例全绿，断言一字未改（行为等价的用例侧证据）
- 验收②：application/ 越界条数 15 → 9，application/gate/ 的三条路径（acceptance-gate / design-gate / task-coverage-gate）全部消失
- 验收③：grep -rn node: src/application/gate → 0 命中
- 验收④：npx tsc --noEmit → 退出码 0
- git diff --stat：3 份旧文件删除 268 行、index.ts 10 行、三份单测各 11 行；新文件 rtm-gates.ts 为未跟踪
- 验收标准修订（如实申报）：本子卡原模板验收写『layer-boundary 全绿』，按现状不可执行——该文件另有一条 tools/http 红属需求边界外（D-1）。已按工具文档的『开工时发现验收标准不可执行』用法改为可执行锚点（越界条数 15→9 + gate 三条消失），修订留痕在卡上

### 改动文件

- `src/application/gate/rtm-gates.ts`
- `src/application/gate/index.ts`
- `tests/unit/gate/acceptance-gate.test.ts`
- `tests/unit/gate/design-gate.test.ts`
- `tests/unit/gate/task-coverage-gate.test.ts`

### 下一步

复核段：逐条核对合并前后消息/code 的运行时等价性

---
