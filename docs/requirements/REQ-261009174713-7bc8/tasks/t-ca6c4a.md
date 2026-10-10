# t-ca6c4a 分层依赖方向门禁与自检

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
分层依赖方向门禁与自检

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
node scripts/package-boundary-check.mts 退出码 0；四种越界自检 4/4 被非零退出拒绝；pnpm commit:check 含该步

## 实施方案（implementation）
新增 scripts/package-boundary-check.mts（按分层白名单扫 packages/*/src 的 import 来源，越界退出码 1）+ tests/package-boundary.test.ts（core→类型包、类型包→core、工具包内横向、资产包引代码包四例）；接进 commit:check。

## 上游产出摘要（dependsSummary）
- 建 19 个子包骨架与 workspace 装配

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-09T10:52:56.525Z，窗口 session-5eb1ddb9-73cd-416a-96e8-99d4420cf11c）

落地分层依赖方向门禁：把文字纪律变成可执行判据（声明面 + 使用面两侧查四类越界），并接进提交判据链

### 完成项

- 新增 scripts/package-boundary-check.mts：L0..L4 白名单唯一权威（design/architecture.md 分层表）
- 四类越界判据：layer-declaration / undeclared-import / cross-dir-import / asset-import
- 真树运行退出码 0（扫描 19 包的声明面与使用面）
- 新增 tests/package-boundary.test.ts：6 例（四类越界各一例被拒 + 干净树放行 + kit 中转合法）
- 接进 commit:check：越界先行失败；实测输出含门禁 OK 行且退出码 0
- 新增 package.json 脚本边界检查入口 boundary:check

### 改动文件

- `.worktrees/req-261009174713-7bc8/scripts/package-boundary-check.mts`
- `.worktrees/req-261009174713-7bc8/tests/package-boundary.test.ts`
- `.worktrees/req-261009174713-7bc8/scripts/commit-check.mts`
- `.worktrees/req-261009174713-7bc8/package.json`

### 下一步

后续各卡改动均受本门禁约束；t4 公共包落位可开工

---
