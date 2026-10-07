# REQ-261007100513-6749 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：REQ-261007100513-6749 六条 FR 全部落地并逐项自证，7 张父卡（14 张子卡）全 done。

① FR-1/FR-2/FR-3：system prompt 头部只留「绑定关系 + 常量块」，看板状态 / 当前任务 / 阶段纪律正文 / 待捕获提示改从会话尾部增量投递（内容哈希去重 + 按 kind 分化窗口 + 空态不单独投递）。核心判据「连续 8 次变更后头部段版本数 = 1」由剧本钉死；覆盖不依赖穷举生产者——协调层在写路径 / 装配缝 / 回合末做状态比对，rollup、看板路由、confirm、verdicts 造成的状态变化也能到达窗口。
② FR-4/FR-5：reqboard_task_move 支持一次批量推进，回执逐项交代并自带父子卡树摘要；同批卡互不触发 60 秒节流（校验全在写入前完成），节流给出确定等待时间与可做之事（批量走回执字段，单卡走工具层结构化失败回执）。
③ FR-6：子卡默认 60 次请求的软门禁——执法按子会话（与卡片归属无关，多卡并行也生效），归属只决定汇报去向并分三级不猜；到顶先停后报；独立停手位（不连带停其它卡）；放行带 expectedWindowIndex 做 CAS。
④ 一致性：pnpm typecheck 0 错、pnpm build 与 build:client 通过；本需求各套件全部绿。

如实留痕（三条，不当成功宣传）：
1. 效果归因受限：本需求跑在 deepseek-flash，而基线 24 次全量重算是 kimi-coding/k3 的行为；本窗口实测「头部重写不作废缓存」（9 次重写 0 失效点），唯一一次全量重算发生在其前 163.6 分钟空档之后（前缀缓存 TTL 过期；同窗口 29.5 分钟空档未触发）。故 FR-1/FR-2 的 token 收益是供应商相关的，本轮不得以「改造后成本下降」作效果证据。
2. 一处跨需求契约迁移：tests/decompose-tools.test.ts 的节流断言由抛异常改为断言结构化回执（语义不变）。
3. 一处代理口径与一处零余量：验收 ⑪ 的 token 增量是等价有界断言而非真实请求读数；notice-delivery.ts（387 行）、notice-reconciler.ts（377 行）、volatile-notice.ts（400 行）已无余量。

失败归属：全量 95 条失败 = 23 条沙箱环境性 + 他窗口在飞 + 10-06 留底存量红；权威基线差集真新增逐条点名，无一条属本需求。评审报告见 reviews/delivery-review.md，实测记录见 tests/verification-run.md。

## 1. 验收列表

### v1-1 · 定死接口与数据契约（端口 / 可选字段 / 逐项结果类型）

**验收内容**：【定死接口与数据契约（端口 / 可选字段 / 逐项结果类型）】验收

**操作步骤**：
1. ① 本卡改动零类型错误：以 pnpm typecheck 报错集合为判据，报错必须 ⊆ 他人在飞改动引入的集合（实测唯一报错为 tests/query-docs-roots.test.ts 的 TS2415，根因是他窗口 tests/application/harness.ts 给 FakeDocs 新增 private root
2. HEAD 版本无该字段，只读取证）
3. ② npx vitest run tests/contract-types.test.ts 全绿（10 用例）
4. ③ pnpm build:client 退出码 0 且输出含 [verify-client] OK
5. ④ 未 bump REQBOARD_SCHEMA_VERSION 与 QUEUE_VERSION、未动 REQUIRED_TASK_FIELDS
6. ⑤ 契约层对照设计文档逐字核对无偏离（复核 19 项），复核 P2 已按归属携带到 t3/t4/t5/t7 的验收标准。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/contract-types.test.ts → 10 passed；pnpm typecheck → exit 0；pnpm build:client → [verify-client] OK。复核 19 项逐字核对无偏离。

**验收状态**：✓ 通过

---

### v1-2 · 头部段稳定化：易变内容移出 system prompt

**验收内容**：【头部段稳定化：易变内容移出 system prompt】验收

