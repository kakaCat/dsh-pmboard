# reqboard_capture 弹框失效排查指南

## 问题描述

用户反馈：`reqboard_capture` 调用后不弹出 `ask_user_question` 弹框，导致无法立项。

## 排查步骤

### 1. 检查 userQuestions 服务注入

在 DSH 控制台执行：

```javascript
// 检查服务是否已注入
console.log('userQuestions 服务状态:', typeof ctx.userQuestions?.ask === 'function' ? '✓ 已注入' : '✗ 未注入');
```

**预期结果**：应该显示 "✓ 已注入"

**如果显示 "✗ 未注入"**：
- 检查宿主 DSH 版本是否支持 `userQuestions` 服务
- 检查 `ctx.inject(['userQuestions'], ...)` 是否被正确调用
- 查看控制台是否有 "userQuestions service ready" 日志

### 2. 检查 UserQuestionsAdapter.available()

在插件代码中添加调试日志：

```typescript
// src/adapters/UserQuestionsAdapter.ts, line 36
available(): boolean {
  const svc = this.resolve() as RawQuestionService | undefined
  const result = typeof svc?.ask === 'function'
  console.log('[DEBUG] UserQuestionsAdapter.available():', {
    svcExists: svc !== undefined,
    askType: typeof svc?.ask,
    result
  })
  return result
}
```

### 3. 检查 CaptureRequirement 用例执行路径

在 `src/application/use-cases/CaptureRequirement.ts` 添加调试日志：

```typescript
// line 185 附近
if (!deps.questions.available()) {
  console.log('[DEBUG] 弹框通道不可用，返回 fallback=board')
  return notCreated(undefined, {
    fallback: 'board',
    note: '弹框通道不可用...',
  })
}
console.log('[DEBUG] 弹框通道可用，准备调用 askOrFail')
```

### 4. 检查 GateAwareQuestions 装饰器

在 `src/adapters/GateAwareQuestions.ts` 添加调试日志：

```typescript
// line 45
available(): boolean {
  const result = this.inner.available()
  console.log('[DEBUG] GateAwareQuestions.available():', result)
  return result
}

// line 49
async ask(questions, opts) {
  console.log('[DEBUG] GateAwareQuestions.ask() 被调用:', {
    questionsCount: questions.length,
    hasGate: opts.gate !== undefined,
    gate: opts.gate
  })
  const answers = await this.inner.ask(questions, opts)
  console.log('[DEBUG] GateAwareQuestions.ask() 返回答案数:', answers.length)
  this.enqueueGateIfAny(opts, answers)
  return answers
}
```

### 5. 检查弹框问题结构

在 `src/application/internal/capture-mapping.ts` 添加调试日志：

```typescript
// line 128, buildCaptureIntentQuestions 函数开始处
export function buildCaptureIntentQuestions(
  titleOptions: readonly string[],
  ctx: { reasonLine?: string } = {},
): AskQuestion[] {
  console.log('[DEBUG] buildCaptureIntentQuestions 被调用:', {
    titleOptionsCount: titleOptions.length,
    reasonLine: ctx.reasonLine
  })
  
  // ... 函数体 ...
  
  console.log('[DEBUG] 生成的问题:', {
    questionsCount: 结果.length,
    firstQuestion: 结果[0],
    optionsCount: 结果[0]?.options?.length
  })
  
  return 结果
}
```

## 常见问题和解决方案

### 问题 1: userQuestions 服务未注入

**症状**：`deps.questions.available()` 返回 `false`

**原因**：
- 宿主 DSH 未提供 `userQuestions` 服务
- 插件加载时机问题（在服务注入之前就使用了）
- `ctx.inject()` 回调未被执行

**解决方案**：
1. 确认 DSH 版本 >= 支持 userQuestions 的版本
2. 在 `src/index.ts` 的注入回调中添加日志确认执行
3. 检查 `ctx.inject()` 是否被正确调用

### 问题 2: available() 返回 true 但弹框仍不出现

**症状**：日志显示 "弹框通道可用"，但 agent 没有收到弹框

**原因**：
- `svc.ask()` 方法抛出异常
- 弹框被 UI 层拦截（权限/状态问题）
- Signal 被提前 abort

**解决方案**：
1. 在 `UserQuestionsAdapter.ask()` 中添加 try/catch 捕获异常
2. 检查 `opts.agent` 是否正确传递
3. 检查 `opts.signal` 的状态

### 问题 3: 推荐标记不生效

**症状**：弹框出现但首个选项没有被预选

**原因**：
- 推荐后缀格式不符合宿主正则：`/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i`
- `withRecommendLabel()` 没有正确添加后缀

**解决方案**：
1. 确保使用全角括号「（推荐）」
2. 只给首个选项的 label 添加后缀
3. 检查 `buildCaptureIntentQuestions` 的逻辑

### 问题 4: 弹框出现但立即超时

**症状**：弹框闪现后立即消失，返回 "等待超时"

**原因**：
- `timeoutMs` 设置过小
- `askWithBudget` 的预算计算有误

**解决方案**：
1. 检查 `LIMITS.timeoutInteractiveMs` 的值（应为 3600000，即 1 小时）
2. 在 `askWithBudget` 中添加日志查看实际预算

## 验证修复

修复后，执行以下验证：

1. **单元测试**：`pnpm test tests/capture-tool.test.ts`
2. **集成测试**：在 DSH 中实际调用 `reqboard_capture`
3. **日志检查**：确认所有调试日志正常输出

## 相关文件

- `src/index.ts` - 服务注入与组合根
- `src/adapters/UserQuestionsAdapter.ts` - 弹框通道适配器
- `src/adapters/GateAwareQuestions.ts` - 闸门感知装饰器
- `src/application/use-cases/CaptureRequirement.ts` - 立项用例
- `src/application/internal/capture-mapping.ts` - 弹框问题构建
- `src/tools/CaptureTool/CaptureTool.ts` - 工具定义

## 最近相关修改

检查以下 commit 是否引入了问题：

```bash
git log --oneline --since="1 week ago" -- "**/capture*" "**/UserQuestions*" "**/GateAware*"
```
