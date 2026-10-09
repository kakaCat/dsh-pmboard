# 拆分计划：修复 PM 插件立项弹框功能失效问题

## 目标

恢复 PM 插件的弹框功能，使 `reqboard_capture`、`reqboard_ask_confirm` 和 `reqboard_accept_sheet` 能够在会话中正常弹出并接收用户作答。

## 做法

根据根因分析，修复方案为：在 `package.json` 的 `dsh.client.inject` 数组中添加 `userQuestions` 服务声明，重新构建客户端代码，并重启 DSH 应用加载新配置。

## 任务表

| 计划 key | 标题 | 阶段 | 端侧 | 依赖 | 实施方案 | 验收标准 | 工作量 |
|---------|------|------|------|------|----------|----------|--------|
| t1 | 修改 package.json 添加服务声明 | implement | frontend | - | 在 `package.json` 第 77 行的 `dsh.client.inject` 数组中添加 `"userQuestions"` 声明。修改 1 个文件，添加 1 行代码。| 运行 `git diff package.json` 确认已在 inject 数组中添加 userQuestions | files=1, anchors=1, chars=50 |
| t2 | 重新构建客户端 | implement | frontend | t1 | 运行 `pnpm build:client` 重新构建客户端代码，生成包含新配置的 `lib/client.js`。验证构建过程无报错。| 构建成功，输出 `lib/client.js` 文件大小约 785KB，构建日志显示 "Build complete" | files=1, anchors=1, chars=100 |
| t3 | 验证修复效果 | test | fullstack | t2 | 重启 DSH 应用，在会话中调用 `reqboard_capture` 工具，观察是否在会话中弹出立项弹框，尝试作答并验证能否成功立项。检查浏览器控制台确认 `userQuestions service ready` 日志出现。| 调用 `reqboard_capture` 后在会话中弹出立项弹框，可以正常作答并成功立项，控制台显示 `userQuestions service ready` 日志 | files=1, anchors=2, chars=200 |

## 改动盘点

**新增**：无

**修改**：
- `package.json`：`dsh.client.inject` 数组添加 `"userQuestions"` 元素

**删除**：无

## 容量核算

- t1: 1×1 + 1×0.5 + 50/2000 = 1.525 DU
- t2: 0×1 + 1×0.5 + 100/2000 = 0.55 DU  
- t3: 0×1 + 2×0.5 + 200/2000 = 1.1 DU

总计：3.175 DU，在默认容量 16 DU 范围内，无需拆分。
