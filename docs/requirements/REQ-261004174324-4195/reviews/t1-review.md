# t1 复核 · 领域生成器（REQ-261004174324-4195）

对照文档：[design/interfaces.md](../design/interfaces.md)（签名单点）、[design/architecture.md](../design/architecture.md)（依赖方向）

## 逐条核对

| 设计条目 | 实现 | 结论 |
|---|---|---|
| `extractSymbols(relPath, text): KbSymbolRow[]` | 同名同参同返回（`readonly`） | 一致 |
| `renderCodeMap(files): { page, symbolsTsv }` | 同名同参，另返回 `symbolCount` | **超集**（见偏离 2） |
| `renderDesignTokens(files): { page, classesTsv, counts }` | 一致（`counts` 四键同设计） | 一致 |
| `scaffoldIndex(): string` | 一致（含成对生成区标记 ×2、「待写」节） | 一致 |
| `replaceGeneratedSection(indexText, sectionTitle, rows): string` | 一致 | 一致 |
| 零 IO、零时间戳 | `grep -c 'node:fs'` = 0；`grep -cE 'Date\.now\|Math\.random'` = 0；层边界测试未列本文件 | 一致 |
| 依赖方向只许向内（C-01） | 仅 import `./types.js`、`./budget.js`（同层 domain） | 一致 |

## 偏离清单（逐条给结论）

1. **新增 `KbIndexStructureError`（设计未列）** — 结论：**必要且更响亮**。设计只写了 reason `markers-missing`，但实现期发现两种病因需要分开（分节被改名 vs 生成区标记被删）。若不分开，调用方只能笼统报一种，排查会指向错方向。已导出并带 `kind` 字段，t2 用例按 kind 映射 reason。
2. **`renderCodeMap` 多返回 `symbolCount`** — 结论：**无害超集**。调用方（CLI 打印、t2 结果）需要总数做披露；不改变 `page`/`symbolsTsv` 的逐字节内容。
3. **`renderDesignTokens` 内部按 `^src/client/styles?` 过滤** — 结论：**与旧脚本口径一致**（旧脚本先 walk `src/client` 再过滤）。写成内部过滤后，调用方传「src 全量」或「src/client 全量」结果相同，少一个易错前置条件。
4. **行为修正：符号归属** — 结论：**修正了一个既存缺陷，且必须修正**。旧脚本 `rel.sort()` 后却按未排序的 `abs[i]` 读内容，导致 `code-map.symbols.tsv` 的 file 列与符号整体错配一行（实测 `src/client/styles.ts` 被记成定义 `BASE_CSS`，实际在 `src/client/styles/base.ts`）。纯函数按 path 一致配对，无法复现该错配。
   - **下游影响（响亮声明）**：首次 `pnpm kb:build` 会改写 `code-map.md` 与 `code-map.symbols.tsv`（含既有陈旧漂移，见 `evidence/kb-check-baseline.txt`）。故 **t3 的验收锚点「`git diff --stat` 无输出」需修订为「重跑两次零差异」**——第一次重跑**应当**有变更。已加回归锁：`tests/kb-generate.test.ts`「符号归属到真实定义它的文件」。
5. **继承了旧脚本的一处边界行为**：`export default <表达式>`（如 `export default 42`）不入符号表（正则要求关键字后跟名称）。结论：**保持继承**，理由是本需求是搬迁不扩范围；已写成用例固定该行为，避免以后被误当 bug 修掉而引入口径变化。

## 证据

| 证据 | 位置 |
|---|---|
| 单测全绿（13 用例） | `npx vitest run tests/kb-generate.test.ts`（13 passed） |
| 层边界与确定性定向断言 | [evidence/t1-review-boundary.txt](evidence/t1-review-boundary.txt) |
| 外部消费冒烟 | [evidence/t1-integrate-smoke.txt](evidence/t1-integrate-smoke.txt) |
| kb:check 基线（改动前已陈旧） | [evidence/kb-check-baseline.txt](evidence/kb-check-baseline.txt) |

## 结论

除上述 4 项已声明的偏离（含 1 项必要修正）外，**其余无偏离**。修正项已同步：模块头注释写明成因、回归锁就位、下游 t3 验收锚点在开工时修订。