**操作步骤**：
1. ① npx vitest run tests/capture-section-stability.test.ts 全绿（11 例）：同 (facts,tasks) 两次头部组装逐字节相等
2. status 与在制卡变化后头部仍逐字节相等
3. 通道可用时整段逐字节相等
4. 通道不可用时整段含阶段纪律与状态行与任务块
5. 未绑定×待捕获命中时整段与改造前逐字节相同（1060 字符，以 toBe(改造前函数输出) 钉死）
6. 通道判定抛错时整段与未装配逐字节相同。② npx vitest run tests/capture.test.ts tests/stage-prompts.test.ts tests/acceptance-criteria.test.ts → 105 绿 / 1 红，唯一红为存量「不许沉默」（经只读取证：HEAD 源码无该字样，未改断言）。③ 头部文本 2870 字 ≤ 改造前同条件 4919 字。④ 回落整段 4919 → 4934（+15，为清单多一行与状态行去重复标题，已核对非改写）。⑤ 通道契约在注释中写明：available 只表示通道就绪、t3 未就绪前必须返回 false、kind='capture' 生产者归 t3
7. available 抛错按不可用处理并留诊断。⑥ pnpm typecheck 仅剩他人在飞那一条 TS2415
8. 本卡文件均在尺寸门内。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture-section-stability.test.ts → 11 passed（两次组装逐字节相等；状态与在制卡变化后仍相等；未绑定×命中整段与改造前逐字节相同 1060 字符）。受保护套件 105 passed / 1 存量红。

**验收状态**：✓ 通过

---

### v1-3 · 尾部增量投递：内容哈希去重、去抖与降级兜底

**验收内容**：【尾部增量投递：内容哈希去重、去抖与降级兜底】验收

**操作步骤**：
1. ① npx vitest run tests/volatile-notice.test.ts 全绿（25 例）：相同文本只投 1 次、走 next-step、followup 调用数 = 0
2. capture 与 stage 不推进时间即投
3. task 把「A → 空(24 秒) → B」合并为 2 次
4. 空态久留 5 分钟补投一次且不重复。② **头部让位为一次性永久且只在到达确认后上闩**（sealed 只由 claimed 置位，回收仅经迟滞：连续 3 次未确认），故每窗口头部重写 ≤1 次——剧本「连续 8 次变更后头部版本数 = 1」已绿。③ **覆盖不依赖穷举生产者**：协调层在写路径、装配缝、回合末三处做状态比对与差异投递
5. 剧本「经 rollup 不经生产者推进到 accepting」仍能让窗口收到状态行与 accepting 纪律，已绿。④ **到达确认**：claimed 上闩、discarded 清在途并补投、disposed 清理
6. 未确认期间头部继续承载（剧本已绿，两路至少一路在场）。⑤ 五条 P2 落地：直投废旧槽与冲刷前重投影（不再投已消失的任务块）、空态去重优先不推后、迟滞 noticeReclaimAfterFailures=3、哈希改 sha1 且经端口注入（application 层禁 node: 前缀）、空态文案按 implementing 判据。⑥ ⑪ 的恒真断言已改为有意义的有界断言
7. ⑦ 补装配断言
8. 两条把缺陷当预期的用例已明确改写。⑦ 三回归文件仅存量红「不许沉默」
9. apply-wiring 7 绿、contract-types 10 绿
10. pnpm typecheck 仅他人在飞那条 TS2415
11. pnpm build 与 build:client 退出码 0。⑧ 归属：layer-boundary 三条与定向 6 条均与仓内 10-06 留底逐字同号（存量红），baseline 差集与返工前一致且无一条落在本卡。⑨ 口径如实标注：⑪ 的 token 增量仍为等价有界断言而非真实请求读数（如需真读数应单列测量卡）。⑩ 文件尺寸：notice-delivery 387 / notice-reconciler 377 / volatile-notice 400，均未越 400 上限
12. volatile-notice 已无余量。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/volatile-notice.test.ts → 25 passed。剧本：rollup 无生产者仍到达窗口；丢弃后补投；连续 8 次变更后头部版本数 = 1。pnpm build → exit 0。

