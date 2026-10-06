# t-ed271f 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）·联调

> 需求：REQ-261005193546-1b1a 看板 DAG 不再展示已取消卡：让视图与统计都不再算上退出赛道的卡片

## 在做什么
两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-05T16:46:16.144Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

联调段完成：两个入口的签名与返回体未变，18+3 个调用点一个字未动，邻域 RTM 用例零回归。

### 完成项

- 调用点零影响：18 处 syncRTMYaml 与 3 处直调 syncRTMYamlWithSnapshot 全部未改（grep 核实）
- 邻域 RTM 全绿：11 个文件 86 个用例通过（含 rtm-trigger-prototype、rtm-coverage-prototype、rtm-validator-tolerance、rtm-health-legacy）
- 另跑 live-tasks-predicates 与 accept-sheet/submit-rtm-integration 亦全绿
- 设计写的 18+3 与实际 grep 一致（第 19 处命中是 SubmitArtifact 里的注释）

### 下一步

进入复核段：核对签名、首行位置与不残留 tasks

---
