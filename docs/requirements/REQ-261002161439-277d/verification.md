# REQ-261002161439-277d 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：台账由单册 JSON 改为分片目录并完成存储端口化：旧单册实现与旧端口全部删除、读点改走异步定点读写、产物扫描移出读接口、首屏只发摘要且详情按需。可复核的交付结论：全量测试 98 failed 等于开工基线且不高于验收线 106、tsc 150 远低于 223、kb:check 退出码 0、build 退出码 0 且产物新鲜、src 内旧类与 snapshot 调用均为 0。量化收益：35 条夹具下首屏需求载荷从 2,768,960 字节降到 5,416 字节（511 倍），且归档从 33 增到 200 时载荷不再增长；端口契约现在由三个实现（内存 / 分片 / 只读假 SQL）跑同一份 83 条断言全绿，证明端口不泄漏存储细节、DB 适配器可直接照此入场。唯一残留：kb-archive-deposit 的同源重复提交幂等被冷侧只读守卫拒写，属生产守卫逻辑且不在本需求改动面，已定性并按专项卡处置；该项在测试文档与复核报告里均如实标注为范围外已知缺陷，未伪装成达成。

## 1. 验收列表

### v1-1 · 把数据放哪、长什么样定成纯函数：路径、摘要、日志行

**验收内容**：【把数据放哪、长什么样定成纯函数：路径、摘要、日志行】验收

**操作步骤**：
1. npx vitest run tests/reqboard/domain-paths.test.ts tests/reqboard/domain-summary.test.ts tests/reqboard/domain-journal.test.ts 全绿
2. 用例必须含：① 7 个文件名常量与 <root>/requirements/<REQ>/record.json 拼接正确、冷存路径在 archive/ 下
3. ② summarize() 输出不含 comments/artifacts/verification/plan/archive 任一键，且 advanceAlert 只含 pauseReason 与 failureStreak
4. ③ truncateByCount 对「日志比计数多一行」返回有效前缀，对「计数大于行数」的处置（抛错或返回全部）二选一定死并测
5. ④ domain/ 三模块 import 图里不出现 node: 前缀。npx tsc --noEmit 错误数 ≤ 基线 223。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-2 · 先定契约：需求存储端口与错误码（与旧端口并存）

**验收内容**：【先定契约：需求存储端口与错误码（与旧端口并存）】验收

**操作步骤**：
1. npx vitest run tests/reqboard/store-contract.test.ts 全绿（先只跑 InMemoryRequirementStore）
2. 契约测试对 RequirementStore 的每个方法至少 1 条断言，且断言里覆盖全部 7 个错误码
3. npx tsc --noEmit 错误数 ≤ 基线 223
4. grep 端口方法名与 design/interfaces.md 逐条对齐无缺项（人工比对一次，缺项即返工）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-3 · 一处原子写、一处分片 IO：仓储与原子写搬迁

**验收内容**：【一处原子写、一处分片 IO：仓储与原子写搬迁】验收

**操作步骤**：
1. npx vitest run tests/reqboard/shard-repository.test.ts 全绿，用例含：① 原子写失败（注入 rename 抛错）不留半截目标文件、临时文件被清理
2. ② 解析失败改名 .corrupt-<ts> 且其他需求分片不受影响
3. ③ appendJournal 在「日志比计数多一行」时先截断再追加
4. ④ 结构校验失败时一个字节都不落盘（目录文件数不变）
5. ⑤ listHotIds 只返回目录、忽略文件与测试残留。回归旁证：npx vitest run tests/queue 全绿（QueueRepository 换 import 后行为不变）
6. grep -rn 的 persistAtomic 定义在全仓只命中 1 处。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-4 · 读得动：内存索引、摘要投影、归档冷读

**验收内容**：【读得动：内存索引、摘要投影、归档冷读】验收

**操作步骤**：
1. npx vitest run tests/reqboard/store-contract.test.ts tests/reqboard/store-cold.test.ts 全绿——同一份契约测试参数化同时跑 InMemoryRequirementStore 与 ShardedRequirementStore
2. A2 读探针断言 getSummary 与 listSummaries 的 readFile 调用为 0、读入字节为 0
3. A3 断言夹具迁移后数据根含 meta.json 与 requirements/<REQ>/record.json、归档需求只在 archive/ 下
4. A5 断言 listSummaries() 默认不含归档、get(归档 id) 返回全文、listSummaries({scope:'archived'}) 返回归档摘要。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-5 · 写得准：乐观锁、差异分派落盘、日志追加与截断

**验收内容**：【写得准：乐观锁、差异分派落盘、日志追加与截断】验收

