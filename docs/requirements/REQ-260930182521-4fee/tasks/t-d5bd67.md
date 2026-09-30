# 六阶段色板收敛为单一常量源·研发

> 任务 id：t-d5bd67 · 阶段：dev · 父卡：t-286f8c

## 实施方案

serves: FR-1。落地 STAGE_COLORS 与取色函数改写。

## 验收标准

tests/stage-colors.test.ts -t 色板 通过；旧色值 grep 零命中。

## 完工记录（第 1 次汇报）

研发段完成：六阶段颜色收敛为唯一来源 STAGE_COLORS。

**完成项**
- 新增 STAGE_COLORS + 类型
- 取色函数改读它
- 删除旧色板

**改动文件**
- src/client/dag/card-types.ts

> 本卡文档于任务存储被外部清理后按真实执行记录重建。
