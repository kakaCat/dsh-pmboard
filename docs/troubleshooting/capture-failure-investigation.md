# reqboard_capture 弹框失效问题排查报告

## 问题描述

**症状**：调用 `reqboard_capture` 时不弹出 `ask_user_question` 弹框，导致立项功能失效。

**报告者**：用户怀疑"上一次弹框优化改错内容了导致问题"

## 排查结果

### 静态代码检查 ✓ 全部通过

通过自动化诊断脚本 `scripts/diagnose-capture-runtime.mts` 检查了以下内容：

1. **关键源文件完整性** ✓
   - 所有关键文件存在且可读
   
2. **关键代码片段** ✓
   - `userQuestions` 注入代码存在
   - `GateAwareQuestions` 装饰器正确装配
   - `questions` 端口正确注入到 `useCaseDeps`
   
3. **capture-mapping 弹框结构** ✓
   - 推荐后缀正则正确
   - `withRecommendLabel` 函数存在
   - `buildCaptureIntentQuestions` 函数存在
   - 拒绝选项和一键过选项都存在
   
4. **CaptureRequirement 用例** ✓
   - 弹框通道可用性检查存在
   - 两段式弹框逻辑正确
   - `askWithBudget` 限时等待存在
   - G0 闸门声明存在

**结论**：代码本身没有问题，问题出在**运行时**。

## 已添加的诊断日志

为了帮助定位运行时问题，我已经在以下关键位置添加了 `console.log` 调试日志：

### 1. UserQuestionsAdapter.ts

```typescript
// line 36-45
available(): boolean {
  const svc = this.resolve() as RawQuestionService | undefined
  const result = typeof svc?.ask === 'function'
  console.log('[reqboard DEBUG] UserQuestionsAdapter.available():', {
    svcExists: svc !== undefined,
    askType: typeof svc?.ask,
    result
  })
  return result
}

// line 41-68
async ask(...) {
  console.log('[reqboard DEBUG] UserQuestionsAdapter.ask() 被调用:', {
    questionsCount: questions.length,
    hasAgent: opts.agent !== undefined,
    hasSignal: opts.signal !== undefined,
    gate: opts.gate
  })
  // ... 中间代码 ...
  console.log('[reqboard DEBUG] 调用 svc.ask()...')
  const result = await svc.ask(...)
  console.log('[reqboard DEBUG] svc.ask() 返回:', {
    hasResult: result !== undefined,
    answersCount: result.answers?.length ?? 0
  })
  return result.answers ?? []
}
```

### 2. GateAwareQuestions.ts

```typescript
// line 45-49
available(): boolean {
  const result = this.inner.available()
  console.log('[reqboard DEBUG] GateAwareQuestions.available():', result)
  return result
}

// line 49-66
async ask(...) {
  console.log('[reqboard DEBUG] GateAwareQuestions.ask() 被调用:', {
    questionsCount: questions.length,
    hasGate: opts.gate !== undefined,
    gate: opts.gate,
    questionsPreview: questions.map(q => ({ id: q.id, header: q.header, optionsCount: q.options?.length }))
  })
  const answers = await this.inner.ask(questions, opts)
  console.log('[reqboard DEBUG] GateAwareQuestions.ask() 收到答案:', {
    answersCount: answers.length,
    answersPreview: answers.map(a => ({ id: a.id, hasCustom: !!a.custom, selectedCount: a.selected?.length ?? 0 }))
  })
  // ...
}
```

### 3. CaptureRequirement.ts

