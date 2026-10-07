# t-780dde 裁决行新控件：理由输入、原文保留、归档门可见（UI）·测试

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
裁决行新控件：理由输入、原文保留、归档门可见（UI）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T13:22:34.547Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

测试段完成：本卡面 278 例全绿、零新增失败、零类型错误；并修掉两个自引入缺陷（开关冲突 + 过严降级）。

### 完成项

- 新鲜全量读数（此后无源码改动）：73 failed / 6518 passed / 22 skipped（6613 用例）、41 failed files
- 判据用集合差：用例级失败从改动前基线 102 降到 74（**净改善 28**）；落在本卡改动面的失败为 **0**
- 本卡改动面直接复跑 17 个文件 278 例全绿
- pnpm build:client → [verify-client] OK（bundle=721645 bytes），产物晚于最后一次客户端源码改动
- 类型检查：本卡改动面零错误；全仓 4 条在别的窗口的测试文件（query-docs-roots 1、verification-prototype-compare-required 3）
- **本轮抓出并修掉两个我自己引入的真缺陷**（都在 t4 弹框通道，被 accept-sheet-zero-input 抓红）：① 回滚开关生效时仍在补问变更理由——与开关「一行配置退回今天行为」的承诺自相矛盾；② 补问未作答时把整项降级为未复核，**过严**（人点的是通过、文本也有锚点）
- 修法：① 补问以 itemResultBindingEnabled 为门；② 未作答改为「不采纳这次修改」（opinion 收回 agent 原文 ⇒ 应用层看不到差异 ⇒ 不写覆盖、原文不丢、裁决照常通过）
- 顺手消掉一处判据三写：覆盖判据原本在「看板收集 / 弹框补问 / 应用层写入」三处各写一份，已提为域层单一谓词 isResultOverride 供三处共用
- 口径更新：accept-sheet-zero-input 的「改了输入框」用例改为断言覆盖四元组，并**新增**一条「无理由则不采纳」的锁

### 改动文件

- `src/application/use-cases/AcceptSheet.ts`
- `src/application/internal/verdicts.ts`
- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `tests/accept-sheet-zero-input.test.ts`

### 下一步

关闭 t5 测试段与父卡；随后批 5 开工 t6（迁移兼容 + 存量零改写对照 + 基线差集收口）

---
