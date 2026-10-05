# t-b8ffb8 六档视口探针与静态契约单测（回归门卡）·研发

> 需求：REQ-260930230225-71be 会话头部需求流程图改为响应式并移到模式标签后

## 在做什么
六档视口探针与静态契约单测（回归门卡）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 ./node_modules/.bin/vitest run 相关用例与 pnpm build:client，两条命令均退出码 0（贴命令与输出摘要）

## 汇报 1（2026-09-30T15:30:09.269Z，窗口 session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c）

研发段：把「会话头部会不会撑破」变成一条可复跑的命令

### 完成项

- 新增 scripts/header-progress-probe.mts：真实模型 + 真实 CSS + 复刻标题行几何，六档视口量 A1–A6
- 补齐 TC-1/2/3/4/6 静态契约用例

### 改动文件

- `scripts/header-progress-probe.mts`
- `tests/header-progress-responsive.test.ts`

### 下一步

—

---
