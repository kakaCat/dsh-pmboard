# t-e4ccf4 加拆分覆盖门的 UI 卡原型锚点维度·研发

> 需求：REQ-261005105032-3b02 UI 需求必须在需求阶段交付原型产物并让原型可判定（门禁 + 唯一权威版本 + 锚点追溯）

## 在做什么
加拆分覆盖门的 UI 卡原型锚点维度·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T10:08:13.794Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段：UI 卡在拆分阶段就说不清「对照哪张原型的哪条功能点」的话，拿不到任务卡——而且这次连数据写入侧一起补齐了，门禁不再是空转。

### 完成项

- 新增纯函数模块做锚点解析与取数（两条通道：任务对象与计划文档的任务表）
- 覆盖门新增 UI 卡锚点维：缺失即拒并逐卡点名，文案给出补写位置与模板
- 补写侧落地：计划任务类型增两个可选键、白名单搬运不丢、工具 schema 声明、落库写入台账
- 锚点路径与权威索引一致才放行；指向被取代版即拒
- 非 UI 需求与存量需求直接放行；既有功能点无落点判据零回归
- 19 例全绿（含写侧端到端）+ 类型检查 0；逆验证：干净检出上 11 例红，证明用例承重

### 改动文件

- `src/application/internal/plan-prototype-refs.ts`
- `src/application/internal/content-gate-wiring.ts`
- `src/shared/protocol.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/internal/plan-landing.ts`
- `src/application/internal/approved-plan-landing.ts`
- `src/application/use-cases/Decompose.ts`
- `tests/plan-prototype-anchor-gate.test.ts`

### 下一步

联调段：核验三条落库/预检入口自动复用同一判据。

---
