# REQ-261004103330-005f 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：交付结论（含两轮返工）：看板新增「⚙ 设置」弹窗，四屏齐备且已与界面基准原型逐项对齐——① 运行上限：每阶段可配、来源逐项标注、改小不掐断在跑的那一轮，内置默认一律不低于 5；② 存储与数据库：分段开关、数据位置与改路径、切换必须过人工确认（点取消不生效、票据一次性），迁移由新开的 Agent 窗口执行（先备份、再建库、校验不过整个作废），并展示手动迁移命令；③ 系统记录：记录文件成组（路径/写入者/初始化/保留策略）、本安装版本、版本字段、后端使用史、数据路径档案；④ 通用：设置文件/台账数据根/当前后端/构建指纹/台账 schema/运行时。人反馈「实现和原型不一致」后，我核实为整体形态不一致并把「形态」写成会红的断言（新增 tests/prototype-parity.test.ts，15 条，施工期 9 红、现全绿），四屏补齐色点、中文副标题、分组盒子、说明框、菜单图标、分段开关、改路径、手动迁移命令等。期间修复的真实缺陷：设置文件里的后端选择重启后不生效（端到端抓出）、记录屏正常态漏屏标题（新形态断言抓出）、票据否定作答被当成同意（源头与路由两道防线）。四条已知限制如实列明：浏览器手测未做（无 GUI 通道）、迁移留痕缺谁确认的与哪个窗口、ports.ts 文件增长留账、端口缺显式写后端方法。全量口径如实申报：失败数与返工前逐条一致，多出的那一条已符号级定位到其它窗口正在新建的未跟踪文件。

## 1. 验收列表

### v2-1 · 定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射

**验收内容**：【定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射】验收

**操作步骤**：
1. npx vitest run tests/reqboard/settings-file.test.ts 全绿（设置文件>插件配置>env>默认 四态来源顺序
2. 非整数/0/10001 被拒）
3. node 打印 resolveRunSettings 输出逐项 source 正确
4. npx tsc --noEmit 2>&1 | grep -c 'error TS' ≤ 开工基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-2 · 设置文件与系统记录两个适配器（含自动初始化与失败降级）

**验收内容**：【设置文件与系统记录两个适配器（含自动初始化与失败降级）】验收

**操作步骤**：
1. npx vitest run tests/reqboard/settings-init.test.ts 全绿：删掉两份文件后启动 → 系统记录被自动创建且含首条 startup，而设置文件仍不存在（断言 fs.existsSync 为 false）
2. 设置文件第一次 PATCH 后才出现
3. 只读目录下写记录 → 进程不抛且 droppedEvents 增长。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-3 · SQLite 适配器实现 RequirementStore 全端口

**验收内容**：【SQLite 适配器实现 RequirementStore 全端口】验收

**操作步骤**：
1. npx vitest run tests/reqboard/store-contract.test.ts 中 SQLite 实现的 read+write 两套件全绿
2. 额外断言：临时库上 create→mutate→get 读回逐字段一致，且并发两次 mutateIf 只有一次成功。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-4 · 把 SQLite 实现接入端口契约测试注册表

**验收内容**：【把 SQLite 实现接入端口契约测试注册表】验收

**操作步骤**：
1. npx vitest run tests/reqboard/store-contract.test.ts 全绿：内存替身 / 分片实现 / SQLite 实现三者跑同一份断言
2. 注册表自检无 ⏳ 标注。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-5 · 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪

**验收内容**：【装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪】验收

**操作步骤**：
1. npx vitest run tests/reqboard/migration-gate.test.ts 全绿且断言两码的 message/hint 互不出现
2. 构造『已选 sqlite + 库空 + 分片非空』→ HTTP 503 响应文本含 migrate-ledger-to-sqlite
3. 构造『单册在场 + 分片未迁移』→ 503 文本含 migrate-ledger-v10。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-6 · 上限生效：同步快照 + 默认表降级 + 判定点停手

**验收内容**：【上限生效：同步快照 + 默认表降级 + 判定点停手】验收

