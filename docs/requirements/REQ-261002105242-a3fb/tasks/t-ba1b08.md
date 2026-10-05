# t-ba1b08 清理僵尸归档入口 + 旧调用方收敛（兼容卡，无数据迁移）·研发

> 需求：REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

## 在做什么
清理僵尸归档入口 + 旧调用方收敛（兼容卡，无数据迁移）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T03:03:50.857Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

研发子卡完成：服务端早就没有的归档端点，客户端这边也彻底断了——按钮、事件分支、请求封装三处全清，人不会再点到一个必然报错的「归档」。

### 完成项

- src/client/api.ts：删掉归档请求封装（唯一调用方是 board-mount）
- src/client/board-mount.ts：删掉归档动作的事件分支
- src/client/views/stage-detail.ts：删掉 done + 材料已备 的归档按钮分支（t3 终态早退已覆盖，属死代码）
- src/client/views/verification.ts：done 分支文案从「请在详情头点『归档』」改为陈述事实（材料由窗口 agent 走 reqboard_submit(kind=archive)）
- 翻转两条编码了僵尸行为的既有用例：board-info-fixes「已完成且材料已备」、client-view 归档区用例
- 残留检查：grep -rn "archiveReq|archive-req" src 零输出（连注释里的字面量都清掉，避免未来 grep 误导）

### 改动文件

- `src/client/api.ts`
- `src/client/board-mount.ts`
- `src/client/views/stage-detail.ts`
- `src/client/views/verification.ts`
- `tests/board-info-fixes.test.ts`
- `tests/client-view.test.ts`

### 下一步

复核子卡

---
