# t-1d8bbd 五档宽度布局回归探针（headless Chrome）·测试

> 需求：REQ-260930194112-1ab8 列表视图自适应修复：窄宽度下列被压缩换行、操作按钮重叠

## 在做什么
五档宽度布局回归探针（headless Chrome）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `npx tsx scripts/list-responsive-probe.mts` → 退出码 0、末行 PROBE PASS；再跑负向验证：把 `src/client/styles/board.ts` 里 `min-width: 720px` 改为 `2000px`，同一命令必须输出 PROBE FAIL 且退出码 1，改回后复跑回到 PROBE PASS。

## 汇报 1（2026-09-30T14:21:48.885Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

测试结论：探针**正反两面都验过**——正常状态五档全绿；一旦有人把保底宽度改坏，它会立刻报出「哪几档开始出现横向滚动」并返回失败码。也就是说这个检测器不是摆设。

### 完成项

- 正向：npx tsx scripts/list-responsive-probe.mts → 5 行 DIAG 全 problems=NONE、末行 PROBE PASS、退出码 0
- 正向数值：640 cols=4 titleW=282 overflowX=true / 760 cols=4 / 840 cols=4 titleW=362 / 1080 cols=5 titleW=430 / 1680 cols=8 titleW=540
- 负向验证：把 styles/board.ts 的 min-width: 720px 临时改为 2000px 重跑 → 4 条档位不匹配全部报出（横向滚动 true ≠ 期望 false）、末行 PROBE FAIL、退出码 1（探针确实会红）
- 恢复校验：还原后复跑 → PROBE PASS、退出码 0；git diff --stat 确认 styles/board.ts 回到 +40 行净增

### 改动文件

- `scripts/list-responsive-probe.mts`

### 下一步

t4 采集对照截图并核对改动面/回滚面

---
