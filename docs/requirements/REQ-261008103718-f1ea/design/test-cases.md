# 测试用例 <!-- serves: FR-1 -->

## TC-1: 验证服务声明添加 <!-- serves: FR-1 --> <!-- covers: t-c5da35 -->

**前置条件**：修改 package.json

**步骤**：
1. 运行 `git diff package.json`
2. 检查 dsh.client.inject 数组

**预期结果**：数组中包含 "userQuestions"

## TC-2: 验证客户端构建 <!-- serves: FR-1 --> <!-- covers: t-04b737 -->

**前置条件**：完成 TC-1

**步骤**：
1. 运行 `pnpm build:client`
2. 检查构建输出

**预期结果**：
- 构建成功无报错
- 生成 lib/client.js (约 785KB)

## TC-3: 验证弹框功能恢复 <!-- serves: FR-1 --> <!-- covers: t-57b07b -->

**前置条件**：完成 TC-2 并重启 DSH

**步骤**：
1. 在会话中输入需要立项的内容
2. Agent 调用 `reqboard_capture` 工具
3. 观察会话中是否出现弹框
4. 在弹框中作答
5. 检查浏览器控制台日志

**预期结果**：
- 弹框在会话中正常显示
- 可以作答并成功立项
- 控制台显示 "userQuestions service ready"