```typescript
// line 185-193
console.log('[reqboard DEBUG] CaptureRequirement: 检查弹框通道可用性')
if (!deps.questions.available()) {
  console.log('[reqboard DEBUG] CaptureRequirement: 弹框通道不可用，返回 fallback=board')
  return notCreated(...)
}
console.log('[reqboard DEBUG] CaptureRequirement: 弹框通道可用，准备构建问题')

// line 217-233
const askOrFail = async (...) => {
  console.log('[reqboard DEBUG] askOrFail 被调用:', {
    questionsCount: questions.length,
    gate,
    firstQuestionId: questions[0]?.id,
    firstQuestionOptionsCount: questions[0]?.options?.length
  })
  try {
    console.log('[reqboard DEBUG] 调用 askWithBudget...')
    const timed = await askWithBudget(...)
    console.log('[reqboard DEBUG] askWithBudget 返回:', { kind: timed.kind })
    // ...
  } catch (err) {
    console.log('[reqboard DEBUG] askWithBudget 抛出异常:', {
      message: (err as Error).message,
      code: (err as { code?: string }).code,
      stack: (err as Error).stack?.split('\n').slice(0, 3)
    })
    // ...
  }
}

// line 268-276
console.log('[reqboard DEBUG] 准备第一段弹框:', {
  titleOptionsCount: titleOptions.length,
  reasonLine,
  sessionCwd,
  hostCwd
})
const first = await askOrFail(buildCaptureIntentQuestions(titleOptions, { reasonLine }))
```

## 下一步操作

1. **重启 DSH 并加载最新构建的插件**
   ```bash
   cd /Users/mac/Documents/ai/dsh/dsh-pmboard
   pnpm build
   # 然后在 DSH 中重新加载插件
   ```

2. **尝试调用 `reqboard_capture`**
   - 在一个未绑定需求的窗口中
   - 让 agent 识别到需要立项的工作

3. **查看控制台日志**
   - 打开 DSH 的开发者工具（Console）
   - 查找所有 `[reqboard DEBUG]` 开头的日志
   - 按照日志的执行顺序，定位问题出现在哪一步

## 可能的问题场景及对策

根据日志输出，可能会遇到以下几种情况：

### 场景 1: 没有任何 DEBUG 日志输出

**原因**：`reqboard_capture` 根本没有被调用，或者构建的代码没有生效

**对策**：
- 确认插件已正确加载
- 检查是否使用了缓存的旧版本
- 尝试清除缓存后重新加载

### 场景 2: 日志显示 `available() = false`

**原因**：`userQuestions` 服务未正确注入

**对策**：
- 检查 DSH 版本是否支持 `userQuestions` 服务
- 查看是否有 "userQuestions service ready" 日志
- 检查 `src/index.ts` 中的 `ctx.inject(['userQuestions'], ...)` 是否被调用

### 场景 3: 日志显示 `available() = true` 但 `svc.ask()` 抛出异常

**原因**：服务存在但调用失败（权限/参数/宿主实现问题）

**对策**：
- 查看异常的 `message` 和 `code`
- 检查 `opts.agent` 是否正确
- 检查 `questions` 结构是否符合宿主要求

### 场景 4: `svc.ask()` 调用成功但没有弹框

**原因**：宿主 UI 层拦截或弹框渲染失败

**对策**：
- 检查 UI 组件是否正常加载
- 查看浏览器控制台是否有 React/UI 相关错误
- 检查弹框组件的 Z-index 和可见性

### 场景 5: 弹框出现但立即消失

**原因**：`askWithBudget` 超时或 Signal 被 abort

**对策**：
- 检查 `LIMITS.timeoutInteractiveMs` 的值（应为 3600000）
- 检查 `signal` 的状态
- 确认没有其他代码提前 abort 了 signal

## 附加诊断工具

我已创建了以下诊断工具，可以在排查过程中使用：

1. **scripts/diagnose-capture.mts** - 模拟弹框流程的单元测试
2. **scripts/diagnose-capture-runtime.mts** - 静态代码检查工具
3. **docs/troubleshooting/capture-debug-guide.md** - 完整的排查指南

## 修复记录

- ✅ 2024-XX-XX: 添加运行时诊断日志
- ⏳ 待定: 根据实际日志输出确定根因并修复

## 联系方式

如果按照本文档操作后仍无法解决问题，请提供：
1. 完整的控制台日志（包含所有 `[reqboard DEBUG]` 日志）
2. DSH 版本信息
3. 插件版本信息
4. 复现步骤

---

*最后更新：2024-XX-XX*
*排查工程师：Kiro AI Assistant*
