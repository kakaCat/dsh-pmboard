# t-40fa7a 兼容口径回归 + 工具 schema 文案·复核

> 需求：REQ-261004111917-f473 修复看板/需求详情深链 404：/dashboard#pmboard 已失效，补兼容路由 + 前端定位

## 在做什么
兼容口径回归 + 工具 schema 文案·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T03:54:26.767Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

复核段结论：文案与契约逐字一致、产出值没被动过、用例真能证伪——无偏离；顺手补了一条「字段类型也不许动」的护栏，并把两条对外生效条件（dist 重建 + 真机点击）转给 t5。

### 完成项

- 复核方式：第四个独立子代理只读复核（对照 interfaces.md《工具 schema 文案变更》表逐字比对 + 只读变异测试证伪用例）
- 结论：文案与契约逐字一致、产出值一字未动、用例可证伪（4 组内存态变异均翻红）、schema 读取路径正确且无静默通过、无越界改动——无偏离，同意放行
- 复核补强（已采纳）：用例增加 type 断言（board_link 必须是 string）——此前改名会红，但改类型无人拦
- 复核提示 1（转 t5）：dist/index.mjs 仍是旧文案（新文案 0 命中），文案对外生效点是 t5 的 pnpm build；已把「重建后 dist 含新文案」列为 t5 验收条件
- 复核提示 2（转 t5 与验收材料）：新描述承诺的行为已实现且有单测，但 E2E-1 真机点击尚未跑——属可接受的「先说后做」，措辞不改，在 t5 写清「E2E-1 ② 通过 + dist 重建」才算兑现
- 复核指出文档行号漂移（interfaces.md 写 202/189，实际 221/197）：属旧基线行号漂移、契约内容不受影响；不重写已确认的设计文档（改写会作废人工确认），记为归档前可顺手校对的低危项
- 自测：npx vitest run tests/tool-schema-board-link.test.ts → 8/8 全绿；npx tsc --noEmit 本卡文件零 error

### 改动文件

- `tests/tool-schema-board-link.test.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/CreateTool/CreateTool.ts`

### 下一步

交测试段：全量回归 + tsc 基线；随后 t5 承担 dist 重建取证与真机端到端。

---