**操作步骤**：
1. npx vitest run tests/dive-round-state.test.ts 全绿且保留『未安装快照=默认 1000/10』既有断言
2. 把 implementing 上限改成 3 且 roundsInStage=3 → 下一回合判定停手、停手原因含『已达上限』，且正在执行的那一回合不被打断
3. 上限改回 10 → 继续续跑。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-7 · 挂起确认机制扩写：storage-action + 一次性 consume

**验收内容**：【挂起确认机制扩写：storage-action + 一次性 consume】验收

**操作步骤**：
1. npx vitest run tests/reqboard/pending-confirm-consume.test.ts 全绿：同一 ticket 两次 consume 只第一次成功（第二次返回失败且不消费状态）
2. 过期 ticket 拒绝
3. 未落章 ticket 拒绝。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-8 · settings 路由五条（含票据 request 与消费）

**验收内容**：【settings 路由五条（含票据 request 与消费）】验收

**操作步骤**：
1. npx vitest run tests/reqboard/settings-router.test.ts 全绿
2. 不带票据打 switch/migrate → 403 confirmation_required 且设置文件与系统记录均未变
3. PATCH 传 storage.backend → 400 且消息指向确认门
4. PATCH 传 0/10001 → 400 且消息含 1–10000。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-9 · 迁移脚本八步 + 兼容与回滚

**验收内容**：【迁移脚本八步 + 兼容与回滚】验收

**操作步骤**：
1. npx vitest run tests/reqboard/sqlite-migrate.test.ts 全绿
2. --dry-run 前后源分片与设置文件哈希不变
3. 注入第 3 步失败 → 源分片与设置文件逐字节未变且退出码 3
4. 迁移成功后条数与 id 全等、抽样 5 条逐字段一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-10 · 迁移开窗链路：windowOpener + crossWindowDeliver + 系统事件

**验收内容**：【迁移开窗链路：windowOpener + crossWindowDeliver + 系统事件】验收

**操作步骤**：
1. npx vitest run tests/reqboard/settings-migrate-dispatch.test.ts 全绿：三种失败下系统记录文件文本内不含 migration 事件
2. 成功下含 migration-requested 与窗口键，且返回体给 windowKey/sessionId。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-11 · 设置弹窗骨架与入口（挂 body、左菜单、关闭语义、API 客户端）

**验收内容**：【设置弹窗骨架与入口（挂 body、左菜单、关闭语义、API 客户端）】验收

**操作步骤**：
1. npx vitest run tests/client 全绿（含新增的弹窗开关与菜单切换用例）
2. 手测：点页头按钮弹窗出现、四屏可切、ESC 与遮罩均可关、关闭后重开状态一致、弹窗不随视图重渲染被清空。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-12 · 运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限）

**验收内容**：【运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限）】验收

**操作步骤**：
1. npx vitest run tests/client/settings-limits.test.ts 全绿：输入 0 / 10001 / 1.5 均标红且保存键禁用
2. 改动后左菜单显示『N 项未保存』
3. 保存成功后徽章变『设置文件』且泳道头上限同步更新
4. 界面明示『改小不会掐断正在跑的那一次，从下一次判定起不再续跑』。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-13 · 存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案）

**验收内容**：【存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案）】验收

**操作步骤**：
1. npx vitest run tests/client/settings-storage.test.ts 全绿：consent 不进 localStorage
2. 403 confirmation_required → 显示『确认已失效，请重新确认』并清票据且不自动重试
3. 六类错误各命中独立文案（不含泛化『出错了』）
4. failed 后点『重来一次』必须先弹确认门。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-14 · 系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字）

**验收内容**：【系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字）】验收

**操作步骤**：
1. npx vitest run tests/client/settings-records.test.ts 全绿：shards.requirements > sqlite.requirements 时出现『库已陈旧：重启前请重跑迁移』红字且页面无任何合并入口
2. 设置文件不存在时『打开配置文件』为禁用态并提示『尚未创建：首次保存后生成』
3. 版本不一致时显示重建指引。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-15 · 端到端与反向演练 + 开工基线落盘

**验收内容**：【端到端与反向演练 + 开工基线落盘】验收

