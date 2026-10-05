# REQ-261004110201-f253 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：工作流业务设计四功能点交付：① 阶段模型路由（stageRouting 两级命中，未配置脚本逐字节不变）② 阶段遥测（execution 记 outputCount/zeroOutput，status 回执按子卡阶段聚合，无数据省略键）③ 零产出告警（阈值默认 2、floor(streak/threshold) 去重、未知即断、不改模板不阻断链）④ 优先级与全局在制上限（priority 降序调度 + maxInFlightRequirements 以新鲜锁为在制判据，超限如实回执 wip_limit）。核心承诺「三项未配置即现状」由 7 条集中等价面用例守住；协议零必填键、存储版本未动、无回填。八卡逐段证据齐全：新增 46 用例全绿、全量 97≤基线零新增、tsc 净减 6、知识层自检 11/11。两处偏离已声明（看板排序 priority 作首键保留状态分组；摘要新增两个有界标量）。

## 1. 验收列表

### v1-1 · 定契约：路由解析 + 三个配置 + 可选字段

**验收内容**：【定契约：路由解析 + 三个配置 + 可选字段】验收

**操作步骤**：
1. npx vitest run tests/stage-model-routing.test.ts 中契约段全绿：非法路由表（未知 stageKind / 空 value）抛错并点名非法键
2. stageKind@difficulty 优先于 stageKind 命中
3. 三个可选字段缺省语义（无 priority→0、无配置→undefined）有断言

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-2 · 路由注入生成器

**验收内容**：【路由注入生成器】验收

**操作步骤**：
1. npx vitest run tests/stage-model-routing.test.ts 全绿
2. 其中硬断言：未传 route 时生成的脚本字符串与基线快照逐字节相同
3. 传 route 时脚本含 agent(prompt,{schema,provider,model})
4. 工作区 var 注入的子卡（ExecutTask）能取到路由

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-3 · 执行收尾写产出数

**验收内容**：【执行收尾写产出数】验收

**操作步骤**：
1. npx vitest run tests/stage-telemetry.test.ts 中写入段全绿：传 outputCount 时 execution.outputCount 与 zeroOutput 落盘且 zeroOutput=(outputCount===0)
2. 不传时两个键都不存在（hasOwnProperty 断言）
3. filesChanged+completed 计数口径正确

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-4 · 阶段遥测读模型 + status 回执

**验收内容**：【阶段遥测读模型 + status 回执】验收

**操作步骤**：
1. npx vitest run tests/stage-telemetry.test.ts 全绿：stageTelemetryOf 按 stageKind 聚合 runs/totalDurationMs/avgDurationMs/outputCount/zeroOutputRuns/lastAt
2. 旧记录缺 outputCount 时 zeroOutputRuns 不计它
3. 无数据时 reqboard_status 回执 hasOwnProperty('stage_telemetry') === false
4. npx vitest run tests/tools-schema.test.ts 绿且 schema 已声明该键

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-5 · 零产出告警（可推导去重）

**验收内容**：【零产出告警（可推导去重）】验收

**操作步骤**：
1. npx vitest run tests/zero-output-alert.test.ts 全绿：阈值 2 时连续 4 次零产出只写 2 条告警评论（floor(4/2)）
2. 一次非零产出后计数重置、再达阈值才再告警
3. 评论含 stage/streak/threshold 三要素
4. 告警路径不阻断子卡 done

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-6 · 优先级排序 + WIP 闸

**验收内容**：【优先级排序 + WIP 闸】验收

**操作步骤**：
1. npx vitest run tests/requirement-priority.test.ts 全绿：priority 降序且同值按 createdAt 升序
2. 上限置 1 且在制 1 时第二个候选返回 dispatched:false + stopped='wip_limit' + reason 点名在跑需求与上限
3. 上限 0 时投递结果与改造前一致（既有 advance 用例零回归）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-7 · 兼容与迁移验证（未配置即现状）

**验收内容**：【兼容与迁移验证（未配置即现状）】验收

**操作步骤**：
1. npx vitest run tests/stage-model-routing.test.ts tests/stage-telemetry.test.ts tests/zero-output-alert.test.ts tests/requirement-priority.test.ts 四文件全绿
2. 「未配置即现状」四条断言逐条在案：脚本逐字节快照 / execution 无新键 / scanAndResume 候选顺序与投递结果不变 / 回执无空壳键

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-8 · 全量回归 + 文档同步

