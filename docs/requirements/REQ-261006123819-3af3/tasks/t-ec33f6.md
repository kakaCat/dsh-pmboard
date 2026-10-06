# t-ec33f6 放宽工厂扫描并把 bind/handoff 纳入契约覆盖

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
放宽工厂扫描并把 bind/handoff 纳入契约覆盖

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① 放宽后的正则扫到 ≥27 个工厂（改动前 25，漏 Bind/Handoff），断言随 TOOL_REGISTRY.length 走；② npx vitest run tests/output-contract.test.ts → 全绿 exit 0；③ 若报未声明键：按规则处置并把结论写进本卡汇报（纯声明对齐已修 / 已登记留债并说明理由）；④ 近似预告（非判据）：Handoff 的 windowKey 疑似未声明，以本卡实测为准。

## 实施方案（implementation）
tests/output-contract.test.ts:672 的工厂正则由 /export function define(\w+)Tool\(deps: UseCaseDeps\)/g 放宽为容许第二参数（/export function define(\w+)Tool\(deps: UseCaseDeps(?:\s*,[^)]*)?\)/g）；src/tools/registry.ts 增 Bind（responseSources: application/use-cases/BindSeat.ts）与 Handoff（application/use-cases/HandoffOwner.ts）两条。处置规则（design/backend.md「FR-1 的两步实施规则」）：若报出未声明键，纯声明对齐就地补 output.schema.properties；若属真实契约问题，登记进 tests/output-contract.test.ts 既有的「已知留债登记表」并在验收材料写明留待独立需求——不许删断言。

## 上游产出摘要（dependsSummary）
- 工具登记面单点化并补齐 4 条缺失映射

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T05:48:31.639Z，窗口 session-af0ee362-fa98-4396-a5d7-856681a42843）

放宽工厂扫描正则：扫到的工厂由 25 升到 27，Bind/Handoff 进网；未声明键按规则处置并留痕。

### 完成项

- 工厂正则放宽为容许第二参数，与 design/backend.md 处方逐字一致
- 实测扫到 27 个工厂（改动前 25）：Bind 与 Handoff 首次进入正则安全网
- 断言改为随 TOOL_REGISTRY.length 走，写死的下限 9 已移除
- ③ 实测结论：Handoff 的 windowKey 等 8 键不是回执顶层字段，来自内部 helper 的 return
- ③ 处置结论：既非纯声明对齐也非真实契约问题＝扫描器假阳性，逐键登记且消失即红（未删断言、未补假字段）
- ④ Bind 实测无任何未声明键（无漂移、无需处置）
- 判据：output-contract 42 passed、三文件 53 passed、exit 0；tsc 0 错
- 全量：pnpm test 61 失败 ≤ 基线 68；基线 --check 新增失败 1 经取证属别的窗口，非本卡

### 改动文件

- `tests/output-contract.test.ts`

### 下一步

下一张就绪卡：t-ac2770（删无写入者的归档时间字段与读取分支）。

---
