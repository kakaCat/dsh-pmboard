# REQ-261007223647-da5d 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v3

**交付结论**：交付结论（原型对齐后重交）：弹框与确认门三件事全部落地——作答不丢、内容说人话、pending 看得见。按验收人裁定，已把原型 #FR-5 的 5 处差异逐条对齐：🔔 前缀、标题「门名 · REQ-id」、按钮「重投弹框」、倒计时「剩余 mm:ss」、超时行「票仍有效，可一键重投」。FR-1 等待死在工具预算之前，票与留痕在作答到达即落盘（真盘验证）。FR-2 取消给替代路径，同窗口 30 分钟连续取消 3 次不再弹框。FR-3 弹框四问、推荐候选置首带（推荐）后缀、✖️ 居末、一键过在场。FR-4 问数口径六处归零。FR-5 看板首屏横带（形状与文案已对齐原型）。FR-6 文档位置根来源红字。口径：相关 16 文件 138 例全绿；tsc 0 错；host 与 client 构建成功且产物含新码；全量差集 66 失败 / 基线 68，本需求引入新红 0。两项如实标人工：看板人眼可见性；交付后连续取消台账判据。

## 1. 验收列表

### v3-1 · 立项弹框四问内容定稿

**验收内容**：【立项弹框四问内容定稿】验收

**操作步骤**：
1. 新增/改造单测后 `pnpm vitest run tests/capture-tool.test.ts`（及 capture-mapping 相关测试文件）退出码 0
2. 断言：首项 label 以「（推荐）」结尾且 == titleOptions[0]、末项 label 以 ✖️ 开头、问项总数 == 4、题干含理由行。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture-tool.test.ts tests/capture-output-contract.test.ts → 21 + 3 例全绿；断言：恰好四问（name/category/difficulty/location）、首项 label=候选一（推荐）、✖️ 居末、⚡ 一键过在场

**验收状态**：✓ 通过

---

### v3-2 · 弹框答案映射防静默回落

**验收内容**：【弹框答案映射防静默回落】验收

**操作步骤**：
1. 单测绿：带（推荐）后缀的 selected 映射后 category=feature 不回落默认
2. location 三态（含已知根前缀/相对段/不含已知根绝对路径）拆分取值逐条断言
3. CAPTURE_ANSWER_KEYS 键集契约断言 == 4 键（location 替 workspace）。命令：`pnpm vitest run` 相关测试文件退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture-tool.test.ts → mapCaptureAnswers 组全绿：带（推荐）后缀的 selected 剥后缀后不回落默认；落点三态拆分取值断言；answers 4 键契约断言

**验收状态**：✓ 通过

---

### v3-3 · 弹框通道限时等待 askTimed

**验收内容**：【弹框通道限时等待 askTimed】验收

**操作步骤**：
1. 单测绿：fake svc 下超时 → 返回 {kind:'pending'} 不抛
2. 窗口内作答 → {kind:'answered', answers} 原样
3. timeoutMs=0/-1/小数 → REQBOARD_INVALID_INPUT。命令：`pnpm vitest run` 适配器测试文件退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/ask-timed.test.ts tests/gate-aware-questions.test.ts → 9 + 10 例全绿：fake svc 超时 → {kind:'pending'} 不抛；answered 原样返回；越界 → REQBOARD_INVALID_INPUT

**验收状态**：✓ 通过

---

### v3-4 · 确认票超时不丢与一键重投

**验收内容**：【确认票超时不丢与一键重投】验收

**操作步骤**：
1. 怎么验（可执行）：① 跑 `npx vitest run tests/confirm-repost.test.ts tests/ask-timed.test.ts` → 退出码 0
2. ② 断言读数：宽限到期回执 pending=true 且带 ticket、注册表里该票仍活、凭 ticket 取回执可取
3. 重投（redispatch）后注册表计数不变、已落章的 confirmedAt 不被重写
4. ③ 端到端可 curl：POST http://127.0.0.1:19387/dashboard/api/reqboard/confirm/repost，body {"id":"<REQ-id>","ticket":"pc-xxxx"}，看返回 data.action ∈ still-open / gone / unavailable。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/confirm-repost.test.ts tests/pending-board.test.ts → 5 + 16 例全绿；含真注册表 + 真路由 POST /confirm/repost → data.action=still-open（本卡顺带补齐了此前从未实现的读口）

**验收状态**：✓ 通过

---

### v3-5 · 取消留痕与连续取消引导

**验收内容**：【取消留痕与连续取消引导】验收

**操作步骤**：
1. 单测绿：同窗口 30min 内 cancel×3 → capture 不再弹框且回执文案含「看板」
2. 旧 capture-rejections.json 合并读后 recentCaptureRejection 粘滞仍命中
3. 留痕文件损坏按无记录降级不拦截。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture-interactions.test.ts tests/compat-matrix.test.ts → 全绿：cancel×3/30min → 不弹框且回执含看板；旧 capture-rejections.json（无 kind）合并读仍命中拒绝粘滞且不算取消

