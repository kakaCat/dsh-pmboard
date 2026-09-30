# t-d462dd 任务投影单点：透传 parentId（FR-1）·研发

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
任务投影单点：透传 parentId（FR-1）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/sheet-projection.test.ts → 4 passed (4)；grep -c "toSheetTasks" src/application/use-cases/SubmitVerification.ts ≥ 1；证伪检查：临时删掉 toSheetTasks 返回对象里的 parentId 透传后重跑该文件 → TC-1.1 必须失败（实测 2 failed | 2 passed）

## 汇报 1（2026-09-30T12:28:02.679Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

子卡的 parentId 不再在投影处丢：验收单生成的最后一环从「过滤恒等通过」变成真的过滤——并且用「删掉就变红」的方式证明了这条用例真的在守它。

### 完成项

- 新增投影单点 src/application/internal/sheet-tasks.ts（剔 canceled、保持顺序、parentId 空串/缺省不写键），SubmitVerification 的内联投影改走它
- 新增 tests/sheet-projection.test.ts 4 条用例（TC-1.1 透传 / TC-1.2 空串归一 / TC-1.3 canceled 剔除 / TC-1.4 投影产物过 domain 过滤只剩父卡）
- 证伪检查（真做了一遍）：临时删掉投影里的 parentId 透传行 → TC-1.1 与 TC-1.4 变红（2 failed | 2 passed）；恢复后 4 passed (4)
- grep 复核：SubmitVerification 内已无内联 acceptance: t.acceptance 投影

### 改动文件

- `src/application/internal/sheet-tasks.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/sheet-projection.test.ts`

### 下一步

联调段：确认投影改动在验收单生成整链上生效（1 父 3 子只出父卡项）。

---
