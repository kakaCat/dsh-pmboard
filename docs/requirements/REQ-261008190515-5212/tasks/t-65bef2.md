# t-65bef2 让 implementing 退出 vendor 镜像表·测试

> 需求：REQ-261008190515-5212 把 implementing 移出 vendor 镜像并改写自写实施档

## 在做什么
让 implementing 退出 vendor 镜像表·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-08T11:18:36.841Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

测试段：三条验收判据全部实际跑过并留读数，全绿

### 完成项

- 验收①：node -e 打印 VENDOR_MAIN_SKILLS keys = accepting,archived
- 验收②：grep -c executing-plans 两个文件均为 0
- 验收③：npx vitest run tests/prompt-tiers.test.ts 37 passed（④ 组只剩 2 条）
- git diff --stat：2 files changed, 47 insertions(+), 30 deletions(-)

### 下一步

父卡收口后进入下一张 ready 卡 t-ed16b0

---
## 汇报 2（2026-10-08T11:20:57.761Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

测试段：类型检查 0 错；全量失败数 18 ≤ 基线 68；新增 3 条为弹框超时语义（非本卡引入），故只登记不刷新基线

### 完成项

- npx tsc --noEmit：退出码 0，error TS 0 条（等于基线）
- pnpm baseline:check：本轮失败 18 条 ≤ 基线 68 条
- 本轮新增失败 3 条，逐条定位：capture-interactions t5 与 confirm-repost t4 两条，全是立项弹框等到点未作答的 pending 与中立回执语义
- 3 条新增与映射表改动零交集（不涉任何提示词分片）：属工作树在飞的弹框改动，不刷新基线、不代他人落账
- 本卡直接相关断言：npx vitest run tests/prompt-tiers.test.ts 37 passed

### 下一步

父卡 t-1a2d1e 收口后接下一张 ready 卡

---
