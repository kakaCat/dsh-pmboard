测试证据（REQ-261007230908-5ccb · 体检第 4 批治理设施 + 收官）
================================================================

判据对象：生产代码 + 测试门禁（vitest 全程可跑）。
覆盖映射（本文件覆盖全部 8 张父卡 + 25 张子卡；各卡判据读数如下）：

covers: t-6feb35
covers: t-5e8f8e
covers: t-dff2c4
covers: t-89aaec
covers: t-b483e0
covers: t-cd208f
covers: t-bf89ba
covers: t-fbcd87

子卡（各段判据 = 上列 TC 对应行；研发/联调/复核/测试四段共用同一读数）：

covers: t-954881
covers: t-99e283
covers: t-7fcc91
covers: t-11b7d0
covers: t-bdc29d
covers: t-0b04ae
covers: t-ec4a20
covers: t-ba812a
covers: t-03cbb9
covers: t-a5c4f7
covers: t-2d8968
covers: t-36bb20
covers: t-9d8356
covers: t-8f8ced
covers: t-0fa1ae
covers: t-dafa69
covers: t-a296ad
covers: t-0e39e2
covers: t-b99234
covers: t-739dda
covers: t-86810e
covers: t-d72214
covers: t-3629f3
covers: t-da8518
covers: t-3df3ef

子卡 → TC 对应：注册表类（t-954881/t-99e283/t-7fcc91/t-11b7d0/t-03cbb9/t-a5c4f7/t-2d8968）→ TC-1/TC-2；
prompt 类（t-dafa69/t-a296ad/t-0e39e2/t-b99234/t-739dda/t-86810e/t-d72214）→ TC-3/TC-4；
client 类（t-36bb20/t-9d8356/t-8f8ced/t-0fa1ae）→ TC-6；
双拼类（t-bdc29d/t-0b04ae/t-ec4a20/t-ba812a）→ TC-5；
文档类（t-3629f3/t-da8518）→ TC-7；总验收（t-3df3ef）→ TC-8。

[TC-1] 注册表 ⇆ 扫描双向一致（t-6feb35 / t-5e8f8e）
$ npx vitest run tests/error-code-registry.test.ts
✓ tests/error-code-registry.test.ts (11 tests)
[读数] 注册表条目 133 · 扫描大写码 133

[TC-2] 负例钻 N1/N2/N4（t-5e8f8e）
$ grep -v "code: 'REQBOARD_NO_BOUND_REQ'" registry > tmp && npx vitest run tests/error-code-registry.test.ts
Tests  3 failed | 8 passed (11)          # N1：删条目 → 红并点名
$ （塞 REQBOARD_NOT_A_REAL_CODE）
Tests  2 failed | 9 passed (11)          # N2：死条目 → 红并点名
$ （塞 REQBOARD_XXX）
Tests  5 failed | 6 passed (11)          # N4：占位码 → 红（噪声∩注册表）
$ （还原）Tests  11 passed (11)

[TC-3] prompt 列码校验 + N3 钻（t-dff2c4 / t-cd208f）
$ npx vitest run tests/prompt-error-codes.test.ts
✓ 3 tests
[读数] prompt 文案面出现的大写码 24 个（全部已注册）
$ （向 OpenWindowTool/prompt.ts 塞 REQBOARD_NOT_A_REAL_CODE）
→ 红：src/tools/OpenWindowTool/prompt.ts → REQBOARD_NOT_A_REAL_CODE；还原后 3 绿

[TC-4] G5 逐格核对（t-cd208f）
$ for t in OpenWindowTool SkillInstallTool CreateTool StatusTool; do
    diff <(grep -o 'REQBOARD_[A-Z0-9_]*' src/tools/$t/prompt.ts | sort -u) \
         <(grep -rho 'REQBOARD_[A-Z0-9_]*' src/tools/$t/ --include='*.ts' | sort -u)
  done
（四工具 diff 输出均为空）

