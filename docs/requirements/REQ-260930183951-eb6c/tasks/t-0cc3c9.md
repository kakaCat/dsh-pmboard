# t-0cc3c9 系统项编号连续化（FR-3）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
系统项编号连续化（FR-3）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/sheet-items-format.test.ts tests/domain/acceptance-sheet.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts 全绿；断言 items.map(i => i.id) 严格等于 ['v1-1', …, 'v1-N']（N === items.length）；grep -c "taskCount +" src/domain/workflow/AcceptanceSheetSpec.ts 输出 0。

## 实施方案（implementation）
AcceptanceSheetSpec.buildSheet 去掉 taskCount + N 五个预留位，改为先按最终顺序组装 ItemDraft[]（任务项 → 需求级 → 孤儿 → 不可照验 → E2E → 三方一致性 → 锚点失效 → 追溯断链）再一次性分配 id = v<version>-<n>；reworkOnly 分支同样连续；tests/sheet-items-format.test.ts 覆盖 TC-3.1~3.4（含 2d65 事故形态回归）。

## 上游产出摘要（dependsSummary）
- 验收锚点存在性守卫（FR-2）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T12:32:37.274Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

验收单编号连续了：不再出现「少了两项」的跳号，人按编号引用验收项时不会指向错行。

### 完成项

- 验收单编号改为「按最终顺序连续分配」：5 个 taskCount+N 预留位全部清除，未触发的类别不再占号
- 用例：tests/sheet-items-format.test.ts 7/7（含 TC-3.2「只触发 E2E 不跳号」的事故形态回归）；整链用例通过
- 子卡链 4 段（研发→联调→复核→测试）全部完成并逐段留证

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `tests/sheet-items-format.test.ts`

### 下一步

关闭 t3，进入 FR-4（t4）卡链。

---
