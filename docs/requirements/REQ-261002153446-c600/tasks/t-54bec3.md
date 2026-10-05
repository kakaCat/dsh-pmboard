# t-54bec3 点之前就看得见会发生什么：chip 与失败提示的文案

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
点之前就看得见会发生什么：chip 与失败提示的文案

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/board-info-fixes.test.ts 通过：已归档 chip 的 HTML 含 data-archived="true" 且 title 含「点击取消归档并打开」；jumpResultMessage('restore-failed', sid) 包含「取消归档失败」；jumpResultMessage('unavailable', sid) 包含「暂不可用」

## 实施方案（implementation）
改 src/client/render/dom-utils.ts：sessionChipHtml 的 archived 分支 title 改为 `${kind}已归档（${sid}）：点击取消归档并打开`（类名/属性不变，仍是可点 jump-session 按钮）。改 src/client/board-mount.ts：jumpResultMessage 增 case 'restore-failed' 返回「取消归档失败（sid）：会话未恢复，未跳转（可到会话列表手动恢复后重试）」；case 'archived' 补「客户端不支持取消归档」；case 'unavailable' 文案含「暂不可用」。验证：npx vitest run tests/board-info-fixes.test.ts

## 上游产出摘要（dependsSummary）
- 点已归档窗口能回到那个会话：先取消归档、再打开

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T07:40:52.049Z，窗口 session-4c565f55-a7af-4e7f-8b37-5033c0c2a255）

这一步做完：人点之前就知道会发生什么——已归档的窗口/会话 chip 上写着「点击取消归档并打开」；万一恢复没成功，提示也说得清是「取消归档失败、没有跳转」，并告诉人去会话列表手动恢复

### 完成项

- chip title 改为「点击取消归档并打开」，仍是可点的 jump-session 按钮
- jumpResultMessage 增 restore-failed 文案，archived/unavailable 措辞改写
- 子卡链（研发 + 测试）完成，board-info-fixes 18 passed

### 改动文件

- `src/client/render/dom-utils.ts`
- `src/client/board-mount.ts`
- `tests/board-info-fixes.test.ts`

### 下一步

t3 兼容与回归验证

---
