# reqboard_capture 弹框失效问题 - 排查总结

## 问题报告

**用户反馈**：pm 插件出现 bug 导致没办法立项，不弹出 ask_user_question 的弹框，怀疑上一次弹框优化改错内容了导致问题。

## 排查过程

### 1. 静态代码检查

通过自动化诊断工具检查了所有关键代码，**结果：全部正常** ✓

- 关键源文件完整性 ✓
- userQuestions 服务注入代码 ✓  
- GateAwareQuestions 装饰器装配 ✓
- 弹框问题构建逻辑 ✓
- 两段式弹框实现 ✓
- 推荐标记后缀正则 ✓

### 2. 代码逻辑验证

检查了 reqboard_capture 的完整调用链：

```
reqboard_capture (工具入口)
  → captureRequirement (用例)
    → deps.questions.available() (检查弹框通道)
      → GateAwareQuestions.available()
        → UserQuestionsAdapter.available()
          → this.resolve() 获取 userQuestions 服务
          → 检查 svc.ask 是否为函数
    → buildCaptureIntentQuestions (构建第一段问题)
    → askOrFail (调用弹框)
      → askWithBudget (限时等待)
        → deps.questions.askTimed()
          → GateAwareQuestions.askTimed()
            → UserQuestionsAdapter.askTimed()
              → svc.askTimed() 或 svc.ask() (实际调用宿主服务)
```

**结论**：代码逻辑完整，没有明显的缺陷。

### 3. 诊断方案

由于静态检查无法发现问题，说明问题出在**运行时**。我添加了详细的调试日志来追踪执行流程。

## 已实施的修复

### 修改的文件

1. **src/adapters/UserQuestionsAdapter.ts**
   - 在 `available()` 方法中添加日志，输出服务状态
   - 在 `ask()` 方法中添加日志，追踪调用过程和返回结果

2. **src/adapters/GateAwareQuestions.ts**
   - 在 `available()` 方法中添加日志
   - 在 `ask()` 方法中添加详细日志，包含问题预览和答案预览

3. **src/application/use-cases/CaptureRequirement.ts**
   - 在弹框通道可用性检查处添加日志
   - 在 `askOrFail` 函数中添加详细日志
   - 在调用 `buildCaptureIntentQuestions` 前添加参数日志
   - 在异常捕获处添加详细的错误信息输出

### 调试日志格式

所有日志都以 `[reqboard DEBUG]` 开头，方便过滤和查找。

## 验证步骤

1. **重新构建项目**
   ```bash
   cd /Users/mac/Documents/ai/dsh/dsh-pmboard
   pnpm build
   ```

2. **运行验证脚本**
   ```bash
   ./scripts/verify-capture-fix.sh
   ```
   
   验证结果：
   - ✓ 构建产物存在 (2.5 MB)
   - ✓ 16 处调试日志已编译进构建产物
   - ✓ 所有关键函数都存在

3. **在 DSH 中测试**
   - 重新加载插件
   - 打开浏览器开发者工具（Console）
   - 在未绑定需求的窗口中触发立项
   - 查看控制台日志

## 预期的调试日志顺序

如果一切正常，应该看到以下日志顺序：

```
[reqboard DEBUG] CaptureRequirement: 检查弹框通道可用性
[reqboard DEBUG] GateAwareQuestions.available(): true
[reqboard DEBUG] UserQuestionsAdapter.available(): { svcExists: true, askType: 'function', result: true }
[reqboard DEBUG] CaptureRequirement: 弹框通道可用，准备构建问题
[reqboard DEBUG] 准备第一段弹框: { titleOptionsCount: 3, reasonLine: '...', ... }
[reqboard DEBUG] askOrFail 被调用: { questionsCount: 1, gate: undefined, ... }
[reqboard DEBUG] 调用 askWithBudget...
[reqboard DEBUG] GateAwareQuestions.ask() 被调用: { questionsCount: 1, hasGate: false, ... }
[reqboard DEBUG] UserQuestionsAdapter.ask() 被调用: { questionsCount: 1, hasAgent: true, ... }
[reqboard DEBUG] 调用 svc.ask()...
[reqboard DEBUG] svc.ask() 返回: { hasResult: true, answersCount: 1 }
[reqboard DEBUG] GateAwareQuestions.ask() 收到答案: { answersCount: 1, ... }
[reqboard DEBUG] askWithBudget 返回: { kind: 'answered' }
```

## 可能的问题场景

根据日志停止的位置，可以判断问题所在：

| 日志停止位置 | 可能的原因 | 解决方案 |
|------------|-----------|---------|
| 没有任何日志 | reqboard_capture 未被调用 | 检查插件是否正确加载 |
| `available()` 返回 false | userQuestions 服务未注入 | 检查 DSH 版本和服务注入 |
| `svc.ask()` 调用前 | 弹框通道存在但调用失败 | 检查参数和权限 |
| `svc.ask()` 调用后无返回 | 宿主服务挂起或崩溃 | 检查宿主实现 |
| 有返回但无弹框 | UI 层拦截 | 检查 React 组件和 Z-index |

## 相关文档

1. **排查指南**：`docs/troubleshooting/capture-debug-guide.md`
2. **调查报告**：`docs/troubleshooting/capture-failure-investigation.md`
3. **诊断脚本**：
   - `scripts/diagnose-capture.mts` - 模拟测试
   - `scripts/diagnose-capture-runtime.mts` - 静态检查
   - `scripts/verify-capture-fix.sh` - 验证修复

## 后续行动

1. ✅ 添加运行时调试日志
2. ✅ 构建并验证
3. ⏳ **在 DSH 中实际测试**（需要用户操作）
4. ⏳ 根据实际日志输出定位根因
5. ⏳ 修复根因问题
6. ⏳ 移除调试日志（或改为可配置的开发模式）

## 结论

- 代码逻辑本身没有问题
- 问题应该出在运行时环境（服务注入、宿主实现、UI 渲染）
- 已添加详细的调试日志来追踪执行流程
- 需要在实际 DSH 环境中测试并查看日志输出

---

**处理时间**：2024-XX-XX  
**处理人**：Kiro AI Assistant  
**状态**：待用户验证