**操作步骤**：
1. npx vitest run tests/reqboard/settings-e2e.test.ts 全绿
2. 三条反向演练逐条验证『移除对应处置后该用例必红』并记录实测
3. npx vitest run tests/reqboard tests/application tests/http 失败数 ≤ 基线
4. npx tsc --noEmit 2>&1 | grep -c 'error TS' ≤ 基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-16 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-17 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

### v2-18 · 需求级验收 · 锚点失效

**验收内容**：验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案） → tests/client/settings-storage.test.ts；系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字） → tests/client/settings-records.test.ts；运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限） → tests/client/settings-limits.test.ts。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。

**操作步骤**：
1. 验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案） → tests/client/settings-storage.test.ts
2. 系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字） → tests/client/settings-records.test.ts
3. 运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限） → tests/client/settings-limits.test.ts。请把锚点改为真实文件，或回写设计/任务卡
4. 本条不阻断验收，但通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 原型对齐靶子：npx vitest run tests/prototype-parity.test.ts → 15 passed / 0 failed（开工时 9 红；含「四屏共有形态」一条，当场抓出记录屏 ready 分支漏拼屏标题的真 bug）
- 四屏测试：npx vitest run tests/settings-{limits,storage,records,dialog}.test.ts → 119 passed
- 内置默认下限守卫：npx vitest run tests/stage-defaults-floor.test.ts → 3 passed（九个阶段内置默认一律 ≥5，人裁定）
- 设置解析与上限链：npx vitest run tests/reqboard/settings-file.test.ts tests/dive-stage-limit-snapshot.test.ts tests/dive-round-driver.test.ts → 84 passed
- 三条端到端：npx vitest run tests/reqboard/settings-e2e.test.ts → 3 passed（含「设置文件里的后端选择重启后真的生效」——此缺陷由端到端抓出并已修）
- 契约三实现同跑：npx vitest run tests/reqboard/store-contract.test.ts → 115 passed（内存 34 / 分片 32 / SQLite 32 / 只读替身 15）
- 客户端构建：pnpm build:client → 通过，bundle 408631 字节，verify 报「关键符号齐全 / 样式归属章在场 / CSS 分片完整」
- 全量套件（代理全停手后干净一轮）：98 failed / 4396 passed；失败文件 47 个，与返工前逐条一致（comm 差集为空）
- 对齐后四屏截图存档：docs/requirements/REQ-261004103330-005f/prototype/parity-{limits,storage,records,general}.png
- 验收材料与证据：docs/requirements/REQ-261004103330-005f/verification.md、reviews/review-report.md、tests/test-evidence.md、notes/prototype-parity.md、notes/findings.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-2 | 设置文件与系统记录两个适配器（含自动初始化与失败降级） | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-3 | SQLite 适配器实现 RequirementStore 全端口 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-4 | 把 SQLite 实现接入端口契约测试注册表 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-5 | 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-6 | 上限生效：同步快照 + 默认表降级 + 判定点停手 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-7 | 挂起确认机制扩写：storage-action + 一次性 consume | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-8 | settings 路由五条（含票据 request 与消费） | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-9 | 迁移脚本八步 + 兼容与回滚 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-10 | 迁移开窗链路：windowOpener + crossWindowDeliver + 系统事件 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:43 |
| v2-11 | 设置弹窗骨架与入口（挂 body、左菜单、关闭语义、API 客户端） | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-12 | 运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限） | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-13 | 存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案） | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-14 | 系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字） | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-15 | 端到端与反向演练 + 开工基线落盘 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-16 | 需求级验收 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-17 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |
| v2-18 | 需求级验收 · 锚点失效 | ✓ 通过 | human/session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b | 2026-10-04 19:45 |

---

# 返工记录（三）人实测：「打开配置文件没有反应」

**现象**：点页头「打开配置文件」无任何反应。

**根因**（两层静默）：① 设置文件**惰性创建**，此时不存在 → 按钮是 `disabled`，而**禁用的按钮不派发点击**，
且解释只写在 `title`（悬停才看得到）；② 即使文件存在，打开通道失败时也没有任何提示。

**修法**：页头按钮改 `aria-disabled="true"`（外观仍置灰）+ **页面上可见**的旁注「尚未创建」；
点击交给纯函数 `openConfigIntent(state)`——文件在就打开，**没创建就跳到「通用」屏**看整句解释；
打开通道失败时在状态条（`aria-live`）给话。

