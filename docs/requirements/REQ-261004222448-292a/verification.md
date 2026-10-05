# REQ-261004222448-292a 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v3

**交付结论**：详情页已按「工作汇报」落成：常驻头部一屏答出是什么/到哪了/卡在哪/缺什么，下面是六个同级 Tab（汇报·文档·DAG·对话·Token·提示词），切到哪个才请求哪个；台账一变只换该换的两块。提交后又按验收现场反馈修了三类问题并重跑全部门禁：①文档根与任务根误用宿主目录（317 份文档曾全判缺失、任务计数为 0）→ 改按会话解析；②渲染变形（markdown 标记裸露、「原文」整行胶囊、操作条三行参差且每个按钮后挂一段解释、状态带半句截断、docs 核验表首列糊到邻列）→ 全部重做，探针新增硬判据；③条款接收投影只信拆分文档导致页面谎报「15 条 FR 没人接」→ 合并台账卡片绑定后真值为 15/15 全 done。首屏其余数字已逐条对过台账（84/84、66/66、验收单 20 项、Token 217.5M 均真）。门禁：构建/客户端/类型检查/知识层全绿，渲染探针 4/4，相关用例全绿。未落地四项与「需重载宿主才生效」已在材料里逐条声明。

## 1. 验收列表

### v3-1 · 定死接口与降级契约（六端点 + 信封类型）

**验收内容**：【定死接口与降级契约（六端点 + 信封类型）】验收

**操作步骤**：
1. 命令 pnpm typecheck 退出码 0
2. 命令 grep -c "available: false" src/shared/protocol.ts 返回不小于 1
3. 新增类型被后续卡引用且不含 any。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-2 · 注入留痕加 origin/delivered/text 并补三处写入

**验收内容**：【注入留痕加 origin/delivered/text 并补三处写入】验收

**操作步骤**：
1. 命令 pnpm test -- tests/injection-log 全绿
2. 断言包含：轮次投递后留痕条数 +1 且 origin 返回 dive-round
3. 投递失败时 delivered 返回 false 且结果包含失败原因
4. 超长正文被截断且 truncated 返回 true
5. 旧条目读端 origin 返回 unknown、delivered 返回 null。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-3 · 服务端聚合查询：report、docs、dag、token 扩展

**验收内容**：【服务端聚合查询：report、docs、dag、token 扩展】验收

**操作步骤**：
1. 命令 pnpm test -- tests/query-report 全绿
2. 断言包含：缺口条数与 unreceived 条款数加挂起确认数一致
3. 各阶段占比合计为 100%（容差 0.5）
4. 每条优化点包含数字
5. 无快照且合计为 0 时 availability 返回 none 且页面不出现 0 值表。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-4 · 会话文本抽取：dialogue 查询与过滤规则

**验收内容**：【会话文本抽取：dialogue 查询与过滤规则】验收

**操作步骤**：
1. 命令 pnpm test -- tests/query-dialogue 全绿
2. 断言包含：产出不包含 tool/call、tool/result、reasoning、run_code 字样（反例）
3. 时间序递增
4. limit 为 20 时返回不超过 20 条且 hasMore 一致
5. 会话不可得时 available 返回 false，不返回空数组冒充没有对话。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-5 · 主干抽取：trunk 查询与既有节名匹配

**验收内容**：【主干抽取：trunk 查询与既有节名匹配】验收

**操作步骤**：
1. 命令 pnpm test -- tests/query-trunk 全绿
2. 断言包含：缺节标本的 missing 返回 doc-section-missing（含测试文件 tests/query-trunk.test.ts）
3. 有节标本的摘要必须是原文子串
4. 反例：需求描述非空但文档缺节时不得回退用描述填充（断言不包含该描述）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-6 · 接线六条只读路由（分页 + 入参校验 + 降级）

