# t-b86f1d 定知识层领域模型与索引语法（纯函数单点）·复核

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
定知识层领域模型与索引语法（纯函数单点）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T04:13:53.890Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

复核结论：设计与实现无实质偏离，但抓到两处必须修的东西——①设计稿里 id 与锚点不自洽（会让「按 id 取正文」静默失效），已统一为双射并同步文档；②解析层只查语法会把伪 id（kb-a-b）放行到读取端，已在解析处拦下。另如实记录层边界测试有 2 条改动前就红的用例（与本次无关，证据已附）。

### 完成项

- 偏离 1（已修）：设计稿示例 id `kb-conventions-c01` 与锚点 `#c-01` 不自洽 → 统一为 id = kb-<页面>-<锚点>（`kb-conventions-c-01`），并同步 design/{data-model,interfaces,test-cases,use-cases}.md 与 decomposition.md 的示例; 遵守：契约语义未变, 只修示例拼写
- 偏离 2（实现加固）：parseIndexLine 原只查语法, `kb-a-b` 这类伪 id 会漏到读取端 → 解析处即校验 isKnownId 并抛错带行号, 补 1 条用例
- 无偏离项：索引行语法、预算上限（8000 字符/200 行/单行 140/页面 200 行）、8 类 kind、条目扁平标量头, 均与 design/data-model.md 逐条一致
- 门禁现状（响亮报出）：tests/layer-boundary.test.ts 有 2 条**改动前就红**的用例——domain/{checkpoint,job-spec}.ts 用 Date.now()、application/{gate,dive,internal}/* 引 node:fs；证据：本次新增文件在失败清单中出现 0 次, 且 git show HEAD:src/application/internal/diag-log.ts 第 12 行即 import node:fs
- 新增文件自查：domain/knowledge/* 无 node:/框架/上层 import, 未使用 Date.now()/Math.random()

### 改动文件

- `src/domain/knowledge/index-line.ts`
- `tests/kb-domain.test.ts`
- `docs/requirements/REQ-261001110934-3766/design/data-model.md`
- `docs/requirements/REQ-261001110934-3766/design/test-cases.md`

### 下一步

测试子卡：跑 kb-domain 与层边界对照，记录证据

---
