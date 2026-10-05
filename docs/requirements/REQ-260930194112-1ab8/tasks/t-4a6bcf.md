# t-4a6bcf 列表视图自适应样式与两档让位断点·研发

> 需求：REQ-260930194112-1ab8 列表视图自适应修复：窄宽度下列被压缩换行、操作按钮重叠

## 在做什么
列表视图自适应样式与两档让位断点·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `grep -c "min-width: 720px" src/client/styles/board.ts` 与 `grep -c "max-width: 880px" src/client/styles/board.ts` 均 ≥1；并跑 `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed。

## 汇报 1（2026-09-30T14:14:34.799Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

这一步做完，窄屏下「列被压成单字宽、按钮叠字」的**成因被掐断**：关键列不再换行、按钮整块不许被压缩、表格窄到一定程度改为整体横向滚动；同时宽度不够时自动让出分类/负责人/更新时间（再窄让出进度），宽屏照旧显示全部 8 列。

### 完成项

- styles/board.ts 追加自适应规则：表格外层 overflow-x: auto + 表格 min-width: 720px（保底横向滚动）
- 关键列 nowrap、标题列例外并保底 220px（不再被压成每行 5~7 字）
- 操作列按钮组 flex: none + min-width: max-content（取消/会话不再叠字）
- 两档宽度让位：≤1180px 让出分类/负责人/更新时间并解除标题 380px 上限；≤880px 再让出进度
- 补 TC-4 静态断言：vitest run tests/list-responsive.test.ts → 5 passed
- 全套回归：49 failed files / 103 failed tests，与本卡开工前基线完全一致（无新增失败）

### 改动文件

- `src/client/styles/board.ts`
- `tests/list-responsive.test.ts`

### 下一步

复核子卡逐条比对设计 interfaces.md I-3 的规则清单；随后由测试子卡与 t3 探针在真实渲染中验证

---
