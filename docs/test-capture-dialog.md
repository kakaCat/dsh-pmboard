# 测试弹框功能

## 当前状态

- ✅ 代码已添加 16 处调试日志
- ✅ 项目已构建（dist/index.mjs 2.5 MB）
- ✅ DSH 已重启

## 测试步骤

### 方法 1：让我触发立项（推荐）

在本对话窗口中对我说：

```
帮我实现一个用户管理功能
```

或者任何需要立项的新工作，我会自动调用 `reqboard_capture`。

### 方法 2：直接在 DSH Console 测试

打开浏览器开发者工具（F12），在 Console 中执行：

```javascript
// 确认插件已加载
console.log('reqboard 版本:', window.__REQBOARD_VERSION__ || 'unknown');

// 直接调用（需要 agent 上下文）
// 注意：这个方法可能不可行，因为需要正确的 agent 上下文
```

### 方法 3：通过 agent 命令触发

在 DSH 的输入框中输入：

```
pm，帮我创建一个新功能
```

然后观察：
1. 控制台是否有 `[reqboard DEBUG]` 日志
2. 是否弹出立项弹框

## 预期结果

如果一切正常，你应该看到：

1. **控制台日志**（按顺序）：
   ```
   [reqboard DEBUG] CaptureRequirement: 检查弹框通道可用性
   [reqboard DEBUG] GateAwareQuestions.available(): true
   [reqboard DEBUG] UserQuestionsAdapter.available(): { svcExists: true, ... }
   [reqboard DEBUG] CaptureRequirement: 弹框通道可用，准备构建问题
   [reqboard DEBUG] 准备第一段弹框: { ... }
   [reqboard DEBUG] askOrFail 被调用: { ... }
   ...
   ```

2. **立项弹框**出现，包含：
   - 问题：「需求名称」
   - 3 个候选选项（首个带「推荐」标记）
   - 「⚡ 全部按推荐值立项」一键过选项
   - 「✖️ 不需要立项」拒绝选项

## 如果弹框没出现

请把**完整的控制台日志**（所有 `[reqboard DEBUG]` 开头的行）复制给我，格式如下：

```
[reqboard DEBUG] CaptureRequirement: 检查弹框通道可用性
[reqboard DEBUG] GateAwareQuestions.available(): false
...（所有日志）
```

我会立即根据日志定位问题并给出修复方案。

---

**现在你可以：**
- 对我说"帮我做个 XX 功能"，我会触发立项
- 或者手动在 DSH 中测试并把日志发给我
