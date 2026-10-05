# t-cb9a10 六档视口探针与静态契约单测（回归门卡）·测试

> 需求：REQ-260930230225-71be 会话头部需求流程图改为响应式并移到模式标签后

## 在做什么
六档视口探针与静态契约单测（回归门卡）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 ./node_modules/.bin/vitest 与 ./node_modules/.bin/tsx scripts/header-progress-probe.mts，输出全绿（PROBE PASS，退出码 0）

## 汇报 1（2026-09-30T15:30:09.379Z，窗口 session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c）

测试段：探针两种模式 + 单测 + 构建全绿

### 完成项

- 探针六档：problems=NONE，末行 PROBE PASS，退出码 0
- 探针 --fallback：降级态全量渲染且行不溢出，PROBE PASS
- 单测 13 passed；pnpm build:client 退出码 0

### 下一步

—

---
