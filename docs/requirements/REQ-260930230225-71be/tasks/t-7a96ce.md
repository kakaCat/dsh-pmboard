# t-7a96ce 兼容与回滚验证（无容器祖先降级）·研发

> 需求：REQ-260930230225-71be 会话头部需求流程图改为响应式并移到模式标签后

## 在做什么
兼容与回滚验证（无容器祖先降级）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 ./node_modules/.bin/vitest run 相关用例与 pnpm build:client，两条命令均退出码 0（贴命令与输出摘要）

## 汇报 1（2026-09-30T15:31:34.551Z，窗口 session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c）

研发段：给探针加了「假装浏览器不支持容器查询」的降级模式，并写清回滚步骤

### 完成项

- 探针 --fallback 模式：标本页去掉容器语义，验证全量渲染 + 行不溢出
- evidence/README.md 增补「怎么复跑」「实测输出」「残余风险」「回滚路径」四节

### 改动文件

- `scripts/header-progress-probe.mts`
- `docs/requirements/REQ-260930230225-71be/evidence/README.md`

### 下一步

—

---
