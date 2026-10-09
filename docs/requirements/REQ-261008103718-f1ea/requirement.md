# REQ-261008103718-f1ea：修复 PM 插件立项弹框功能失效问题

## 问题描述

### 边界

**影响范围**：PM 插件所有依赖 `userQuestions` 服务的功能
- 立项弹框（`reqboard_capture`）
- 确认弹框（`reqboard_ask_confirm`）
- 验收单弹框（`reqboard_accept_sheet`）

**不受影响**：
- 看板页面功能正常
- 其他 reqboard 工具（不依赖弹框的）正常
- 服务端功能正常

### 复现步骤

1. 启动 DSH 应用（Web GUI 模式）
2. 在会话中输入测试立项的需求
3. Agent 调用 `reqboard_capture` 工具
4. **实际结果**：返回 `fallback=board`，弹框未显示
5. **预期结果**：在会话中弹出立项弹框

### 问题描述

用户在测试 PM 插件立项功能时，调用 `reqboard_capture` 工具后弹框未弹出，返回 `fallback=board`。经过源码排查，确认弹框应该在会话中渲染（通过 `QuestionComposer` 组件注册到 `conversation.composer` 插槽），而非页面弹窗。

## 根因分析

### 根因（订正，2026-10-08 实测定案）

**真根因（两条，互补，缺一不可）**：

1. **`callId = undefined`（实际撞到的路径）**：宿主 `UserQuestionService` 的 `askTimed(request, callId, timeoutMs)` 第二参是 **tool call id**，而适配器固定传 `undefined`。该值进入 remote 请求体后，宿主 api gateway 的 `isRemoteJsonValue` 判定 `undefined` 非法 ⇒ 抛 `api gateway: Remote event request is not lossless JSON data` ⇒ **整条弹框请求被拒收**——浏览器侧根本收不到请求。

2. **`description: undefined`（`ask()` 路径上同样致命）**：`buildCaptureIntentQuestions` 的选项曾写成 `description: i === 0 ? '…' : undefined`——键存在且值为 `undefined`，在 `ask()` 路径上同样会被网关拒收。

**触发条件**：DSH 升级后在 `UserQuestionService` 上提供了 `askTimed` 方法，激活了 pm 插件里"宿主有 `askTimed` 就透传"的既有分支。此前宿主没有该方法，一直走本地竞速 `ask()`，故未暴露。

**为什么测试一直是绿的**：单元测试的 mock 服务只有 `ask`、没有 `askTimed` → 走本地竞速 → 通过；真机宿主有 `askTimed` → 走透传 → 失败。测试 mock 与真机形状不一致，是该 bug 漏网 CI 的直接原因。

**证据**（2026-10-08 诊断日志 `~/.dsh/state/reqboard-capture-diag.log`）：
- `[UI-4]: askTimed() 走本地竞速（宿主 askTimed=function，不透传…）` —— 证实宿主确实有 `askTimed`
- 修复前：`[UI-5]: askWithBudget 抛错 code=<none> message=api gateway: Remote event request is not lossless JSON data`
- 修复后：`[UI-2] ask() 调用` → `[UI-3] svc.ask() 返回 answers=N` → 弹框正常渲染、作答成功

**早期误判（排查记录，已回滚）**：
最初以为是 `package.json` 的 `dsh.client.inject` 缺少 `userQuestions` 声明。实测发现：① host 端 `ctx.inject(['userQuestions'], cb)` 注入正常（`[UI-0] svc=true ask=function`）；② 把 `userQuestions` 加进**客户端** `inject` 反而导致客户端 entry 永远 pending（浏览器侧无此服务）→ boot 断言失败 → 整个 UI 不挂载（连带模型选择器不显示）→ 已回滚两处错误声明。

### 回归

**防止再次发生的措施**：

