# t-f5efe1 定契约：路由解析 + 三个配置 + 可选字段·联调

> 需求：REQ-261004110201-f253 PM 工作流业务设计：模型路由 + 阶段遥测 + 确认聚合深化 + 优先级与 WIP 上限

## 在做什么
定契约：路由解析 + 三个配置 + 可选字段·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T03:09:56.194Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

联调段完成：装配面调得通、响应与设计里的两级命中样例逐条对上，缺省三值正是现状——契约可以被后面几张卡放心消费

### 完成项

- 请求样例与期望响应一致（tsx 直调装配面同款入口）：route dev/expert → {model:strong}；route test/expert → {model:strong-x}（两级命中）；route test/simple → undefined（未命中不注入）；wip → 2；threshold → 3；缺省配置 → [{},0,2]（= 现状）
- 消费面盘点：StageRouting 唯一生产引用是 plugin-config（accessor 层）；三个 accessor 供组合根装配时调用（t2/t3/t6 的消费方按契约取值），无循环依赖
- 分层约束：domain/task/StageRouting.ts 零 import（只 import 同层 SubtaskTemplate）；plugin-config（根层）→ domain 单向；protocol 只加字段
- 回归：tests/layer-boundary.test.ts / tools-schema.test.ts 中本卡相关面零新增红（layer-boundary 三红为基线既有，点名文件均为既有 gate/diag/rtm，与本卡无交集）

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-f5efe1.md`

### 下一步

复核段（t-030cb1）：对照设计核对契约与设计文档一致性

---