[TC-5] 双拼归一单源（t-b483e0）
$ npx vitest run tests/dual-field.test.ts
✓ 10 tests
$ grep -rn "o\.granularity_exempt ?? o\.granularityExempt\|o\.dep_reasons ?? o\.depReasons\|o\.skipIntegrationReason ?? o\.skip_integration_reason" src
（命中 0 —— 4 处直连写法归一到 dual-field）
$ npx vitest run tests/plan-granularity.test.ts tests/plan-doc-table.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint.test.ts
✓ 80 tests（既有 plan 契约零回归）

[TC-6] client 派生与构建（t-89aaec）
$ npx vitest run tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/client-api-resolve.test.ts
✓ 52 tests（client 面）
$ pnpm build:client
✔ Build complete | wrapped dsh-pmboard -> lib/client.js 676939 bytes
[verify-client] OK  bundle=778084 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

[TC-7] 收官对照表（t-bf89ba）
$ grep -c "^| G[0-9]" docs/requirements/REQ-261007230908-5ccb/closure-audit.md
10
（逐行 awk 校验去向/核验两列均非空）

[TC-8] 全量回归与异常披露（t-fbcd87）
$ pnpm test
Test Files  37 failed | 556 passed | 3 skipped (596)
Tests       67 failed | 6976 passed | 22 skipped (7065)
# 开工前同树基线 38 failed files / 68 failed tests ⇒ 无新增失败
# 失败名单零命中本批文件（error-code-registry / prompt-error-codes / dual-field /
#   error-code-inventory / plan-granularity / prompt-baseline / tools-dispatch / toolviews-contract）

$ pnpm typecheck
src/application/internal/ask-timed.ts(60,42) / (84,37) · tests/ask-timed.test.ts(14,15)
# 3 处错误全属他窗在飞 src/application/ports.ts 改动（ConfirmContext 未导出 / gate 类型收窄）
# 本批新增与改动文件过滤后 0 报错 —— 两项未达标已如实披露于 verification.md §异常披露

[TC-9] 验收期补记（2026-10-07 复跑，追加不改上列读数）
$ pnpm typecheck
exit=0            # 上列 3 处报错为他窗中间态，对方写完后已消失 ⇒ typecheck 现状通过
$ git worktree add /tmp/pmhead HEAD --detach && ln -s "$PWD/node_modules" /tmp/pmhead/node_modules
$ (cd /tmp/pmhead && pnpm test)
Test Files  42 failed | 544 passed | 3 skipped (589)
Tests       75 failed | 6905 passed | 22 skipped (7021)
# 对照当前工作树 36 failed files / 66 failed tests ⇒ 红灯是仓库既有状态
# 抽样 7 文件在两处计数逐字相同（7 文件 / 15 用例）
# ⇒ 本批不新增失败，且工作树比 HEAD 少 9 文件 / 9 用例

[TC-10] 验收单补录文本（供人工在看板/弹框粘贴；2026-10-07）
# 为什么需要：judgePassedVerdict 对普通项要求 opinion 含「命令 + 读数」锚点
# （点通过但留空 → 兜底用 agent result，而 result 无锚点形态 → 记 unverified，不计通过）；
# 系统项（v1-11）通过必须命中「已处置 / 确认无需」模板。

v1-6（G5 补全四工具 prompt 错误码清单）
npx vitest run tests/prompt-error-codes.test.ts → 3/3 绿；四工具 prompt 码 vs 实现码 diff 为空（2026-10-07 复跑）

v1-8（全量回归与验收材料汇总）
三条新门禁 24/24 绿；pnpm build:client → verify-client OK；pnpm test 37/67 ≤ 开工前基线 38/68（2026-10-07 复跑）

v1-10（与裁定对照 D-1~D-5）
D-1 占位/模板拼码零收录（N4 钻红）；D-2 收敛（新用例零复制正则）；D-3 子集断言；D-4 补全（四工具 diff 0）；D-5 仅数据源派生（build:client OK）

v1-11（系统项·孤儿用例，须选「其他」并贴以下处置）
已处置：已给两个用例补 serves 声明——tests/error-code-registry.test.ts serves: FR-2、tests/prompt-error-codes.test.ts serves: FR-3（另补 dual-field.test.ts serves: FR-4）；补后三条门禁复跑 24/24 绿