**验收状态**：✓ 通过

---

### v1-4 · 记账批量推进：逐项结果、回执树摘要、节流结构化

**验收内容**：【记账批量推进：逐项结果、回执树摘要、节流结构化】验收

**操作步骤**：
1. ① npx vitest run tests/task-move-batch.test.ts tests/done-throttle-guidance.test.ts 全绿（22 例）：3 卡全成且回执含 tree
2. 混合批 2 成 1 拒且台账无回滚
3. 批内重复项被拒
4. 旧单卡 11 键不变
5. 批内跨需求两处 writeSeq 各加一
6. 父+子同批父卡被 SUBTASK_GATE 拒
7. tasks 与扁平四参同传以 tasks 为准
8. acceptance-only 可落账
9. 9 在跑 + 2 新开只放行 1。② 节流给出确定等待时间：批量路径回执含 throttleRemainingMs 与 guidance
10. 单卡路径经**工具层结构化失败回执**送达（用例层仍抛错，分层已由用例钉住）。③ 判据未放松：DoneEvidenceSpec / TaskStatus / DependencyGateSpec / limits 的 git diff 为空
11. 门禁在同一 mutate 的强制重读快照上跑（与 HEAD 同源可见性），t9/t12 的 mutate 精确序列回归保持绿。④ 写盘失败逐项点名入回执且失败组不跑 rollup 与 RTM。⑤ 跨需求契约迁移仅一处并已登记：tests/decompose-tools.test.ts 的节流断言由抛错改为断言结构化回执（语义不变）。⑥ 我独立复核：8 文件实跑集失败仅 5 条存量红（他人 in-flight，逐条点名）且与节流无关
12. pnpm typecheck 只剩他人在飞那一条 TS2415。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/task-move-batch.test.ts tests/done-throttle-guidance.test.ts → 22 passed；use-cases 21 passed。混合批 2 成 1 拒不回滚；旧单卡 11 键逐字不变；节流回执含剩余毫秒与 guidance。

**验收状态**：✓ 通过

---

### v1-5 · 子卡预算软门禁：计数、到顶先停后报、幂等放行

**验收内容**：【子卡预算软门禁：计数、到顶先停后报、幂等放行】验收

**操作步骤**：
1. ① npx vitest run tests/subtask-budget.test.ts 全绿（17 例）：预算 3 时第 3 次后不再发起新请求且停止指令早于汇报
2. 未放行第 4 次不成立
3. 放行后窗口重置可继续
4. 重复放行幂等
5. 计数不可得标注且不按 0 通过。② **执法按子会话、与卡片归属无关**：多卡并行（executions 里写的是窗口码这一真实形状）下仍到顶停手，卡评论 0 条、需求级评论真落 comments.jsonl 并点名子会话 id 与归属未定
6. fork 窗口（origin 未定义但有 parentSession）零窗口零停止。③ 子会话判据为正向前提（origin 为 subagent 或 delegationDepth 大于 0），不复用反向 isIgnoredSession。④ 独立停手位：不复用人工门 in-flight、不写 driverHealth、不用 deliver 与 followup
7. 放行只清该卡，同需求其它可开工卡不受影响（用例 :388 重进、:408 卡 A 停不影响卡 B）。⑤ 放行带 expectedWindowIndex 做 CAS：不匹配即拒 REQBOARD_CONFLICT 并回报当前窗口号、零写入。⑥ 写失败内存态权威累计加 memoryDiverged 诊断，连续写失败仍到顶。⑦ limits.subtaskRequestBudget=60 单一落点
8. 未新造错误码
9. 未改任何既有门禁判据。⑧ pnpm typecheck 0 错、pnpm build 成功
10. 全量 95 条失败经我分类：23 条沙箱环境性（child_process 被拒）、其余为他窗口在飞与 10-06 留底存量红
11. 权威基线差集真新增逐条点名，**无一条属本需求**。⑨ 如实留痕：本轮动 12 个文件（含 tests/task-move-batch.test.ts 的 budget 键集合断言以容纳 expectedWindowIndex）、新增两个模块
12. 未归属会话的计数只存内存不落盘，其停手位靠 TTL 与重新派发收敛。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/subtask-budget.test.ts → 17 passed。多卡并行（executions 写窗口码）仍停手且不误挂卡；fork 窗口零计数；独立停手位只清该卡；CAS 不匹配即拒零写入。

