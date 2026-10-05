# t-4b4fcd 回归确认：防呆断言 + 反向演练 + 基线比对·测试

> 需求：REQ-261004095621-c167 定位并修复：模型选择器点击后消失（DSH 席位崩溃取证）

## 在做什么
回归确认：防呆断言 + 反向演练 + 基线比对·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T02:21:06.094Z，窗口 session-d649acde-c276-4061-88cd-a33f5142ef52）

测试完成：四条命令的实际输出都在这里，结论是回归口径全部达标、没有任何新增失败。

### 完成项

- 测试子卡执行完毕，命令与结果逐条留痕
- 命令一：pnpm vitest run tests/kb-client-page.test.ts tests/client-page-panel.test.ts tests/panel-icon.test.ts tests/client-page-register.test.ts → 4 文件 20 passed
- 命令二（反向演练）：图标改回裸对象后 pnpm vitest run tests/kb-client-page.test.ts → 1 failed / 5 passed，失败信息 expected undefined to be Symbol(react.element)；随后还原并校验 sha256 一致
- 命令三：npx tsc --noEmit | grep -c 'error TS' → 144（存量基线，零新增）
- 命令四：pnpm test → 98 failed / 3637 passed / 20 skipped；失败文件 48 个，与开工基线集合逐行一致（diff 为空）
- 结论：回归口径全部达标，无新增红

---
