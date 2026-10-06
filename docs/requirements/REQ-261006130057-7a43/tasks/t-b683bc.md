# t-b683bc 文档/Token/提示词密度 + DAG 适配·测试

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
文档/Token/提示词密度 + DAG 适配·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T09:45:11.498Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

t8 测试段完成：消费面 195/195 绿、tsc 零错。

### 完成项

- t8 消费面回归 11 套件 195/195 绿（docs/token/prompts/dag/degrade/report-tabs/canceled-docs/token-tab/dag-view/dag-mount）
- tsc 零错（t6 在途断串已自愈）
- P1 修复（--pm-ok-text）复验在内
- 全量基线比对归 t10

### 下一步

t8 父卡收尾；剩 t3（在途）/t6（在途）/t9/t10

---