**验收状态**：✓ 通过

---

### v3-6 · 看板 pending 票数据投影

**验收内容**：【看板 pending 票数据投影】验收

**操作步骤**：
1. 怎么验（可执行）：① 跑 `npx vitest run tests/pending-board.test.ts` → 退出码 0（16 例）
2. ② 可 curl 查数据：GET http://127.0.0.1:19387/dashboard/api/reqboard/state?session=<会话id>，看返回 data.pending_confirms——有票时每项含 ticket / requirement_id / target / kind（可选）/ created_at / interrupted 六键，另带 remaining_ms 与 expires_at
3. 无票时为 [] 且该键仍在下发物里
4. ③ 公式读数：remaining_ms = TTL − (now − (interrupted_at ?? created_at))，TTL = 30 分钟（src/domain/limits.ts 的 pendingConfirmTtlMs）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/pending-board.test.ts → 16 例全绿；可复核数据：GET http://127.0.0.1:19387/dashboard/api/reqboard/state?session=<id> → data.pending_confirms 六键 + remaining_ms/expires_at；无票为 []

**验收状态**：✓ 通过

---

### v3-7 · 弹框与工具文案口径归零

**验收内容**：【弹框与工具文案口径归零】验收

**操作步骤**：
1. `grep -rn "三问\|四问" src/tools src/application` 命中 0
2. submit prompt 含 prototype 类
3. `pnpm vitest run` output-contract 族测试退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture.test.ts tests/output-contract.test.ts → 全绿；grep -rn '三问|四问' src/tools src/application → 8 处命中逐条与事实源一致；grep -c prototype src/tools/SubmitTool/prompt.ts = 4

**验收状态**：✓ 通过

---

### v3-8 · pending 票行组件

**验收内容**：【pending 票行组件】验收

**操作步骤**：
1. 渲染测试断言：行内倒计时元素与「去作答」「重投弹框」两按钮选择器在场
2. 超时票显示「已超时」态
3. `pnpm build:client` 输出 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/pending-ticket-row.test.ts → 14 例全绿（原型对齐后）：🔔 前缀、「设计文档待确认 · REQ-t8」顺序、「重投弹框」按钮文案、倒计时「剩余 29:00」、超时行「票仍有效，可一键重投」逐条断言；data-action 拼错即红

**验收状态**：✓ 通过

---

### v3-9 · pending 票首屏横带组件

**验收内容**：【pending 票首屏横带组件】验收

**操作步骤**：
1. 渲染测试断言：pending_confirms 非空 → Band 容器与逐行 TicketRow 在场
2. 空 → 零渲染（容器选择器不存在）
3. `pnpm build:client` OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/pending-confirm-band.test.ts → 6 例全绿：有票 → 容器 + 逐行；空数组/undefined → 返回空串（零渲染，连容器都不出）；取数失败 → 红字「pending 票读取失败」

**验收状态**：✓ 通过

---

### v3-10 · 看板 pending 票接线

**验收内容**：【看板 pending 票接线】验收

**操作步骤**：
1. `pnpm build:client` 输出 [verify-client] OK
2. 接线后渲染断言：/state 带票时 Band 数据属性（data-pending-count 等）与票数据一致
3. 老服务端无 pending_confirms 键 → 按 [] 渲染不报错。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/pending-band-wiring.test.ts tests/pending-band-e2e.test.ts → 7 + 2 例全绿（真路由真注册表 → 客户端解析 → 渲染横带，含作答后横带消失）；client 构建 → [verify-client] OK

**验收状态**：✓ 通过

---

### v3-11 · open-doc 根解析诊断

**验收内容**：【open-doc 根解析诊断】验收

**操作步骤**：
1. 怎么验（可执行）：① 跑 `npx vitest run tests/open-doc-root-source.test.ts` → 退出码 0（9 例，覆盖 reqRoots 命中 / 仅会话根 / 全空 / 仅服务端根 / 串会话不下退 / 已是绝对路径 / 逐字兼容）
2. ② 界面可达路径：打开 http://127.0.0.1:19387 的看板 → 点任一需求卡进详情 → 看「📂 文档位置」一行的 DOM（F12 查 .dsh-pm-doc-filepath 的 data-doc-dir 属性），其绝对路径的根来源经 t11 的红字徽章暴露（data-doc-root-source 取值 req-root / session-root / server-root / none）
3. ③ 兼容读数：absolutizeDocPath 旧调用方返回行为逐字不变（同文件用例逐场景对照）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v3-12 · 文档位置根来源红字徽章

