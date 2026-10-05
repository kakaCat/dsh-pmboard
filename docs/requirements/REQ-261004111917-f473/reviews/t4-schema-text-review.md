# 复核报告 · t4 工具 schema 文案 + 契约护栏（t-b5f41f 研发段 t-a55776）

- **复核方式**：独立子代理（fresh context、**只读**；含只读内存态变异测试，未改文件）
- **被复核对象**：三处工具 schema 的 `board_link.description`、`tests/tool-schema-board-link.test.ts`
- **对照契约**：`design/interfaces.md` §工具 schema 文案变更（含「不变」项）、`requirement.md` FR-4 与边界第 2 条
- **结论**：**可以过复核**（文案与契约逐字一致、产出值一字未动、用例可证伪且无静默通过、无越界），附 2 条非阻塞提示

## 逐条核对（摘要）

| 检查项 | 结论 |
|---|---|
| 三处描述与 interfaces 表逐字一致；src 全域无旧口径残留 | 一致（`StatusTool.ts:221` / `CaptureTool.ts:80` / `CreateTool.ts:71`；`src/tools` 62 个 .ts 全扫 0 命中） |
| 三处产出值逐字未变、前缀统一 | 一致（`QueryState.ts:197` 三元、`CreateRequirement.ts:82` 模板串、`CaptureRequirement.ts:291` 拼接；`git diff -U0` 中 board_link 行 0 命中） |
| 用例可证伪（非恒真） | 一致；复核者做 4 组只读变异全部翻红（改主值 / 只改回退分支 / 换成函数调用 / 删掉赋值行），空跑护栏齐备（desc 非空、赋值数>0、文件数≥15） |
| schema 读取路径正确、不会静默通过 | 一致（`board_link` 是**输出**字段：`output.schema.properties`；取不到则 desc 为空 → 断言红，不会静默绿） |
| 无越界改动 | 一致（board_link 相关仅 3 行 `-旧/+新` 描述；字段名与 `type:'string'` 原样） |

## 偏离与风险清单 + 处置

| # | 提示 | 处置 |
|---|---|---|
| 1 | `dist/index.mjs` 仍是旧文案 → 文案对外生效点在构建卡 | **已转 t5 并落实**：`pnpm build` 后取证 dist 含新文案 ×3、旧文案 0（evidence E-2） |
| 2 | 新描述承诺的行为已实现但 E2E-1 真机点击未跑（可接受的「先说后做」） | **已记账**：不改措辞；在验收材料写明「E2E-1 ② 通过 + dist 重建」后该文案才算完全兑现 |
| 可选 | 用例未锁 `type:'string'`（改名会红，改类型不红） | **已采纳**：补 `expect(prop?.type).toBe('string')` |
| 文档漂移 | `interfaces.md:142/146`、`requirement.md:100` 的行号（202/189）与实际（221/197）不符 | **记账**：属旧基线行号漂移、契约内容不受影响；不重写已确认的设计文档（改写会作废人工确认），列为归档前可顺手校对项 |

## 命令输出摘要

- `npx vitest run tests/tool-schema-board-link.test.ts` → **8 passed**
- `npx tsc --noEmit | grep -E 'tool-schema-board-link|tools/(StatusTool|CaptureTool|CreateTool)'` → 无输出
