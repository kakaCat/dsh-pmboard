# t-e6de10 组件改为消费图表模型（视图接线卡）·研发

> 需求：REQ-260930230225-71be 会话头部需求流程图改为响应式并移到模式标签后

## 在做什么
组件改为消费图表模型（视图接线卡）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 ./node_modules/.bin/vitest run 相关用例与 pnpm build:client，两条命令均退出码 0（贴命令与输出摘要）

## 汇报 1（2026-09-30T15:26:33.515Z，窗口 session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c）

研发段：组件改用统一模型出图，界面结构一点没动

### 完成项

- conversation-progress.ts 改为调 buildFlowChartModel
- 类名/属性/点击行为按设计 I-2 全部保持

### 改动文件

- `src/client/conversation-progress.ts`

### 下一步

下一段

---