**验收内容**：【接线六条只读路由（分页 + 入参校验 + 降级）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-routes 全绿
2. 断言包含：六个端点各返回 200 且信封形状一致
3. limit 传 1000 返回 400
4. 非法需求 id（含上跳目录）返回 400 且不触碰文件系统
5. 端口未装配时返回 available 为 false、reason 为 port-unavailable。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-7 · 文档模板加两节（关键决策与取舍、技术方案与亮点）

**验收内容**：【文档模板加两节（关键决策与取舍、技术方案与亮点）】验收

**操作步骤**：
1. 命令 grep -l "关键决策与取舍" templates/design/*.md templates/brainstorming/*.md | wc -l 返回不小于 2
2. 命令 git diff --name-only 表明既有节名未被改名（仅新增行）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-8 · 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

**验收内容**：【前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-shell 全绿
2. 断言包含：首屏请求数不超过 2 且不含正文
3. 未点过的 Tab 请求数返回 0
4. 未激活面板的 token 选择器返回 null
5. 模拟一次 revision 变更后滚动位置、展开态、当前 Tab 均不变
6. 终态下动作按钮数返回 0
7. 档二渲染不包含文档表、成本、提示词正文选择器。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-9 · 汇报 Tab（来源标、缺节、亮点反应付）

**验收内容**：【汇报 Tab（来源标、缺节、亮点反应付）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-trunk 全绿
2. 断言包含：缺节渲染包含「文档未提供该节」
3. 无证据亮点命中 data-evid 为 no 且不包含正常亮点样式
4. 来源标（现有、节新增、自动、人写）均可见。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-10 · 文档 Tab（文档铺开 + 核验 + 门禁留痕）

**验收内容**：【文档 Tab（文档铺开 + 核验 + 门禁留痕）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-docs 全绿
2. 断言包含：文档行数与台账文档数一致
3. 核验表包含实际结果、来源（agent 或 human）、需人工三列
4. 文件缺失行的类名包含缺失标记且可见划线样式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-11 · DAG Tab（复用现有画布 + 每步执行结果）

**验收内容**：【DAG Tab（复用现有画布 + 每步执行结果）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-dag 全绿
2. 断言包含：表头八列齐
3. 失败行渲染 error 原文且可见
4. manual 触发行显示 manual
5. 现有 DAG 画布容器存在且视图状态用例仍通过。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-12 · 对话 Tab（一条流 + 系统消息 + 回复框）

**验收内容**：【对话 Tab（一条流 + 系统消息 + 回复框）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-dialogue 全绿
2. 断言包含：产物不包含 tool/call、reasoning、run_code 字样
3. 系统消息与人类消息同容器且时间序一致
4. 回复框选择器可见。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-13 · Token Tab（按阶段 + 每次调用均与缓存命中 + 优化点）

**验收内容**：【Token Tab（按阶段 + 每次调用均与缓存命中 + 优化点）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-token 全绿
2. 断言包含：各阶段占比合计与总计一致
3. 每次调用均与缓存命中两列可见
4. 优化点包含数字
5. 不可得态页面不出现 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-14 · 提示词 Tab（三段 + 正文铺开 + 规定与实际对照）

**验收内容**：【提示词 Tab（三段 + 正文铺开 + 规定与实际对照）】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-prompt-tab 全绿
2. 断言包含：每段正文非空且可见
3. 旧条目渲染包含「来源未知」
4. delivered 为 null 时渲染包含「投递不可知」且不包含「已投递」
5. 超长正文渲染包含「已截断」。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-15 · 渲染断言·架构与降级

**验收内容**：【渲染断言·架构与降级】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-shell.test.ts tests/report-degrade.test.ts 全绿
2. 断言与取数架构与降级两组逐条对应（不少于 13 条）
3. 其中包含无内层滚动容器的反例断言与不得用 0 表示未知的反例断言。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-16 · 渲染断言·内容与留痕

**验收内容**：【渲染断言·内容与留痕】验收

**操作步骤**：
1. 命令 pnpm test -- tests/report-content.test.ts tests/report-prompt.test.ts tests/report-template.test.ts 全绿
2. 包含至少三条反例断言：无证据亮点不上桌、旧留痕不默认投递、缺节不回退需求描述。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-17 · 渲染探针脚本（两档宽度 × 两种状态）

**验收内容**：【渲染探针脚本（两档宽度 × 两种状态）】验收

**操作步骤**：
1. 命令 npx tsx scripts/req-report-probe.mts 退出码 0 且输出四组合 PASS 行
2. 人为加一处限高滚动后退出码变为 1（反向验证探针有效）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-18 · 迁移与兼容核对 + 构建与知识层自检

**验收内容**：【迁移与兼容核对 + 构建与知识层自检】验收

**操作步骤**：
1. 命令 pnpm build 退出码 0 且宿主产物与客户端产物均有更新
2. 命令 pnpm build:client 输出校验 OK
3. 命令 pnpm typecheck 退出码 0
4. 命令 pnpm kb:check 退出码 0
5. 两种台账后端各跑一次六个端点读用例，返回体逐字段一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-19 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

### v3-20 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md

**验收状态**：✓ 通过

---

## 2. 测试报告

- 证据索引（含三起验收现场事故的根因/处置/影响面/回归）：docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md
- 测试证据矩阵（20 文件 391+ 例 + 84 张卡的 covers 标注）：docs/requirements/REQ-261004222448-292a/tests/test-matrix.md
- 实施评审报告：docs/requirements/REQ-261004222448-292a/reviews/implementation-review.md
- 渲染探针原始输出（4/4 PASS，含新增硬判据：Tab 栏 ≤713 / 评论区 ≤260px / 操作条 ≤72px 且按钮一行 / 状态带三格 ≤220px）：docs/requirements/REQ-261004222448-292a/evidence/ui-restyle-checks.txt
- 全量回归对比：交付后 74 失败 / 4916 通过 vs 开工前基线 660973e 81 失败 / 4540 通过（新增失败 0）
- 条款接收真值复核脚本输出：修前 FR-1~FR-15 全判没人接 → 修后 0 条，15/15 均 done（同一份 queue.json + requirement.md 直算）
- 首屏数字对账：任务 84/84、子卡 66/66、验收单 sheet v2 共 20 项全 pending、Token totals=937071+467202+216069888=217.5M
- 改后截图（真数据）：evidence/ui-fix-firstscreen-1280x820.png、ui-fix-actionbar-band.png、ui-fix-{trunk,docs,dag,dialogue,token,prompts}.png
- 双后端一致性：tests/report-backend-parity.test.ts（7 例）两条真实现逐字段一致
- 四道门：pnpm build exit 0、[verify-client] OK、tsc --noEmit exit 0、pnpm kb:check exit 0（11/11）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v3-1 | 定死接口与降级契约（六端点 + 信封类型） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-2 | 注入留痕加 origin/delivered/text 并补三处写入 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-3 | 服务端聚合查询：report、docs、dag、token 扩展 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-4 | 会话文本抽取：dialogue 查询与过滤规则 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-5 | 主干抽取：trunk 查询与既有节名匹配 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-6 | 接线六条只读路由（分页 + 入参校验 + 降级） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-7 | 文档模板加两节（关键决策与取舍、技术方案与亮点） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-8 | 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-9 | 汇报 Tab（来源标、缺节、亮点反应付） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-10 | 文档 Tab（文档铺开 + 核验 + 门禁留痕） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:37 |
| v3-11 | DAG Tab（复用现有画布 + 每步执行结果） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-12 | 对话 Tab（一条流 + 系统消息 + 回复框） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-13 | Token Tab（按阶段 + 每次调用均与缓存命中 + 优化点） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-14 | 提示词 Tab（三段 + 正文铺开 + 规定与实际对照） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-15 | 渲染断言·架构与降级 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-16 | 渲染断言·内容与留痕 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-17 | 渲染探针脚本（两档宽度 × 两种状态） | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-18 | 迁移与兼容核对 + 构建与知识层自检 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-19 | 需求级验收 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
| v3-20 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-00af6c69-e55e-4878-8d4e-74056a439b01 | 2026-10-05 11:38 |
