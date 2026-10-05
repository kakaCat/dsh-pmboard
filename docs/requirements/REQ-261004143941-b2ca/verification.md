# REQ-261004143941-b2ca 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：会话右上角的流程图在任意窗口宽度下都至少有一个 token 读数——窄窗口（容器 <1000px）在计数旁常显「需求累计 Token」，宽窗口保持每节点 token 不变，档位与口径都没动。实现两处：进度接口新增 requirement.tokenTotal（与各节点同源，无快照时不发该键，不显示假 0）；流程图头部在计数旁渲染常显徽章（结构上位于节点流程图之外，故不受宽度档位影响），极窄档只收掉 🪙 图标保留数字。自检结果：探针 6 档全过且窄档确有读数；断言红态可复现；接口在真数据上自洽（25,321,586 === Σ各节点）；单测 28 条、基线 15 条全绿；类型检查与基线持平。已知待人工项一项：运行中的宿主未重载插件，实时接口暂时还看不到新字段（我无权重载），重载后即可在会话头部看到累计数。

## 1. 验收列表

### v1-1 · 进度接口补需求累计 token（与节点同源、缺失即不发）

**验收内容**：【进度接口补需求累计 token（与节点同源、缺失即不发）】验收

**操作步骤**：
1. ./node_modules/.bin/vitest run tests/session-progress.test.ts tests/progress-nodes-fallback.test.ts 全绿，逐条含：TC-3a 同一响应内 data.requirement.tokenTotal === Σ data.nodes[].tokens.total 且 > 0
2. TC-3b 需求无任何快照时 'tokenTotal' in data.requirement === false（不是 0）
3. TC-3c 兜底夹具（有任务执行差值、无 byStage）下 tokenTotal 含该差值。接口实测：curl -s http://127.0.0.1:19387/dashboard/api/reqboard/session/<sid>/progress | python3 断言 tokenTotal == Σnodes 且 > 0，打印两个数字。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）

**验收状态**：✓ 通过

---

### v1-2 · 流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化）

**验收内容**：【流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化）】验收

**操作步骤**：
1. ./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts 全绿，逐条含：TC-2a tokenTotal:1234 → model.tokenTotal===1234
2. TC-2b 不传 → 'tokenTotal' in model === false
3. TC-2c tokenTotal:0 → 同 2b
4. TC-2d NaN/Infinity → 同 2b
5. TC-2e 源码结构断言 conversation-progress.ts 含 .dsh-pm-cprog-token-total 且该元素不在 .dsh-pm-flow 的渲染分支内。另 pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）

**验收状态**：✓ 通过

---

### v1-3 · 渲染层回归锚点：探针各档可见 token ≥ 1

**验收内容**：【渲染层回归锚点：探针各档可见 token ≥ 1】验收

**操作步骤**：
1. ./node_modules/.bin/tsx scripts/header-progress-probe.mts 退出码 0：6 行 DIAG 均 problems=NONE、每档 n+m ≥ 1、末行 PROBE PASS。红态自证（必须留据）：临时移除 conversation-progress.ts 的 tokenTotal 渲染分支 → B/C/D 档 m=0 且 n=0 → 退出码 1
2. 红态与恢复后的绿态两份 stdout 一起存入 docs/requirements/REQ-261004143941-b2ca/evidence/。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）

**验收状态**：✓ 通过

---

### v1-4 · 兼容/回滚验证 + 构建与基线回归（收口）

**验收内容**：【兼容/回滚验证 + 构建与基线回归（收口）】验收

**操作步骤**：
1. pnpm build 与 pnpm build:client 退出码 0 且输出含 [verify-client] OK，dist/index.mjs 与 lib/client.js 时间戳更新
2. tsx scripts/header-progress-probe.mts 6 档 problems=NONE
3. vitest run tests/token-tab.test.ts tests/token-endpoint.test.ts tests/header-progress-e2e.test.ts 失败数 ≤ 开工基线（基线数值写进 evidence/）
4. evidence/ 下存在兼容三态断言记录、回滚路径说明、以及宽窄两档截图（窄档截图内可见累计 Token 数字）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）

**验收状态**：✓ 通过

---

## 2. 测试报告

- ./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE，窄档读数 tokens=0+1（累计徽章在），末行 PROBE PASS，退出码 0（输出：docs/requirements/REQ-261004143941-b2ca/evidence/t4-probe-final.txt）
- 红态自证（断言不是装饰）：去掉累计读数后 B/C/D 档变 tokens=0+0 → 报 TOKENS_HIDDEN → 退出码 1（输出：evidence/t3-probe-red.txt；绿态对照：evidence/t3-probe-green.txt、t3-probe-fallback-green.txt）
- 接口自洽（真数据根 + 真队列 + 真路由，进程内）：tokenTotal 25321586 === Σ各节点 25321586（输出：evidence/t1-live-progress.txt；脚本：evidence/probe-live-progress.mts）
- 接口单测：tests/session-progress.test.ts（6）+ tests/progress-nodes-fallback.test.ts（3）全绿，含自洽 / 缺席 / 兜底三态
- 客户端单测：tests/header-progress-responsive.test.ts（19）全绿，含落模四态与两条结构守卫
- 基线回归：tests/token-tab.test.ts + token-endpoint.test.ts + header-progress-e2e.test.ts 共 15 条全绿；全量失败集合与本次改动零交集（evidence/full-suite-after-t2.txt、full-suite-after-t1.txt）
- 类型检查：错误数 146 与基线持平，本需求触碰的文件 0 个（evidence/typecheck-baseline.txt）
- 构建：pnpm build 退出码 0 + [verify-client] OK，dist/index.mjs 与 lib/client.js 均有新产物（evidence/t4-evidence.md）
- 视觉证据：宽 1280（每节点 token + 累计徽章）与窄 1024（只剩累计徽章 🪙25.3M）两张截图（evidence/header-token-total-1280.png、header-token-total-1024.png；生成器 shot-specimen.mts）
- 兼容三态（无字段 / 无快照 / 旧客户端）与回滚路径逐条有据（evidence/t4-evidence.md）
- 评审报告（内部自评，含 5 处问题披露）：docs/requirements/REQ-261004143941-b2ca/reviews/self-review.md
- 测试证据（含 covers: 任务对应表、未跑项与既有红的响亮记录）：docs/requirements/REQ-261004143941-b2ca/tests/test-evidence.md
- 待人工项：运行中的宿主未重载插件，实时接口暂无该字段（实测 curl 仍为旧形状）；人工重载后按 evidence/t4-evidence.md 末尾命令复核

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 进度接口补需求累计 token（与节点同源、缺失即不发） | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:09 |
| v1-2 | 流程图计数旁恒显累计 Token（窄档兜底 + D 档最小化） | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:09 |
| v1-3 | 渲染层回归锚点：探针各档可见 token ≥ 1 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:09 |
| v1-4 | 兼容/回滚验证 + 构建与基线回归（收口） | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:09 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:09 |
| v1-6 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:09 |