1. **通道边界无损清洗**（[lossless-json.ts](src/application/internal/lossless-json.ts)）：`ask`/`askTimed` 发送前深度剔除 `undefined` 键/项；`agent`/`signal` 条件展开
2. **源头修复**：`capture-mapping.ts` 的选项构造改为条件展开，不再产生 `undefined` 键
3. **诊断落文件**：`[UI-0..5]` 六个诊断点写进 `~/.dsh/state/reqboard-capture-diag.log`，错误码原样可见
4. **测试护栏**：
   - [lossless-json-questions.test.ts](tests/lossless-json-questions.test.ts)：运行时校验真实构造器输出可无损往返
   - [dialog-payload-lossless-guard.test.ts](tests/dialog-payload-lossless-guard.test.ts)：静态扫描源码禁止 `键: 条件 ? 值 : undefined`
   - [ask-timed.test.ts](tests/ask-timed.test.ts)：契约变更（不透传宿主 askTimed），断言宿主 askTimed 零调用

**回归测试用例**：
- 调用 `reqboard_capture` 验证弹框在会话中渲染、可作答、成功立项
- 调用 `reqboard_ask_confirm` 验证确认弹框
- 检查诊断日志 `[UI-2]`/`[UI-3]` 出现（请求送达客户端）

### 弹框渲染机制（正常流程）

1. **后端服务**：`UserQuestionService` 提供 `ctx.userQuestions.ask()` 方法
2. **远程事件**：通过 `user-questions/request` 事件发送到客户端（host→client remote，**必须无损 JSON**）
3. **客户端接收**：`ui-user-questions` 包监听事件并创建 `PendingQuestion`
4. **会话中渲染**：`QuestionComposer` 组件在对话流中渲染弹框

### 失效原因（订正）

**宿主升级提供 `askTimed` 后，pm 插件的透传分支把 `callId=undefined` 传进 remote 请求体，被网关整条拒收。**

技术链路：
1. DSH 升级 → `UserQuestionService` 新增 `askTimed(request, callId, timeoutMs)`
2. pm 适配器检测到 `svc.askTimed` 存在 → 走透传分支（此前一直走本地竞速）
3. 透传时固定传 `callId = undefined`
4. 宿主 `projectRemoteEventRequest` 把 `agent`/`signal` 之外的所有 own key 原样复制，交 `isRemoteJsonValue` 校验
5. `undefined` 不是合法 JSON 值 → 抛 `api gateway: Remote event request is not lossless JSON data`
6. 整条弹框请求被拒收，浏览器侧收不到，弹框不出现
7. 该错误**没有 code**，被上层 catch 落进"用户取消"分支 → 谎报「用户未作答」+ 记 cancel 留痕 → 连续三次触发 30 分钟"取消粘滞"，把通道故障固化成"用户不想用弹框"

## 解决方案

### FR-1：弹框请求必须可无损 JSON 往返

**修复内容**：