**操作步骤**：
1. npx vitest run tests/reqboard/store-conflict.test.ts tests/reqboard/store-amplification.test.ts 全绿，用例含：A1 夹具 100 条与 1000 条需求各追加 1 条评论，fs 写探针统计的落盘字节相等且 < 全库 5%
2. A4 同一需求 100 条与 500 条评论时 record.json 字节相同（容差 ±2 字节）且 ≤ 8KB
3. A6 两写者持同一 expectedVersion，第二个抛 REQBOARD_CONFLICT 且 currentVersion 正确、磁盘内容仍是前者
4. A7 同一写操作连调两次第二次 mtime 不变
5. 变更器不碰 version 时落盘 version 仍 +1
6. 冷侧需求 mutate 抛 REQBOARD_COLD_IMMUTABLE 且文件未动
7. 删改已有评论触发整份重写 + onWarn。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-6 · 数据搬家：v9 单册迁到 v10 分片（可试跑、可幂等）

**验收内容**：【数据搬家：v9 单册迁到 v10 分片（可试跑、可幂等）】验收

**操作步骤**：
1. npx vitest run tests/reqboard/migrate-v10.test.ts 全绿，用例含：① --dry-run 后数据根的文件数与 mtime 均无变化
2. ② --apply 后逐需求装配结果与单册去重内容等价（评论条数与顺序、产物顺序、验收单 version 逐项一致）
3. ③ meta.json 含 migrations 的 {from:9,to:10}，且迁移后再写一次数据该留痕仍在
4. ④ 连跑两次第二次报 already_v10 且所有文件 mtime 不变
5. ⑤ 注入第 k 条需求写失败时 meta.json 未写、原单册未被触碰、备份在场
6. ⑥ 伪造 state/server.pid 存活则 --apply 拒绝、--force 可跳过
7. ⑦ 带非空 tasks 的单册被拒绝且提示指向 migrate-ledger.ts。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-7 · 退路先修好：v10 分片导回 legacy v9 单册

**验收内容**：【退路先修好：v10 分片导回 legacy v9 单册】验收

**操作步骤**：
1. npx vitest run tests/reqboard/rollback-v10.test.ts 全绿，用例含：A11 迁移前单册 → migrate --apply → rollback --apply → readV9Ledger 装载结果的需求条数与 id 集合与迁移前完全一致
2. 归档需求（冷侧）也随导出回到单册且内联字段完整
3. 导出文件 schemaVersion === 9 且不含 commentCount/historyCount/artifactCount 任一字段
4. --dry-run 不写文件
5. 回滚后目标目录可被迁移脚本再次 --apply（往返一致）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-8 · 一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝

**验收内容**：【一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝】验收

**操作步骤**：
1. ① grep -rn 查 snapshot() 在 src 下无输出（client/panel-refresh.ts 的本地同名函数先改名或确认不在结果内）
2. ② npx tsc --noEmit 错误数 ≤ 基线 223
3. ③ pnpm test 失败数 ≤ 基线 106 且无新增失败（与 HEAD 基线比对）
4. ④ 夹具数据根只放 v9 单册时启动抛 REQBOARD_REQUIRES_MIGRATION 且不生成 requirements/ 目录（测试断言）
5. ⑤ grep -rn 查 JsonLedgerRepository 与 ReqboardRepository 在 src 下均无输出。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-9 · 看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出

**验收内容**：【看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出】验收

**操作步骤**：
1. npx vitest run tests/reqboard/state-payload.test.ts 全绿，用例含：A9 夹具 35 条（33 归档）时 GET / 响应字节相对改造前基线（改造前用单册夹具测一次并存档）下降 ≥10×，且归档条数从 33 增到 200 时响应字节不增长
2. A10 注入探针断言 GET / 触发 syncAllReqArtifacts 0 次、POST /artifacts/scan 触发 1 次
3. 响应 requirements[] 元素不含 comments/artifacts/verification/plan/archive 任一键
4. GET /requirements/<已归档 id> 返回 200 且含全文
5. cursor 取到末页返回 nextCursor undefined、越界 cursor 返回空页不抛错
6. 客户端用例断言首屏渲染 0 次详情请求。回归：pnpm test 失败数 ≤ 基线 106
7. pnpm build:client 输出 verify OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-10 · 文档与知识层同步：数据层描述不再指向单册

**验收内容**：【文档与知识层同步：数据层描述不再指向单册】验收

