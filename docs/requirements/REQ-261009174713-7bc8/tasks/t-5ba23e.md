# t-5ba23e 公共包 pmboard-common 落位·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
公共包 pmboard-common 落位·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/common-package-purity.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-09T11:12:11.319Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

公共包 t4 收官：39 文件搬迁（前序窗口完成）加尾部 6 类「判据写死旧落点」修复；typecheck 0、分层门禁 exit 0、公共包纯度 3/3、全量 7211 例失败集与 t2 基线持平（无新增失败，1 例基线红转绿）。

### 完成项

- 复核公共包落位：package.json 零 workspace 依赖、纯度用例 3/3 绿、门禁 exit 0
- 修 live-tasks 扫描根：根包 src 加各子包 src，命中口径改仓库根相对（37 行 24 文件与清单逐条相等）
- 修错误码扫描器 collectConstAliases 单根：改走 defaultScanRoots，重生成清单后覆盖翻转 0、零覆盖回到 5
- 修 domain-paths 入口与 domain 面口径：入口改工作区相对，公共包同属不许碰 I/O 的面
- 修 pm-question-badge 的相对标签与 volatile-notice 的 readSrc、queue-path 的误拼 URL
- 回退 client-types 过度重写 30 处：该文件仍依赖 protocol，下沉属 t5（否则 typecheck 35 错）
- 冻结 prompt 片段文案并回退 P1 基线 fixture：恢复与基线逐字节一致（blob 03b7454d）
- 死路径按 prototype 兼容期先例登记探针白名单一条，reason 写明改文案属 t11 且须一并删除
- 全量 7211 例：失败集 12 文件全部在 t2 基线内；settings-init 由红转绿

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/live-tasks-single-source.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/helpers/error-code-scan.ts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/error-code-inventory.json`
- `.worktrees/req-261009174713-7bc8/tests/reqboard/domain-paths.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/pm-question-badge.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/volatile-notice.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/queue/queue-path.test.ts`
- `.worktrees/req-261009174713-7bc8/scripts/prompt-path-probe.mts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/index.ts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

交复核子卡 t-7f9025：独立复跑纯度、门禁、typecheck 与全量失败集对比，并核对两处桥（client-types 未下沉、prompt 白名单待 t11 删）。

---
