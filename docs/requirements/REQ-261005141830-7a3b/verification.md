# REQ-261005141830-7a3b 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：把「是不是同一个项目」从路径字符串比较换成项目 id 相等（映射链 session → projectId → workspaceRoot）。看板、产物扫描、知识层自举与子代理根一律按项目身份定位；同项目多窗口天然归一，跨项目派席/交接/改绑当场拒绝并说清两个项目与判据来源；存量 74 条一条不改、不拒写，老 SQLite 库开库幂等补列，退回去只需摘掉项目表装配。需求文档七条验收标准逐条跑通：identity 49 条 + 三窗口 E2E 6 条全绿；project-scope 零新增失败；全量 67 失败 / 5456 通过（开工前 68，少一条）；本需求文件零新增类型错误；知识层生成物零漂移；六条接线的「停用即红」证据落盘，测试证据与实施评审另附两册（12 张父卡 + 32 张子卡全部有测试覆盖）。三条如实声明：① 台账出现带身份的新记录需宿主重载新产物（当前宿主仍跑旧 build），用例层已证明新立项会写身份；② project-scope 唯一失败项与 kb 闸门四项缺口均属 HEAD 既有或他需求在途，本需求零贡献；③ 当前整仓类型检查一条错误来自另一窗口 15:34 的在途文件。

## 1. 验收列表

### v1-1 · 立项目身份底座：注册表端口 + 三个纯函数

**验收内容**：【立项目身份底座：注册表端口 + 三个纯函数】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-01（两会话各解出各自 projectId）→ 绿
2. -t T-02（未装配 / list 抛错 / 未命中 → undefined 且不抛不编造）→ 绿
3. -t T-03~-t T-07（同 id 异路径=同项目 / 异 id 同形路径=不同项目 / 缺 id 走路径兜底且 attributed=false / 两侧缺不猜 / id→条目 path）→ 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-2 · 数据契约：projectId 字段、摘要投影、落库列与查询过滤

**验收内容**：【数据契约：projectId 字段、摘要投影、落库列与查询过滤】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-08（记录与摘要都带 projectId）→ 绿
2. -t T-10（同项目 3 条 / 另一项目 0 条）→ 绿
3. -t T-16（老库加列后旧行读 undefined 且不丢数据）→ 绿
4. pnpm typecheck → 改动文件零新增错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-3 · 根解析换源：读写两侧由项目 id 带出根

**验收内容**：【根解析换源：读写两侧由项目 id 带出根】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-13（取根走项目条目、不读共享单例当前值）→ 绿
2. -t T-14（存量回落 workspaceRoot 并标注 attributed=false）→ 绿
3. -t T-15（两者都缺 → 结构化失败码，不是空串）→ 绿
4. npx vitest run tests/design-gate-workspace-root.test.ts → 零新增失败。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-4 · 立项定身份：写入 projectId 与未归属标注

**验收内容**：【立项定身份：写入 projectId 与未归属标注】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-08 → 绿
2. -t T-09（无归属窗口不写 id 且评论含「未归属」）→ 绿
3. -t T-11（同项目另一窗口立项不被「本项目已有需求」拒）→ 绿
4. -t T-12（推进 1 条不动另 2 条）→ 绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-5 · 看板 / 扫描 / 知识层 / 子代理根一律按项目

**验收内容**：【看板 / 扫描 / 知识层 / 子代理根一律按项目】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-10 → 绿
2. npx vitest run tests/project-scope.test.ts → 零新增失败（别人项目记录不被污染、写盘点名单同步）
3. npx vitest run tests/project-identity.e2e.test.ts -t E-01（三窗口产物互不越界）与 -t E-02（写入期间邻居改走单例根仍落本项目）→ 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-6 · Dive 归属按项目、派席与交接拦跨项目

**验收内容**：【Dive 归属按项目、派席与交接拦跨项目】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-17（归属不等 → 零投递 + 留痕）→ 绿
2. -t T-18~-t T-21（跨项目派席/交接被拒且台账零改动、同项目异 session 成功、解绑不校验）→ 全绿
3. npx vitest run tests/project-identity.e2e.test.ts -t E-03（同项目双窗口起轮只 1 次）与 -t E-04（HTTP 返回跨项目码）→ 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-7 · 判据可观测与项目文档更新

**验收内容**：【判据可观测与项目文档更新】验收