**验收状态**：✓ 通过

---

### v1-6 · 固化同口径成本度量命令

**验收内容**：【固化同口径成本度量命令】验收

**操作步骤**：
1. ① pnpm cost:report --req REQ-261006130057-7a43 --until 1791338511286 的五项读数与诊断报告逐位相同（请求 2,324
2. 未命中 9,484,808
3. 命中缓存 402,700,547
4. 输出 1,400,237
5. 跨度 21.1h）
6. ② 输出含缓存失效点清单（24 条），且逐条如实标注前 60 秒内有无 system/message（19 有 / 5 无）
7. ③ 树根与单会话根各做一次独立实现交叉验证，读数逐位相同
8. ④ 判据以基线快照点为准：源会话仍在增长，默认全量口径与快照的差值不作为判据。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm cost:report --req REQ-261006130057-7a43 --until 1791338511286 → 2,324 / 9,484,808 / 402,700,547 / 1,400,237，与诊断报告逐位相同；分层 517 与 1,807 亦一致；另经独立实现交叉验证两例。

**验收状态**：✓ 通过

---

### v1-7 · 兼容与迁移回归：旧调用方、旧台账、豁免口径

**验收内容**：【兼容与迁移回归：旧调用方、旧台账、豁免口径】验收

**操作步骤**：
1. ① npx vitest run tests/legacy-compat-6749.test.ts 全绿（19 例）：旧台账无 budgetRequests 时校验通过且开窗取 60
2. 旧单卡回执键集合逐字不变（不含 results/partial/tree/tree_note/guidance）
3. 子卡 done 仍豁免 60 秒节流而父卡与存量卡受约束
4. 运行态文件缺失或版本未知或截断 JSON 时按「计数不可得」显式降级且不抛
5. schema 版本 9 与队列版本 1 逐字未变
6. 旧格式台账读写不需迁移。② **可证伪性（本轮的核心收紧）**：复核点名的 4 次变异（假形状夹具、删 REQUIRED_TASK_FIELDS、删 port.write、删运行态 v 校验）现已**全部变红**
7. 实现者另 14 条变异亦全红、还原复绿。③ 夹具按真实形状（executions.sessionId 用窗口码），断言真实降级去向（父窗口兜底写卡评论、多卡并行未归属写需求级评论且不写卡评论）。④ 修掉 note 丢弃这条真缺口：非法 budgetRequests 的降级诊断经既有 diag 通道落痕（授权改 ExecuteTask.ts 与 request-counter.ts 各一处最小改动，不新造码、不阻断开工）。⑤ 计划落点命名冲突已消歧：新增文件为 legacy-compat-6749.test.ts
8. 既有 tests/legacy-compat.test.ts 未被动（sha1 与 HEAD 逐字相同，我独立复核）。⑥ pnpm typecheck 0 错
9. 受影响与相邻 7 套件 98 例通过。⑦ 设计同步：expectedWindowIndex 与 REQBOARD_CONFLICT 已补进 interfaces.md（父窗口完成）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/legacy-compat-6749.test.ts → 19 passed。复核自挑 4 次变异返工后全部变红。既有 tests/legacy-compat.test.ts 未动，sha1 与 HEAD 逐字相同。

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm typecheck → exit 0；pnpm build 与 build:client → exit 0 且 [verify-client] OK；全量 vitest 95 条失败分类为沙箱 child_process 环境性 23 条 + 他窗口在飞 + 10-06 留底存量红，权威基线差集真新增无一条属本需求。六条 FR 全部 received，21 张卡全 done。

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1（立项解决这个问题）：交付范围即本需求的六条 FR，诊断报告作为输入证据引用。D-2（范围=A1/A2 缓存前缀稳定化 + A3 记账合并 + A6 节流 + A5 子卡预算；A4/A7 与 B 系列出界）：A1/A2 落 t2+t3（头部稳定化 + 尾部投递）、A3 落 t4（批量与逐项回执）、A6 落 t4（节流给确定等待与可做之事）、A5 落 t5；A4（复核输入包替代 fork）与 A7（Token Tab 成本可视化）未做，B 系列流程纪律未改 —— 均在「边界（不做什么）」逐条声明；执行期虽按 A4 原则派单（紧凑输入包、不用 fork），但那是做法而非代码交付，不计入范围。D-3（软门禁：默认 60 次/卡、超限先停再汇报、续跑须 owner 显式放行并留痕）：落 t5，语义逐条保留；复核否决了实现路径（归属桥不存在）后改为「执法按子会话、归属只决定汇报去向」，这是实现路径变更而非语义变更 —— 默认值仍为 60、仍先停后报、仍须 owner 经 reqboard_task_move({budget:{release:true}}) 显式放行且留痕（另有 CAS 防