**证据**：`npx vitest run tests/settings-dialog.test.ts tests/settings-records.test.ts tests/prototype-parity.test.ts`
→ **66 passed**（含 3 条新增的「点击意图」断言）；`pnpm build:client` 通过（bundle 411522 字节）。

**教训（已写进 findings 发现 I）**：**任何"禁用即静默"的控件都会长成"点了没反应"**；
不可用时要么给页面上看得见的理由，要么让点击给出解释——**只给 `title` 等于没给**。

---

# 返工记录（四）人实测：存储屏配色与原型不一致

**处置**（逐元素对照原型 CSS，不靠感觉）：分段开关**选中项改深底白字**、选中项内的「当前」标签**反白**、
「实验性」标签**按原型取橙**、「当前」标签绿值照原型、未选中项白底。

**证据**：`npx vitest run tests/settings-{storage,limits,records,dialog}.test.ts tests/prototype-parity.test.ts`
→ **122 passed**；`pnpm build:client` 通过（bundle 412312 字节）；全量套件失败文件 **47 = 基线**（无新增）。
对齐后截图：`prototype/parity-storage.png`。

**顺带清掉**：设置样式表模板字符串体内残留的 8 个反引号（会提前闭合样式表）。
**仍存在的内容差异**（非颜色，未擅自改，已记 findings 发现 J）：载体体检的位置、原型底部的蓝色队列说明、
以及「数据位置」展示分片根还是库文件路径这三处。

---

# 返工记录（五）人实测：系统记录通道未装配 → **生产装配漏了五个接口**

**人看到**：「系统记录通道未装配（fetchSystemRecord 缺失）」。

**真实范围**：`settings/singleton.ts` 只注入了 `fetchRunSettings` 一个，而弹窗要六个——
系统记录、保存上限、确认门、改路径/切后端/起迁移在生产里**全部**报未装配。

**修法**：具名工厂 `boardSettingsApi()` 整体注入六个接口。

**守卫与过程**：`tests/settings-wiring.test.ts`（5 条）。第一版守卫**测的是工厂、不是装配**，
反向演练时照样全绿；改为**源码级静态判据**后，同一次演练精确变红、恢复即绿（演练过程记在 findings 发现 L）。

**证据**：`npx vitest run tests/settings-wiring.test.ts` → **5 passed**；
`pnpm build:client` 通过（bundle 412909 字节）且产物内六个接口各命中 1 处；
全量套件失败文件 **47 = 基线**（无新增）。

---

# 返工记录（六）人要求：改路径要像操作系统那样弹窗口选地址

**实现**：`POST /settings/storage/pick-path`（宿主用 `osascript` 的 `choose file name` 弹 macOS「存储为」窗口）
+ 客户端「选择…」按钮（选中 → 填入并**标脏**，保存仍由人点；取消 → 什么都不改；501 → 提示可手动输入路径）。

**为什么走宿主**：浏览器拿不到真实绝对路径（安全边界），选择只能在 Node 侧发生。

**三态**：`200 {ok:true,path}` / `200 {ok:false,cancelled:true}`（**取消不是错误**）/
`501 path_picker_unavailable`（平台、缺 osascript、超时、其它失败——统一"可手动输入路径"）。

**防注入**：脚本是常量、参数只走 argv（不经 shell）；路由层发恶意请求体断言端口入参为空，
适配器层断言 argv 恒为 `['-e', PICK_PATH_SCRIPT]`。

**证据**（同一条命令里跑完）：
- `npx tsc --noEmit | grep -cE "client/settings|http/routers/settings|settings/singleton"` → **0**
- `npx vitest run tests/reqboard/settings-pick-path.test.ts tests/settings-wiring.test.ts tests/settings-storage.test.ts tests/prototype-parity.test.ts` → **64 passed**
- `pnpm build:client` → 通过，bundle **415627** 字节，verify 三项全过

**连带修复**：`controller.ts` 曾被并行改动顶到 419 行（超门禁），本卡把两个纯类型块外移到 `controller-api.ts`，
回到 **399 行**（尺寸门禁不再列它）。
