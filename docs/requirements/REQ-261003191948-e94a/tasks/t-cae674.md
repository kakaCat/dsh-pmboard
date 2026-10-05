# t-cae674 看板报错区渲染可复制的迁移命令

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
看板报错区渲染可复制的迁移命令

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
pnpm build:client 退出码 0 且输出含 '[verify-client] OK'；新增断言（可写在 tests 或 build 后 node 校验）调用 buildError('检测到 legacy 单册', 'node --import tsx/esm scripts/migrate-ledger-v10.ts --apply') 的返回串同时含 message 与 hint 全文，且 buildError('x') 的返回串不含 'dsh-pm-error-hint'；grep src/client/board-mount.ts 断言 catch 分支把 ApiError.hint 传给了 buildError。

## 实施方案（implementation）
改 src/client/render/dom-utils.ts：buildError(message: string, hint?: string) 增第二可选参数；hint 非空时在既有 .dsh-pm-error 容器内追加「在终端执行：」标签与 <pre class="dsh-pm-error-hint">，message 与 hint 都继续走既有 esc() 转义（hint 含用户主目录路径）；hint 为空时输出与改动前逐字节相同。改 src/client/board-mount.ts：fetchAll 的 catch 分支改为 buildError(err instanceof ApiError ? err.message : String(err), err instanceof ApiError ? err.hint : undefined)。样式复用既有 .dsh-pm-error 令牌，不改 src/client/styles/。

## 上游产出摘要（dependsSummary）
- 客户端数据层透出服务端错误体

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T12:23:39.426Z，窗口 session-44207972-0dfc-41f4-89c0-01681149cd30）

t6 完成：看板报错区就地渲染原因与可复制命令块；补齐样式修正了居中导致的不可照抄问题。

### 完成项

- dom-utils buildError 增 hint 参数，渲染 pre 命令块（可框选复制）
- board-mount 失败分支传 ApiError.hint，不再只丢 String(err)
- message 与 hint 双走 esc()，含用户主目录路径不破 HTML
- 无 hint 时输出与改造前逐字节相同（既有调用点零影响）
- 发现并修复：新类名无样式且父容器居中会让命令不可照抄，base.ts 补 3 条规则
- 用例含转义断言与无 hint 断言

### 改动文件

- `src/client/render/dom-utils.ts`
- `src/client/board-mount.ts`
- `src/client/styles/base.ts`
- `tests/api-client.test.ts`

### 下一步

t7 回归与纪律核验

---