**验收状态**：◻ 未复核（未附实际结果）

---

## 2. 测试报告

- npx vitest run tests/contract-types.test.ts → 10 passed
- npx vitest run tests/capture-section-stability.test.ts → 11 passed（头部逐字节稳定；未绑定×待捕获命中整段与改造前逐字节相同 1060 字符）
- npx vitest run tests/volatile-notice.test.ts → 25 passed（含 rollup 无生产者仍覆盖、丢弃后补投、连续 8 次变更后头部版本数 = 1）
- npx vitest run tests/task-move-batch.test.ts tests/done-throttle-guidance.test.ts → 22 passed
- npx vitest run tests/subtask-budget.test.ts → 17 passed（多卡并行仍停手、fork 窗口不计入、独立停手位、CAS 冲突零写入）
- npx vitest run tests/legacy-compat-6749.test.ts → 19 passed
- npx vitest run tests/application/use-cases.test.ts tests/task-move-role.test.ts tests/task-move-snapshot.test.ts tests/output-contract.test.ts → 全绿
- pnpm typecheck → exit 0；pnpm build 与 build:client → exit 0 且 [verify-client] OK
- pnpm cost:report --req REQ-261006130057-7a43 --until 1791338511286 → 2,324 / 9,484,808 / 402,700,547 / 1,400,237 逐位复现
- npx tsx scripts/test-baseline.mts --check → 真新增逐条点名，无一条属本需求
- 评审报告（21 卡 covers 对照 + 逐卡复核结论）：docs/requirements/REQ-261007100513-6749/reviews/delivery-review.md
- 实测记录（covers 标注 + 套件读数 + 关键性质剧本 + 变异测试 + 失败归属 + 成本读数与三条免责声明）：docs/requirements/REQ-261007100513-6749/tests/verification-run.md
- 变异证据：复核自挑 4 次变异返工后全部变红，另 14 条自挑变异亦全红
- 设计同步：budget.expectedWindowIndex 与 REQBOARD_CONFLICT 已补进 design/interfaces.md
- 诊断报告两处更正：头部重写作废缓存属供应商相关；失效点前 60 秒并非必有 system/message（19/24）
- 跨需求契约迁移：tests/decompose-tools.test.ts 的节流断言（抛异常 → 结构化回执，语义不变）
- 存量红只读取证：HEAD 的 capture-section.ts 已无「不许沉默」字样，而 HEAD 测试已断言它

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死接口与数据契约（端口 / 可选字段 / 逐项结果类型） | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-2 | 头部段稳定化：易变内容移出 system prompt | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-3 | 尾部增量投递：内容哈希去重、去抖与降级兜底 | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-4 | 记账批量推进：逐项结果、回执树摘要、节流结构化 | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-5 | 子卡预算软门禁：计数、到顶先停后报、幂等放行 | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-6 | 固化同口径成本度量命令 | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-7 | 兼容与迁移回归：旧调用方、旧台账、豁免口径 | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-57f49896-70ca-4e67-b9f2-acc2cbdcc531 | 2026-10-07 15:59 |
| v1-9 | 需求级验收 | ◻ 未复核（未附实际结果） | human | 2026-10-07 16:16 |
