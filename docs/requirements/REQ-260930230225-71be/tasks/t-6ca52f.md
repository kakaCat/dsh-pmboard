# t-6ca52f 抽出流程图模型与档位常量（契约卡）·测试

> 需求：REQ-260930230225-71be 会话头部需求流程图改为响应式并移到模式标签后

## 在做什么
抽出流程图模型与档位常量（契约卡）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 ./node_modules/.bin/vitest 与 ./node_modules/.bin/tsx scripts/header-progress-probe.mts，输出全绿（PROBE PASS，退出码 0）

## 汇报 1（2026-09-30T15:14:17.352Z，窗口 session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c）

测试段：模型单测全绿

### 完成项

- vitest tests/header-progress-responsive.test.ts -t TC-5 → 7 passed
- tsc：新文件 0 错误（全仓 276 行既有债务与本卡无关）

### 下一步

父卡可收尾

---