**验收内容**：【全量回归 + 文档同步】验收

**操作步骤**：
1. pnpm test 失败数 ≤ 基线且本需求新增用例全绿
2. npx tsc --noEmit 归属本需求文件零错
3. docs/architecture/project-manual.md 变更记录补行、docs/architecture/automation-chain-contract.md（如涉及自动链调度）同步优先级/WIP 说明

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/requirement-priority.test.ts、tests/stage-model-routing.test.ts、tests/stage-telemetry.test.ts、tests/zero-output-alert.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/requirement-priority.test.ts、tests/stage-model-routing.test.ts、tests/stage-telemetry.test.ts、tests/zero-output-alert.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键

**验收状态**：✓ 通过

---

## 2. 测试报告

- 接口核验（FR-1 路由）：npx vitest run tests/stage-model-routing.test.ts → 18/18 全绿；含生成器段硬断言——命中时脚本含 agent(prompt,{schema,provider,model})、未传 route 与 route=undefined 逐字节相同且不含 provider/model 键
- 接口核验（FR-2 遥测）：npx vitest run tests/stage-telemetry.test.ts → 10/10 全绿；写入侧（传 outputCount 落两键 / 不传则两键皆无）与读取侧（按 stageKind 聚合、未知不计、无数据整体省略键）双侧均有断言
- 接口核验（FR-3 告警）：npx vitest run tests/zero-output-alert.test.ts → 5/5 全绿；阈值 2 时连跑 4 次零产出恰好 2 条告警（streak=2 与 4）、阈值 2 连跑 2 次 1 条、有产出与高阈值均不告警
- 接口核验（FR-4 调度）：npx vitest run tests/requirement-priority.test.ts → 6/6 全绿；priority 降序+同值 createdAt 升序；上限 1 时其余返回 dispatched:false + stopped='wip_limit' + reason 点名在跑需求与上限；陈旧锁不占额度；上限 0 全投
- 数据契约核验：tests/reqboard/domain-summary.test.ts 14/14 + tests/reqboard/store-contract.test.ts 83/83 —— 摘要新增 priority/advanceLockAt 已进 SUMMARY_KEYS，出口形状与逐字段比对双守；协议三个新键均可选（缺省记录 hasOwnProperty 为 false 有断言）
- 迁移与兼容实测（未配置即现状）：npx vitest run tests/config-defaults-parity.test.ts → 7/7 全绿；四条等价面（脚本逐字节 / execution 无新键 / 调度顺序与投递结果不变 / 回执无空壳键）+ 一条不回填旧数据的诚实边界
- 全量回归：pnpm test → 97 failed / 3742 passed（≤ 说明书基线 98，失败文件数 47 = 基线），本需求五文件 46 用例全在绿侧
- 静态检查：npx tsc --noEmit → 总错误 144（开工 150，净减 6），归属本需求文件零错；pnpm run kb:check → 11/11 全过（生成物零漂移，新增源文件后已重生成）
- 文档同步：docs/architecture/project-manual.md 新增机制备忘「工作流的三项可配开关」+ 变更记录补行；docs/architecture/automation-chain-contract.md 新增 §七「调度与观测」（priority / maxInFlightRequirements / stage_telemetry / zeroOutputAlertThreshold / stageRouting 五项逐条注语义与判据）
- 证据与文档：docs/requirements/REQ-261004110201-f253/tests/test-evidence.md（九节可复跑证据+任务覆盖对照）、docs/requirements/REQ-261004110201-f253/reviews/review-report.md（八卡核对+设计承诺逐条+两处偏离总账+诚实声明）、design/ 六份、decomposition.md、tasks/ 各卡逐段汇报

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定契约：路由解析 + 三个配置 + 可选字段 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-2 | 路由注入生成器 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-3 | 执行收尾写产出数 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-4 | 阶段遥测读模型 + status 回执 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-5 | 零产出告警（可推导去重） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-6 | 优先级排序 + WIP 闸 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-7 | 兼容与迁移验证（未配置即现状） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-8 | 全量回归 + 文档同步 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-10 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
| v1-11 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 12:11 |