**操作步骤**：
1. 触发一次跨项目拒绝 → 回执或评论含两侧 projectId 与判据来源
2. pnpm kb:check → 退出码 0（生成物零漂移 + 九项自检 + 覆盖度全过），若既有缺口则如实点名。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-8 · 迁移与兼容：存量记录与老 SQLite 库

**验收内容**：【迁移与兼容：存量记录与老 SQLite 库】验收

**操作步骤**：
1. npx vitest run tests/project-identity.test.ts -t T-14 / -t T-15 / -t T-16 → 全绿
2. 台账分布命令（~/.dsh/reqboard/**/record.json）仍列出存量记录且均可读写、未归属标注在场。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-9 · 三窗口端到端回归与判别力自证

**验收内容**：【三窗口端到端回归与判别力自证】验收

**操作步骤**：
1. npx vitest run tests/project-identity.e2e.test.ts → E-01~E-04 全绿
2. pnpm test → 失败数 ≤ HEAD 基线（先在 HEAD 取一次基线数）
3. 六条停用证据各有一份可复核输出。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**操作步骤**：
1. E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/project-identity.test.ts → Tests 49 passed（T-01~T-21 全绿）
- npx vitest run tests/project-identity.e2e.test.ts → Tests 6 passed（E-01 各看各的且产物互不越界 / E-02 邻居改走共享根仍落本项目 / E-03 同项目双窗口起轮只一次 / E-04 跨项目改绑 HTTP 400 + 错误码）
- npx vitest run tests/project-scope.test.ts → 1 failed / 27 passed；唯一失败项 EnsureKnowledgeLayer 裸写点在 HEAD 处逐字存在（git show HEAD 核验）⇒ 零新增失败
- npx vitest run（全量）→ Tests 67 failed / 5456 passed（5545 条）；开工前基线 68 failed（本次少一条），design/test-cases.md 记录的 HEAD 基线为 106 failed；失败文件集合与开工前逐条一致
- npx tsc --noEmit → 本需求改动文件零新增错误；当前整仓唯一一条错误在 tests/open-window-inherit.test.ts:688（另一窗口 15:34 在途改动，零 projectId 痕迹）
- 判别力自证（六条接线 + 一条补充，全部停用变红再逐字节还原）：docs/requirements/REQ-261005141830-7a3b/evidence/t9-stop-red.md
- 测试证据（17 条 TC，逐条命令 + 输出摘要 + covers/validates，覆盖全部 32 张子卡）：docs/requirements/REQ-261005141830-7a3b/tests/test-evidence.md
- 实施评审记录（10 项评审点 + 5 条已处理问题 + 5 条遗留观察）：docs/requirements/REQ-261005141830-7a3b/reviews/implementation-review.md
- 兼容与回滚（存量 74 条不迁移不拒写、老 SQLite 库幂等补列、最小回滚＝摘掉项目表装配、数据层零回滚）：docs/requirements/REQ-261005141830-7a3b/notes/rollback.md
- 文档口径落地：docs/architecture/gate-read-root.md 新增「根从哪来：项目身份优先、路径兜底」节；docs/architecture/project-manual.md 新增机制备忘「项目身份与跨项目拦截」并修正知识层去重口径那一行
- 知识层生成物：npx tsx scripts/kb-build.mts --check → 零漂移；kb-probe 11 项检查 4 项失败全部来自其他在途需求（kb-0043 条目问题、INDEX 超预算、6 个未归类脚本），本需求新增脚本 0、新增知识条目 0
- 台账分布命令（python3 读 ~/.dsh/reqboard/**/record.json）→ 74 条存量全部在盘（本项目 58 / 另一项目 7 / 第三处 6 / 无根 3），projectId 一律为空 ⇒ 存量按路径兜底并标注未归属

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 立项目身份底座：注册表端口 + 三个纯函数 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-2 | 数据契约：projectId 字段、摘要投影、落库列与查询过滤 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-3 | 根解析换源：读写两侧由项目 id 带出根 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-4 | 立项定身份：写入 projectId 与未归属标注 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-5 | 看板 / 扫描 / 知识层 / 子代理根一律按项目 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-6 | Dive 归属按项目、派席与交接拦跨项目 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-7 | 判据可观测与项目文档更新 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-8 | 迁移与兼容：存量记录与老 SQLite 库 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-9 | 三窗口端到端回归与判别力自证 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-10 | 需求级验收 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:37 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-97aa4376-441a-4f0a-800a-7b13aad48a09 | 2026-10-05 15:38 |
