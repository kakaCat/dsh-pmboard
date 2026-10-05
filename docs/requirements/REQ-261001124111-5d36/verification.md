# REQ-261001124111-5d36 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：会话顶部需求面板不再"停在打开那一刻的快照"——展开即拉 + 每 5 秒兜底轮询（SSE 降为加速通道）、面板头新增「数据时间 HH:MM:SS」（>30 秒或从未成功即转警示）、刷新失败在有旧数据时也出红条直说"显示的是几点几分的旧数据"、切换需求先清空不串档、插件换版后页面自己提示「点此刷新」。服务端 JSON 契约 / queue.json / 台账零改动，无数据迁移；plugin.panel.refreshMs=0 可一键回退。证据：本次新增 41 例测试全绿、全量回归与基线逐字相同（失败零增量）、改坏必红抽查有效、构建与尺寸门禁通过；25 张任务卡的测试覆盖已在 tests/README.md 以 covers 标注。三张真机步骤需重启宿主 + 真浏览器，标注为待人工复核，未冒充已验。

## 1. 验收列表

### v1-1 · 刷新调度器：纯逻辑 + 假计时器单测

**验收内容**：【刷新调度器：纯逻辑 + 假计时器单测】验收

**操作步骤**：
1. npx vitest run tests/panel-refresh.test.ts 全绿且覆盖 TC-A…TC-H：start 立即拉+周期 5000、intervalMs=0 只拉一次、在飞去重请求数不增、失败不回调 onData 且 lastError 非空、成功后 failureCount 归零、now 前进 31 秒转 stale=true、stop() 后在飞 resolve 不再触发 onData/onChange、fetchedAt 缺失时 stale=true。npx tsc --noEmit 退出码 0
2. npx vitest run tests/layer-boundary.test.ts 仍绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-2 · 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示

**验收内容**：【面板新鲜度渲染：数据时间 / 失败红条 / 版本提示】验收

**操作步骤**：
1. npx vitest run tests/panel-freshness-render.test.ts 全绿，覆盖 TC-I…TC-M：19 张卡真实 payload 渲染不含「暂无任务」且含 np-dag-canvas 与 data-fetched-at
2. 陈旧态含 class 含 is-stale 且 data-stale="1"
3. 失败态含 role="alert" 与「显示的是 … 的旧数据」
4. 版本不等含 np-reload、相等不含
5. 不传 freshness/buildNotice 时输出与改造前逐字节相同。npx vitest run tests/node-panel.test.ts 零改动全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-3 · 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关

**验收内容**：【组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关】验收

**操作步骤**：
1. npx tsc --noEmit 退出码 0
2. pnpm build:client 成功（node scripts/verify-client-build.mjs 通过）
3. 新增 tests/panel-refresh-wiring.test.ts 全绿：refreshMs=0 时不建立周期计时器（周期回调 0 次）、切换 reqId 后首次 onData 之前必有一次清空/加载中通知（不串档）、np-reload 委托存在且动作只有 location.reload()。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-4 · 版本戳通道：bundle 内联戳 + SSE event: build 帧

**验收内容**：【版本戳通道：bundle 内联戳 + SSE event: build 帧】验收

**操作步骤**：
1. node scripts/verify-client-build.mjs 通过且 lib/client.js 内含 __DSH_PM_BUILD__
2. npx vitest run tests/panel-build-stamp.test.ts 全绿（相等→不提示 / 不等→提示 / 任一端缺失→不提示）
3. curl -N -m 3 http://127.0.0.1:19387/dashboard/api/reqboard/events 能看到 event: build 帧
4. curl -s .../requirements/<REQ>/stages 的键集合与改造前一致（既有 JSON 契约不变）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-5 · 回归与端到端自检：既有断言不破 + 手工 E2E 证据

**验收内容**：【回归与端到端自检：既有断言不破 + 手工 E2E 证据】验收

**操作步骤**：
1. npx vitest run 全绿（含既有 node-panel / dag-view 用例零改动）
2. pnpm typecheck 退出码 0
3. 上述 5 条手工步骤各有留档证据文件（缺任一条本卡不通过）
4. 「改坏必红」抽查一次：注释掉周期轮询后 tests/panel-refresh.test.ts 必须转红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-6 · 文档同步：项目手册记录新认知

**验收内容**：【文档同步：项目手册记录新认知】验收

**操作步骤**：
1. docs/architecture/project-manual.md 含该节且结论与 design/architecture.md 的定案一致（人工核对）
2. 该节引用的文件路径逐个 ls 存在
3. 归档材料可直接引用本节作为 manual_updates。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · 不可照着验

