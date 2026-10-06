# t-f9da11 裁决口径与底线：零输入通过 / unverified / 放行判据·研发

> 需求：REQ-261006092213-4f5b 验收项由 agent 实测完成：人只做审核员

## 在做什么
裁决口径与底线：零输入通过 / unverified / 放行判据·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T02:24:20.335Z，窗口 session-851897de-d884-4ab8-b689-160d66853eb4）

零输入裁决与底线落地：有结果即通过、无结果记未复核、放行判据加未复核

### 完成项

- resultOf 顺序固定为 第2问 → 第1问 → 该项 result，删掉证据兜底
- 回滚开关生效时恢复证据兜底旧口径
- applyVerdicts 的通过判据放宽为「意见或结果非空」
- 两者皆空不再抛错，改记 unverified（底线恢复可达）
- 有结果无意见时 opinion 取该项 result（留痕有出处）
- 放行判据加 unverified：不弹「验收通过并归档」
- 返回体加 unverified 计数并在工具 schema 声明
- 人改过结果的通过项写 result 与 resultSource=human
- RTM 门禁把 unverified 按待裁决计，不冒充放行
- 新增零输入用例 4 项；改写两处旧口径用例；十个相关文件 121 项全绿
- typecheck 退出码 0

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/use-cases/AcceptSheet.ts`
- `src/application/internal/verdicts.ts`
- `src/application/internal/accept-sheet-rtm-integration.ts`
- `src/tools/AcceptSheetTool/AcceptSheetTool.ts`
- `tests/accept-sheet-zero-input.test.ts`
- `tests/accept-sheet-tool.test.ts`
- `tests/domain/req-b918-gates.test.ts`

### 下一步

联调子卡：核对零输入口径与返回体形状在同一次真实调用里闭合

---