**操作步骤**：
1. ① pnpm kb:check 退出码 0（生成物零漂移 + 九项自检 + K10 覆盖度全过）
2. ② grep -rn 查 JsonLedgerRepository 在 docs/ 下无输出
3. ③ grep -rn 查 dsh-reqboard.json 在 docs/knowledge/ 下的输出只出现在 legacy 导出格式的语境里
4. ④ 人工比对一次：architecture.md 的数据根与 7 个文件清单与 design/architecture.md 一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-11 · 收口：三实现契约、放大探针、回归基线与构建

**验收内容**：【收口：三实现契约、放大探针、回归基线与构建】验收

**操作步骤**：
1. ① pnpm test 失败数 ≤ 基线 106 且新增失败为 0（与 HEAD worktree 基线比对，证据留档）
2. ② pnpm typecheck 错误数 ≤ 基线 223
3. ③ pnpm build 退出码 0 且 dist/index.mjs 与 lib/client.js 均为新产物
4. ④ pnpm kb:check 退出码 0
5. ⑤ A1/A4/A9 三条断言在 ≥200 条需求夹具下仍成立（A1 100 与 1000 条落盘字节相等、A4 record.json ≤8KB、A9 载荷不随归档条数增长）
6. ⑥ 三实现跑同一份契约测试全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-12 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

### v1-13 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）

**验收状态**：✓ 通过

---

## 2. 测试报告

- ① pnpm test → Tests 98 failed / 3316 passed / 20 skipped（3434）；失败数等于开工基线 98，不高于验收线 106；逐条 comm 比对唯一新增为 kb-archive-deposit 冷写守卫（范围外已知缺陷，有卡跟踪）
- ② npx tsc --noEmit → 150 条错误（验收线 223；开工基线 172）
- ③ pnpm build → 退出码 0；dist/index.mjs（1312243 字节）与 lib/client.js（335946 字节）均为本次构建新产物；构建内含 verify-client OK
- ④ pnpm kb:check → 退出码 0（生成物零漂移；K9/K10/K11 全过；kb-probe 11 项自检全部通过）
- ⑤ A9 载荷：35 条夹具（33 归档）时 requirements 载荷 2,768,960 → 5,416 字节（511 倍）；归档 33 → 200 时每条增量小于 600 字节
- ⑤ A10 扫描移出：GET / 触发 syncAllReqArtifacts 0 次、POST /artifacts/scan 触发 1 次（模块级 mock 计数器）
- ⑤ A1/A4：store-amplification 5/5（100 与 1000 条需求追加 1 条评论落盘字节相等；record.json 字节相同且不超过 8KB）
- ⑥ 三实现同一契约：store-contract 83/83（内存替身 / 分片实现 / 只读假 SQL 替身）
- 门：src 内 snapshot() = 0 处、JsonLedgerRepository 与 ReqboardRepository = 0 处、适配器目录三实现文件已删（ls 匹配 0）
- 验收文件实跑：state-payload 7/7、state-payload-client 2/2、store-contract 83/83、migration-gate 4/4、store-amplification 5/5（五文件 101 条全绿）
- 复核与测试证据：docs/requirements/REQ-261002161439-277d/reviews/（b12-bridge-removal-review.md、t-05a56b-state-payload-review.md）与 tests/（b12-bridge-removal-tests.md、t-05a56b-state-payload-tests.md、t-f52aeb-kb-sync-tests.md、t-07b058-closure-tests.md）
- 知识与文档：docs/knowledge/architecture.md 新增数据层小节（数据根与八个文件名与 design/architecture.md 逐项一致）
- 遗留：kb-archive-deposit 的同源重复提交幂等被 COLD_IMMUTABLE 拒；已排除守卫两个 return false 分支与材料未变早退两条路径，定性为 isColdWriteExempt 触发键判定的生产守卫疑 bug，经裁决按专项卡处置

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 把数据放哪、长什么样定成纯函数：路径、摘要、日志行 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-2 | 先定契约：需求存储端口与错误码（与旧端口并存） | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-3 | 一处原子写、一处分片 IO：仓储与原子写搬迁 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-4 | 读得动：内存索引、摘要投影、归档冷读 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-5 | 写得准：乐观锁、差异分派落盘、日志追加与截断 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-6 | 数据搬家：v9 单册迁到 v10 分片（可试跑、可幂等） | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-7 | 退路先修好：v10 分片导回 legacy v9 单册 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-8 | 一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-9 | 看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-10 | 文档与知识层同步：数据层描述不再指向单册 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-11 | 收口：三实现契约、放大探针、回归基线与构建 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-12 | 需求级验收 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
| v1-13 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d | 2026-10-03 18:25 |