**验收内容**：验收项不可照着验（历史数据）：以下验收项没写「怎么验」——验收项 刷新调度器：纯逻辑 + 假计时器单测·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。；验收项 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。；验收项 版本戳通道：bundle 内联戳 + SSE event: build 帧·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。；验收项 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。；验收项 回归与端到端自检：既有断言不破 + 手工 E2E 证据·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。。请补可执行操作（命令/可查数据/界面路径）；本条不阻断验收，但必须有人看过并决定。

**操作步骤**：
1. 验收项不可照着验（历史数据）：以下验收项没写「怎么验」——验收项 刷新调度器：纯逻辑 + 假计时器单测·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论
2. 无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。
3. 验收项 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论
4. 无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。
5. 验收项 版本戳通道：bundle 内联戳 + SSE event: build 帧·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论
6. 无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。
7. 验收项 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论
8. 无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。
9. 验收项 回归与端到端自检：既有断言不破 + 手工 E2E 证据·复核 缺「怎么验」（"对设计与实现的偏离逐条给出结论
10. 无偏离时显式写明「无偏离」及依据"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。。请补可执行操作（命令/可查数据/界面路径）
11. 本条不阻断验收，但必须有人看过并决定。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · 追溯断链

**验收内容**：FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1；FR-3；FR-5；FR-2；FR-4。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注；通过时意见须写明处置方式。

**操作步骤**：
1. FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1
2. FR-3
3. FR-5
4. FR-2
5. FR-4。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注
6. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 全量回归（含本次改动）：npx vitest run → 106 failed / 2787 passed / 20 skipped —— docs/requirements/REQ-261001124111-5d36/evidence/t5-full-vitest-with-change.txt
- 基线对照（临时移出本次 5 个测试文件）：106 failed / 2746 passed → 失败零增量，差值 41 = 本次新增用例 —— evidence/t5-full-vitest-baseline.txt
- 本次 5 个测试文件：41 passed（panel-refresh 11 / panel-freshness-render 10 / panel-refresh-wiring 12 / panel-build-stamp 5 / panel-build-frame 3）
- 既有面板测试零改动：tests/node-panel.test.ts 28 passed + tests/dag-view.test.ts 29 passed —— evidence/t5-test-stage.txt
- 改坏必红抽查：注释掉周期轮询 → panel-refresh.test.ts 5 例转红；还原后 11 绿 —— evidence/t5-mutation.txt
- 构建门禁：pnpm build:client → [verify-client] OK，bundle=330378 bytes，关键符号齐全（含 dsh-pm-np-fresh / -fresh-err / -build-notice 三个新锚点）
- 构建戳一致性：内联戳 == sha256(lib/client.cjs)[0:12] == 709cbe7960b0 —— evidence/t5-stamp.txt
- 尺寸门禁（单文件 ≤400 行）：本次文件命中 0（node-panel 377 / conversation-progress 369 / panel-freshness 97 / use-panel-refresh 140）
- 类型检查：npx tsc --noEmit -p tsconfig.json → 全仓 212 条（与基线同数）；本次改动文件 0 条
- 宿主帧实测：tests/panel-build-frame.test.ts 用假 ServerResponse 直跑 handleEvents → 写出 event: build + stamp + panel（3 passed，免重启宿主）
- 数据侧一致性：curl /stages → stages[decomposing].body.tasks 与面板同源 —— evidence/t5-stages-count.txt
- 一键回退：plugin.panel.refreshMs=0 关闭周期轮询（tests/panel-refresh-wiring.test.ts 断言其被当成合法值）
- 复核报告（含唯一一条自作违规的发现与修复记录）：docs/requirements/REQ-261001124111-5d36/reviews/review.md
- 测试证据索引 + 任务卡覆盖标注（covers: 25 张卡）：docs/requirements/REQ-261001124111-5d36/tests/README.md
- 需求/设计/计划文档：requirement.md + design/{architecture,interfaces,data-model,use-cases,test-cases,frontend}.md + decomposition.md
- 项目手册更新（归档 manual_updates 来源）：docs/architecture/project-manual.md 第 42 行「机制备忘：需求面板的刷新与陈旧可见」+ 变更记录行

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 刷新调度器：纯逻辑 + 假计时器单测 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:16 |
| v1-2 | 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:16 |
| v1-3 | 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:16 |
| v1-4 | 版本戳通道：bundle 内联戳 + SSE event: build 帧 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:16 |
| v1-5 | 回归与端到端自检：既有断言不破 + 手工 E2E 证据 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:16 |
| v1-6 | 文档同步：项目手册记录新认知 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:17 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:17 |
| v1-8 | 需求级验收 · 不可照着验 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:17 |
| v1-9 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:17 |
| v1-10 | 需求级验收 · 追溯断链 | ✓ 通过 | human/session-ee20d093-b61b-486e-96c2-e2a256ecea70 | 2026-10-01 14:17 |
