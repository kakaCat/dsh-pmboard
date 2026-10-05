# t-99dc0a 列表行 markup 加滚动容器与列类名契约·研发

> 需求：REQ-260930194112-1ab8 列表视图自适应修复：窄宽度下列被压缩换行、操作按钮重叠

## 在做什么
列表行 markup 加滚动容器与列类名契约·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → TC-1/TC-2/TC-3/TC-5 全部通过（4 passed）；并 `git diff -- src/client/views/board.ts` 中可见 `<div class="dsh-pm-table-wrap">` 与 4 个列类名（dsh-pm-col-cat / -progress / -owner / -when）成对出现在 th 与 td 上。

## 汇报 1（2026-09-30T14:12:11.980Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

列表行的结构骨架就位：表格外面多了一层可横向滚动的容器，四个次要列（分类/进度/负责人/更新时间）在表头与每行数据上都打好了统一的列标记——这是后续「窄屏自动让位、宽屏照旧」能生效的前提。列表宽窄两种情况下输出的列数与分组口径完全没变。

### 完成项

- buildListView 非空分支把表格包进 .dsh-pm-table-wrap（空结果分支保持原样）
- 表头 4 个 th 与 renderListCard 的 4 个 td 成对加列类名：dsh-pm-col-cat / -progress / -owner / -when
- 分组头行 colspan="8" 与列数口径保持不变，分组头不带列类名
- 新增 tests/list-responsive.test.ts 的 TC-1/TC-2/TC-3/TC-5

### 改动文件

- `src/client/views/board.ts`
- `tests/list-responsive.test.ts`

### 下一步

等复核子卡确认契约无遗漏后，进入测试子卡；样式行为由 t2 承接

---
