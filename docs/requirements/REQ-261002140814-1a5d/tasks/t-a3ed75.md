# t-a3ed75 解锁留痕改写入 CommentRecord.body

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
解锁留痕改写入 CommentRecord.body

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① pnpm typecheck 2>&1 | grep ClearPause 无输出（TS2353『text does not exist in type CommentRecord』消失）；② grep -n "text:" src/application/use-cases/ClearPause.ts 无输出；③ 该 comments.push 的键集合 ⊆ {id, body, createdAt, createdBy}

## 实施方案（implementation）
src/application/use-cases/ClearPause.ts 的 req.comments.push({...})：键名 text → body，正文文案与 createdAt/createdBy 保持不变（正文仍为 `Dive 模式已解除锁定（reqboard_clear_pause）。之前状态：${previousActivation ?? 'none'}`）。不加 text 兼容字段、不做读侧回退、不回填历史台账。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T06:17:02.423Z，窗口 session-496379d5-446c-4a51-9710-2fe1ce0eb676）

解锁留痕从「写进去了但看板看不见」变成看得见：写入的字段名改成看板真正渲染的那一个，正文内容与作者不变。

### 完成项

- 留痕字段 text → body（CommentRecord 只声明 body，看板渲染读的也是 body）
- 评论正文与 createdBy 作者信息保持不变（缺值时正文显示 none）
- 未加兼容字段、未做读侧回退、未回填历史台账（避免第二个真相源）
- 本文件类型错误清零：TS2353 消失，6 条 → 0 条

### 改动文件

- `src/application/use-cases/ClearPause.ts`

### 下一步

t3 回归用例：断言 body 有文字且不存在 text 键

---
