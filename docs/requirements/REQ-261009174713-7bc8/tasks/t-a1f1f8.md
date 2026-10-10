# t-a1f1f8 回合驱动包（dive 劈两半的驱动面）·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
回合驱动包（dive 劈两半的驱动面）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-09T14:35:35.246Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

9 个 dive 驱动文件迁入 pmboard-round-driver（只搬不改：文件内部零改动，因为是包名加相互相对 import）；23 个引用方改指包名；顺带修掉 core 漏声明的 type-kit 依赖。

### 完成项

- git mv src/application/dive/*.ts → packages/pmboard-round-driver/src/（9 文件）；src/application 目录随之归零
- 驱动文件内部**零改动**：它们对 core 早已用包名说明符、彼此用相对说明符，搬迁后两者都仍成立（这是前几块顺带形成的红利）
- 引用方 23 个文件改指 pmboard-round-driver/…（根包 wiring 与 adapters 与 index 与 client 与 tests）
- 判据跟包走：三个测试里的**路径字符串**（injection-difficulty 与 volatile-notice 与 live-tasks 的清单/夹具）改指新落点；readSrc 形态因基址是 src 需回退一级
- 顺带修掉一处真缺：core 的 package.json 漏声明 pmboard-type-kit（t10 加端口时引入），分层门禁当场点出（undeclared-import）——已补声明并重跑 install
- 读数：typecheck 0、分层门禁 exit 0、全量 7253 例失败 19（与开工前逐项一致，新增失败 0）
- 口径说明：卡面「vitest run packages/pmboard-round-driver/tests 全绿」此刻不可满足（测试随包迁移是 t20）；用例数已与基线对齐

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-round-driver/src`
- `.worktrees/req-261009174713-7bc8/src/wiring/pm-capture-root.ts`
- `.worktrees/req-261009174713-7bc8/src/adapters/ReqboardDiveManager.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/package.json`
- `.worktrees/req-261009174713-7bc8/tests/volatile-notice.test.ts`

### 下一步

交复核子卡 t-68c4b4。

---
