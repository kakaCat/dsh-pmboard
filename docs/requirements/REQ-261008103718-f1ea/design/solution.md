# 修复方案设计 <!-- serves: FR-1 -->

## 问题定位 <!-- serves: FR-1 -->

**根因**：`package.json` 的 `dsh.client.inject` 配置中缺少 `userQuestions` 服务声明

DSH 的客户端插件系统要求在配置中显式声明依赖的服务。当服务端通过 `ctx.inject(['userQuestions'], callback)` 注入服务时，如果客户端配置中没有声明这个依赖，服务将在客户端上下文中不可用。

## 修复方案 <!-- serves: FR-1 -->

### 修改点 <!-- serves: FR-1 -->

**文件**：`package.json`

**修改**：在 `dsh.client.inject` 数组中添加 `"userQuestions"`

```diff
  "dsh": {
    "client": {
      "platform": "web",
      "inject": [
        "slots",
        "sessions",
        "workspaces",
        "layout",
+       "userQuestions"
      ]
    }
  }
```

### 构建步骤 <!-- serves: FR-1 -->

1. 修改 `package.json`
2. 运行 `pnpm build:client` 重新构建客户端
3. 重启 DSH 应用加载新的客户端代码

### 验证方法 <!-- serves: FR-1 -->

**前置条件**：重启 DSH 应用后

**测试步骤**：
1. 在会话中调用 `reqboard_capture` 工具
2. 观察是否弹出立项弹框
3. 在弹框中作答
4. 验证是否成功创建需求

**预期结果**：弹框正常显示，可以作答，成功立项

## 影响分析 <!-- serves: FR-1 -->

- **修改范围**：1 个文件，1 行添加
- **风险评估**：低风险，仅添加服务声明，不修改业务逻辑
- **回滚方案**：移除该行声明，重新构建客户端
