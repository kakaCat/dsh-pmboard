# t-ccf428 点已归档窗口能回到那个会话：先取消归档、再打开·研发

> 需求：REQ-261002153446-c600 看板窗口 chip：已归档会话点击后取消归档并打开

## 在做什么
点已归档窗口能回到那个会话：先取消归档、再打开·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T07:40:33.712Z，窗口 session-4c565f55-a7af-4e7f-8b37-5033c0c2a255）

研发完成：点已归档窗口 chip 时，先取消归档把会话恢复出来，再走既有跳转打开它

### 完成项

- session-jump.ts 新增 restoreIfArchived：命中归档集合先调 workspaces.unarchiveSession
- 恢复成功才继续 selectPanel(null)+openSession，顺序与既有实现一致
- 新增结果态 restore-failed（恢复抛错不打开）；能力缺失保留 archived
- handleSessionJump 去掉提前 alert 拦截，判定收敛到一处

### 改动文件

- `src/client/session-jump.ts`
- `tests/session-jump.test.ts`

### 下一步

测试子卡核对时间线语义

---
