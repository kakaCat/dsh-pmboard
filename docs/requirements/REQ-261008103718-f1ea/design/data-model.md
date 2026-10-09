# 数据模型 <!-- serves: FR-1 -->

## 涉及数据 <!-- serves: FR-1 -->

本次修复不涉及数据模型变更，仅修改配置声明。

## 服务依赖 <!-- serves: FR-1 -->

**userQuestions 服务**：
- **提供者**：`@deepseek-ai/dsh-user-questions` (后端) + `@deepseek-ai/dsh-client-ui-user-questions` (前端)
- **消费者**：dsh-pmboard
- **接口**：`UserQuestionService.ask(request)` 和 `UserQuestionService.available()`
- **数据流**：服务端发起 → 远程事件 → 客户端渲染弹框 → 用户作答 → 返回结果
