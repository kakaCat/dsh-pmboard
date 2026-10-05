# t-cac573 列表行 markup 加滚动容器与列类名契约·测试

> 需求：REQ-260930194112-1ab8 列表视图自适应修复：窄宽度下列被压缩换行、操作按钮重叠

## 在做什么
列表行 markup 加滚动容器与列类名契约·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed（TC-1 滚动容器 / TC-2 列类名成对 / TC-3 colspan="8" 不变 / TC-5 空列表分支无表格）。

## 汇报 1（2026-09-30T14:12:33.905Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

测试结论：契约四条断言全绿，静默失效点（空列表、分组头）已专门覆盖——就是说，结构层面已经可以放心让后续样式规则去驱动宽度行为了。

### 完成项

- TC-1/TC-2/TC-3/TC-5 四条用例全绿（vitest run tests/list-responsive.test.ts → 4 passed）
- 边界复核：空列表分支不含 <table 与 wrap；分组头行不带列类名且 colspan="8" 保持
- 类型检查：tsc --noEmit 对本文件与用例文件无报错
- 全套回归基线比对：新增用例使总数 2765→2769（+4 passed），失败数保持 103（与本卡无关的在飞需求所致）

### 改动文件

- `tests/list-responsive.test.ts`
- `src/client/views/board.ts`

### 下一步

父卡 t-8479b2 收尾后进入 t2（样式与两档断点）

---