**验收内容**：【文档位置根来源红字徽章】验收

**操作步骤**：
1. 单测断言：peekLastRootSource() ≠ req-root 时 docLocationHtml 输出含红字「地址可能不准」徽章
2. = req-root 时不含
3. `pnpm build:client` OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v3-13 · 旧数据与旧端兼容验证

**验收内容**：【旧数据与旧端兼容验证】验收

**操作步骤**：
1. 兼容矩阵测试全绿（`pnpm vitest run` 相关文件退出码 0）：① 旧 capture-rejections.json 合并读命中粘滞
2. ② 无（推荐）后缀答案映射结果与改造前逐字一致
3. ③ 老服务端无 pending_confirms 键 client 按 [] 渲染。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v3-14 · 全量验收口径收口

**验收内容**：【全量验收口径收口】验收

**操作步骤**：
1. `pnpm vitest run` 退出码 0 且与基线比对无新红（C-14）
2. `pnpm tsc --noEmit` 退出码 0（C-15）
3. `pnpm build` 退出码 0 且 dist/ 与 lib/client.js 均有新产物（C-11/C-12）
4. FR-1~FR-6 判据逐条对照 requirement.md AC 表全过。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v3-15 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v3-16 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v3-17 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

## 2. 测试报告

- 命令 npx tsx scripts/test-baseline.mts --check → 本次失败 66 条 / 基线 68 条；新增 9 / 不再失败 11；tsc 退出码 0 · error TS 0（原型对齐后复跑；逐条归因见 docs/requirements/REQ-261007223647-da5d/tests/acceptance-evidence.md）
- 命令 npx tsc --noEmit → 退出码 0；host 构建 dist/index.mjs 2520784 字节；client 原型对齐后重建 → [verify-client] OK bundle=784848 bytes
- 本需求相关 16 个测试文件 138 例全绿；pending 票相关 5 文件 45 例（含原型对齐后的文案断言：🔔 / 「重投弹框」/「剩余 mm:ss」/「票仍有效，可一键重投」）
- 原型对齐产物核对：grep -c 重投弹框 lib/client.js = 1；grep -c dsh-pm-pending-bell lib/client.js = 2；差异逐条闭环记录见 docs/requirements/REQ-261007223647-da5d/tests/prototype-compare.md
- 可 curl 复核：GET http://127.0.0.1:19387/dashboard/api/reqboard/state?session=<会话id> → data.pending_confirms；POST http://127.0.0.1:19387/dashboard/api/reqboard/confirm/repost → data.action
- 故障注入 6 处实测变红后还原：公式基准 / 根顺序 / 红字条件 / 动作名 / 空态 / 旧留痕缺省判定
- 人工项（agent 跑不了）：打开 http://127.0.0.1:19387 看板首页，有挂起票时 10 秒内应见顶部横带（🔔 + 门名·REQ + 剩余 mm:ss + 去作答/重投弹框；超时行含「票仍有效，可一键重投」）；需求详情「📂 文档位置」行可见 data-doc-root-source 与红字徽章
- 后续观察项：AC-6 连续取消判据——查 ~/.dsh/state/capture-rejections.json 与确认票留痕，同窗口 30 分钟内不应再出现「连续取消 3 次才停弹」的形态
- 评审与对照证据：docs/requirements/REQ-261007223647-da5d/reviews/review-log.md（8 条问题清单）、docs/requirements/REQ-261007223647-da5d/tests/acceptance-evidence.md（AC 对照表 + 64 卡 covers）、docs/requirements/REQ-261007223647-da5d/tests/prototype-compare.md（锚点对照 + 5 处差异已对齐）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v3-1 | 立项弹框四问内容定稿 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-2 | 弹框答案映射防静默回落 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-3 | 弹框通道限时等待 askTimed | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-4 | 确认票超时不丢与一键重投 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-5 | 取消留痕与连续取消引导 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-6 | 看板 pending 票数据投影 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-7 | 弹框与工具文案口径归零 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-8 | pending 票行组件 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-9 | pending 票首屏横带组件 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-10 | 看板 pending 票接线 | ✓ 通过 | human/session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5 | 2026-10-08 00:47 |
| v3-11 | open-doc 根解析诊断 | ⬜ 待验收 |  |  |
| v3-12 | 文档位置根来源红字徽章 | ⬜ 待验收 |  |  |
| v3-13 | 旧数据与旧端兼容验证 | ⬜ 待验收 |  |  |
| v3-14 | 全量验收口径收口 | ⬜ 待验收 |  |  |
| v3-15 | 需求级验收 | ⬜ 待验收 |  |  |
| v3-16 | 需求级验收 | ⬜ 待验收 |  |  |
| v3-17 | 需求级验收 | ⬜ 待验收 |  |  |
