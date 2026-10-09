# 接口设计 <!-- serves: FR-1 -->

## 修改接口 <!-- serves: FR-1 -->

无接口修改，仅配置变更。

## 依赖接口 <!-- serves: FR-1 -->

**UserQuestionService** (已存在)：
- `available(): boolean` - 检查服务是否可用
- `ask(request): Promise<answers>` - 发起弹框请求

配置声明后，`UserQuestionsAdapter` 能够正确获取此服务实例。