1. **移除 `askTimed` 透传**（[UserQuestionsAdapter.ts](src/adapters/UserQuestionsAdapter.ts)）：一律走本地竞速 `ask()`——与官方 `tool-ask-user` 同款路径（已知可用）。宿主 `askTimed` 的 `callId` 约定未明，不再透传。
2. **源头修复 `description: undefined`**（[capture-mapping.ts:137](src/application/internal/capture-mapping.ts#L137)）：改为条件展开 `...(i === 0 ? { description: '…' } : {})`
3. **通道边界无损清洗**（[lossless-json.ts](src/application/internal/lossless-json.ts)）：`stripUndefinedDeep` 深度剔除 `undefined` 键/项，保留 `null`，不碰类实例；`agent`/`signal` 条件展开
4. **诊断落文件**：`[UI-0..5]` 六个诊断点，错误码原样可见

### 验收标准

1. **弹框可见性**：调用 `reqboard_capture` 后，弹框在会话中正常显示
2. **作答功能**：用户可以在弹框中选择选项或输入自定义内容
3. **立项成功**：作答后成功创建需求并绑定到当前窗口
4. **其他弹框**：`reqboard_ask_confirm` 和验收单弹框同样恢复正常
5. **诊断可见**：`~/.dsh/state/reqboard-capture-diag.log` 出现 `[UI-2]`/`[UI-3]`（请求送达客户端）

### 影响范围

- **修复文件**：`src/adapters/UserQuestionsAdapter.ts`、`src/application/internal/capture-mapping.ts`、`src/application/internal/lossless-json.ts`（新增）、`src/index.ts`（诊断）
- **需要重建**：host 端（`pnpm build`）
- **需要重启**：DSH 应用（重新加载 host 插件）
- **客户端 bundle 未变**：785060 bytes（与事故前一致，不会触发安全模式恢复）

## 附加说明

### 为什么之前能工作？（订正）

**弹框在这个 DSH 版本上从未成功过。** 早期（宿主无 `askTimed`）走本地竞速 `ask()`，但 `ask()` 路径上还有 `description: undefined` 的 questions 问题，同样会被网关拒收。只是当时错误被误报成"用户取消"，且缺诊断日志，无法看见真实错误码。

### 预防措施

1. **适配层模块注释**（[UserQuestionsAdapter.ts](src/adapters/UserQuestionsAdapter.ts)）：完整记录事故、判据出处、本层做法、禁令
2. **类型定义警示**（[ports.ts:995](src/application/ports.ts#L995)）：`AskQuestion` 上标注正误写法
3. **测试护栏**：运行时无损校验 + 静态源码扫描（已实测能抓住违规）
4. **诊断落文件**：`[UI-0..5]` 六个诊断点，stdout 不可读时仍有可靠观测面

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定结论 | 影响哪条 FR | 可验证判据 |
|---|---|---|---|---|
| D-1 | 2026-10-08 用户："帮我修复这个问题" | 修复立项弹框失效，让弹框能正常渲染与作答 | FR-1 | 调用 reqboard_capture 弹框出现、可作答、成功立项 |
| D-2 | 2026-10-08 用户："依然弹框失败，你查看git 看看和之前有什么不同" | 重新定位真根因：宿主 askTimed 的 callId=undefined 导致 remote 请求被网关拒收（非"缺少服务声明"） | FR-1 | 诊断日志 [UI-5] 错误码从 not lossless JSON data 变为无；[UI-3] 返回 answers |
| D-3 | 2026-10-08 用户："你在适配层记录一下这个问题，防止以后还犯错" | 在适配层模块注释记录事故 + 通道边界无损清洗 + 测试护栏（运行时 + 静态） | FR-1 | 新增 lossless-json.ts、两个测试文件；适配器注释含事故记录 |
| D-4 | 2026-10-08 用户："硬编码对吗" | 客户端 inject 不得声明 host 端服务（userQuestions），已回滚两处错误声明 | FR-1 | client.js 中 userQuestions 出现 0 次；boot 不再报 entry pending |
| D-5 | 2026-10-08 用户："我之前配置的kimi coding 模型没有了" | 连带问题：boot 失败触发"禁用所有插件"恢复，清空 profile patch；已从备份恢复 llm-pi-ai 等 4 段 | 无（环境问题） | cordis.patch.yml 含 llm-pi-ai 段；kimi 模型回到选择列表 |
| D-6 | 2026-10-08 agent 依证据处置（待验收确认） | 契约变更：不再透传宿主 askTimed，一律走 ask() 本地竞速；测试已更新为"验不透传" | FR-1 | ask-timed.test.ts 断言 svc.askTimed 零调用；29 个相关测试通过 |

## 相关文件

- `package.json`：客户端依赖声明
- `src/adapters/UserQuestionsAdapter.ts`：弹框通道适配器
- `src/application/use-cases/CaptureRequirement.ts`：立项弹框用例
- DSH `packages/client/ui-user-questions/`：弹框 UI 实现
- DSH `packages/interaction/user-questions/`：弹框服务定义

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-c5da35、t-04b737、t-57b07b |

> 无未接收条款（1 条全部有落点）。

<!-- reqboard:marks:end -->
