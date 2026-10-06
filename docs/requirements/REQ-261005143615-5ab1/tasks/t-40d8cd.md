# t-40d8cd 服务端按需求自身工作区判存在，并给出绝对路径·复核

> 需求：REQ-261005143615-5ab1 详情页文档路径绝对化 + 缺失判据按需求自身工作区

## 在做什么
服务端按需求自身工作区判存在，并给出绝对路径·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T06:48:34.584Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

复核段完成：多根判定的三条分支（命中 / 诚实缺失 / 未判定）与设计文档逐条对上，没有夹带计划外改动。

### 完成项

- 逐条对照 design/architecture.md 的「读根候选与判定链」：序、命中即止、候选非空/为空两分支均与设计一致，无偏离
- 逐条对照 design/interfaces.md 的字段与错误语义：absPath 未命中不注入、unknown 仍 200，均一致
- 层边界：新增 existsSync 只出现在 http 层，application 只吃注入的根与端口
- tests/layer-boundary.test.ts 的 3 处失败经 HEAD worktree 对照确认为存量（CreateRequirement/job-spec/stages，均非本卡改动）

### 下一步

测试段：跑本卡改动涉及的用例集

---
