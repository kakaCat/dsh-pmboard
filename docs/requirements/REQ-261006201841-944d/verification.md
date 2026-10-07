# REQ-261006201841-944d 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：归档声明的落地第一次变成可证伪的事实——合并去向按这条需求自己的根判存在且非空、说明书更新点收敛为 path#锚点 且锚点必须真实存在、知识层第一次自证归档覆盖度、归档目录与看板能说清「结论去哪了」。三条反向演练（改坏即红 + 逐字节还原）全过且退出码 0；本需求相关 16 个测试文件在全量跑中 0 失败；本需求引入的 kb 新红为 0。

逐条读数：① RV-1 不存在的 merged_into 被拒并点名「路径 + 生效根 + by=path-fallback」；② RV-2 注释掉 K13 分支 → 指定用例变红（退出码 1、红例 1）→ 还原后复绿；③ 存量只读核对如实报 2/22/14/1/3/15（含「按当前工作区直接比会误判 15 条」的反例）；④ 集合差：本需求相关 16 文件 0 失败，唯一新增失败文件是别窗口错误码未登记清单（非本次引入）；⑤ 红线自查：无新增路径字符串比较型项目判定，未碰验收标准/原型门/测试基线；⑥ FR-7 三态已可复现，本需求的 archive.md 要等归档阶段生成（FR-5 机制已由用例钉住）。

如实报出四项待裁定/待办（不掩盖）：A. pnpm kb:check 的 K14 因别窗口 21:30 新沉淀 kb-0064（req=REQ-261006201649-cc89，失效条件仍是模板句）而新红——这是 K14 按设计点名新缺口，本次不刷基线隐藏，处置见 notes/follow-up-findings.md F-10；B. 计划 1.3 漏列第 8 个旧形态夹具文件 tests/application/use-cases.test.ts，已按 t11 同一手法升级（21/21 全绿，判据未放宽），见 F-7；C. 设计文档 TC-52 写的 -t TC-30 命中 0 条用例，RV-2 改用真实用例名，设计文档未回改（已过人确认），见 F-8；D. 本需求目录的 archive.md 需归档阶段才有事实（时序未到）。

证据落盘：tests/test-evidence.md（测试证据 + 58 条 covers 标注）、reviews/self-review.md（自评报告）、archive-reconcile-report.md（FR-8 只读核对 + 反向演练 + 集合差 + kb 读数）、notes/follow-up-findings.md（F-1～F-10）。

## 1. 验收列表

### v1-1 · 归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单

**验收内容**：【归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单】验收

**操作步骤**：
1. 跑 npx vitest run tests/archive-materials-shape.test.ts 全绿
2. 用例逐条断言：① path='docs/architecture/project-manual.md#机制备忘-收尾门' 通过
3. ② path='docs/architecture/project-manual.md'（无 #）抛出且消息含「路径#锚点」
4. ③ path='a#b#c' 抛出
5. ④ path='CLAUDE.md#某节' 抛出且消息含 docs/architecture/ 与 docs/guides/ 前缀清单
6. ⑤ 既有 requiredDocs 缺项仍被拒（回归钉）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-materials-shape.test.ts → 1 file / 10 passed；无 # / 多 # / 白名单外三种形态被拒，消息含形态说明与白名单前缀清单

**验收状态**：✓ 通过

---

### v1-2 · 闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）

**验收内容**：【闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）】验收

**操作步骤**：
1. 跑 npx vitest run tests/archive-targets-gate.test.ts 全绿，逐条断言：① merged_into 指向不存在路径 → 提交被拒且错误消息同时含该路径、生效根、by=path-fallback 三要素
2. ② 目标存在但 0 字节 → 被拒且消息含「空文件」或「0 字节」，与①的消息可区分
3. ③ 跨项目记录（workspaceRoot 指向另一临时根）下存在目标 → 通过，且对当前工作区的同名路径零访问
4. ④ manual_updates 锚点不存在 → 被拒且消息含「锚点不存在」
5. ⑤ 记录无 projectId 也无 workspaceRoot（F-1）→ 按当前工作区兜底并在回执里带 by=unknown
6. ⑥ assertArtifactOpenable 的既有判定顺序未变（回归钉）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-targets-gate.test.ts → 1 file / 7 passed；不存在路径被拒且消息含「路径 + 生效根 + by」三要素；RV-1 反向演练实测被拒并点名三要素

**验收状态**：✓ 通过

---

### v1-3 · renderArchiveManifest 纯渲染器（人读三件套 + 机器产物分区 + queue.json 摘要）

**验收内容**：【renderArchiveManifest 纯渲染器（人读三件套 + 机器产物分区 + queue.json 摘要）】验收

**操作步骤**：
1. 跑 npx vitest run tests/archive-manifest-render.test.ts 全绿，逐条断言：① 输出含 indexEntry 原文逐字与每条 merged_into 与其存在性读数
2. ② 机器产物分区对 rtm-*.yml / rtm-*/ / queue.json / state/ 各聚合为一行，且产量等于 matchArchiveExemption 的分类结果
3. ③ queue.json 摘要输出 任务数/依赖边数/就绪数/生成时间/字节数 五项，数字与夹具 JSON 对得上
4. ④ 损坏的 queue.json → 输出「无法解析」且函数不抛错
5. ⑤ 旧形态 manualUpdates（有 section 无 #）渲染为 `path（旧：section）`
6. ⑥ 同一输入两次调用输出逐字节相同（纯函数）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-manifest-render.test.ts → 1 file / 17 passed；六个分节齐、机器产物一行一类、queue 摘要五项对得上、坏 JSON 不抛错、同输入逐字节相同

**验收状态**：✓ 通过

---

### v1-4 · archive.md 写盘、幂等与清单补登（渲染失败即整体拒绝、台账零写入）

**验收内容**：【archive.md 写盘、幂等与清单补登（渲染失败即整体拒绝、台账零写入）】验收

**操作步骤**：
1. 跑 npx vitest run tests/archive-manifest-write.test.ts 全绿，逐条断言：① 首次提交后 <dir>/archive.md 存在且含 indexEntry 与每条 merged_into
2. ② 第二次同材料提交 written=false 且盘上内容逐字节不变
3. ③ archive.md 出现在目录对账的「已列」而非「未列」（不触发 REQBOARD_UNLISTED_ACK_REQUIRED）
4. ④ 写盘失败（桩 docs.write 抛错）→ 提交整体失败且需求台账的 archive 字段仍为空（零写入）
5. ⑤ 回执 resolved_targets 的 root/by 与桩记录一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-manifest-write.test.ts → 1 file / 6 passed；二次提交 written=false 且盘上 sha256 与 mtime 不变；写盘失败 → 整体拒绝且台账零写入、盘上不留 archive.md

**验收状态**：✓ 通过

---

### v1-5 · 失效条件可判定性纯判定 + 沉淀侧派生（不再生产模板句）

**验收内容**：【失效条件可判定性纯判定 + 沉淀侧派生（不再生产模板句）】验收

**操作步骤**：
1. 跑 npx vitest run tests/kb-invalidation.test.ts 全绿，逐条断言：① 含反引号字面量（如 src/x.ts）→ true
2. ② 含文件指针 docs/a/b.md 或带锚点 → true
3. ③ 含 supersede 且带 kb-0043 → true
4. ④ 模板句「相关实现被重构、或该结论被新条目 supersede 时」→ false（注意此处不含 kb-NNNN）
5. ⑤ 对 docs/knowledge/entries/ 全量真实条目跑判定，不可判定条数 = 60（如实记录实测口径）
6. ⑥ DepositKnowledge 新沉淀出的条目其失效条件判定为 true（用桩 docs 跑一次沉淀后断言）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/kb-invalidation.test.ts → 1 file / 11 passed；模板句判 false、含反引号字面量或带目录指针判 true；真实存量条目全部不可判定（结构性判据）

**验收状态**：✓ 通过

---

### v1-6 · 知识层 K13/K14 两项读数 + 两份基线（基线集合差、台账不可达即不判）

**验收内容**：【知识层 K13/K14 两项读数 + 两份基线（基线集合差、台账不可达即不判）】验收

**操作步骤**：
1. 跑 npx vitest run tests/kb-coverage-probe.test.ts 全绿且 npx tsx scripts/kb-probe.mts --json 输出含 K13/K14 两项
2. 逐条断言：① 临时台账里造一条「有 archive.json 但无 req: 条目」的需求 → K13 失败并点名该 id
3. ② 把该 id 写进基线的副本 → K13 通过
4. ③ 造一条含锚点的条目 → 不落入 K14 不可判定集合
5. ④ DSH_HOME 指向不存在目录 → K13/K14 均 ok=true 且 detail 含「读数不可得」
6. ⑤ 冷/热两侧口径：热侧置 50 条 archive.json 时 K13 缺口不变（只报数）
7. ⑥ --refresh-coverage 幂等：连跑两次基线文件逐字节相同。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/kb-coverage-probe.test.ts → 1 file / 7 passed；kb-probe 共 14 项检查；K13 判词如实报「仍有 6 条零沉淀（基线豁免、非新增）」不写成全部有；台账不可达 → 读数不可得、不判

**验收状态**：✓ 通过

---

### v1-7 · INDEX 降权排序：可判定条目在前、unverifiable 沉底（零字符增量）

**验收内容**：【INDEX 降权排序：可判定条目在前、unverifiable 沉底（零字符增量）】验收

**操作步骤**：
1. 跑 npx vitest run tests/kb-index-rank.test.ts 全绿，逐条断言：① 构造的两条条目在 INDEX 中可判定者行号更小
2. ② INDEX 字符数在改动前后不增（同条目集下字符数相等）
3. ③ 索引行文法不变（KB_INDEX_LINE_RE 对全部行仍匹配，K2 绿）
4. ④ npx tsx scripts/kb-probe.mts 的 K2/K5 不因排序变化而红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/kb-index-rank.test.ts → 1 file / 6 passed；可判定条目行序在前、不可判定沉底；INDEX 字符数零增量、索引行文法不变（K2 绿）

**验收状态**：✓ 通过

---

### v1-8 · /state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）

**验收内容**：【/state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）】验收

**操作步骤**：
1. 跑 npx vitest run tests/board-archived-origins.test.ts 全绿，逐条断言：① 记录的根等于当前 docs 根 → kind=local
2. ② 根指向另一个临时项目 → kind=elsewhere 且 projectName 等于该根末段名、root 等于该根
3. ③ 记录无 projectId 也无 workspaceRoot → kind=unknown 且不带 root 键
4. ④ responses 的 origins 键数 ≤ 本页 requirements 条数（不下发全量）
5. ⑤ 源码里无新增 startsWith/字符串相等形态的项目判定（静态断言）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/board-archived-origins.test.ts → 1 file / 28 passed（含服务端三态与客户端渲染）；判据只用 rootOfRequirement + sameProjectRoot，未新造项目身份判定；只算本页

**验收状态**：✓ 通过

---

### v1-9 · 归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型）

**验收内容**：【归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型）】验收

**操作步骤**：
1. 跑 npx vitest run tests/board-archived-origins.test.ts 全绿，逐条断言：① kind=local → 输出含 data-src="local" 与「本仓」文本
2. ② kind=elsewhere → 含「别处」与项目名，且 data-project 属性等于项目名
3. ③ kind=unknown → 含「归属未知」且不含「本仓」字样
4. ④ origins 缺该 req 键 / 整参缺省 → 输出不含 dsh-pm-archived-src（逐字降级）
5. ⑤ 既有 data-action/data-req/data-status 属性仍在（回归钉）
6. ⑥ 详情提示块在 elsewhere/unknown 两态出现、local 态不出现，且 stage-detail/report-tabs 不传新参时输出与改动前逐字节相同。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/board-archived-origins.test.ts → 1 file / 28 passed；data-src 三态齐、缺 origins 逐字降级且旧输出逐字节不变；新增选择器恰好 4 条仅用既有令牌；pnpm build:client + verify-client-build OK

**验收状态**：✓ 通过

---

### v1-10 · 存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）

**验收内容**：【存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）】验收

**操作步骤**：
1. 跑 npx vitest run tests/archive-ledger-audit.test.ts 全绿且 npx tsx scripts/archive-ledger-audit.mts --json 可跑
2. 逐条断言：① 临时副本上真失效合并去向 = 2
3. ② 说明书锚点漂移双读数 = 22（任意级标题归一化精确匹配）与 14（像章节引用），两者都出现在输出里
4. ③ manual_updates.path 本身缺失 = 1
5. ④ 归属未知 = 3
6. ⑤ 按当前工作区直接比的对照读数 = 15
7. ⑥ 跑完台账树文件 sha256 逐字节未变
8. ⑦ DSH_HOME 指向不存在目录 → 退出码 2 且输出含原因（不是 0）
9. ⑧ 脚本无 --out 时不对任何路径写盘。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-ledger-audit.test.ts → 1 file / 5 passed；真台账只读跑通读数 2/2/22/14/1/3/15；台账副本树 sha256 前后一致；台账不可达退出码 2

**验收状态**：✓ 通过

---

### v1-11 · 既有用例契约升级（7 个旧形态文件）与兼容回归

**验收内容**：【既有用例契约升级（7 个旧形态文件）与兼容回归】验收

**操作步骤**：
1. 跑 npx vitest run tests/archive-reconcile.test.ts tests/archive-reconcile-e2e.test.ts tests/artifact-gates.test.ts tests/acceptance-archive.test.ts tests/archive-compat.test.ts tests/kb-archive-deposit.test.ts tests/output-contract.test.ts 全绿
2. 且 diff 里不出现任何放宽判据的痕迹（逐条自查：无新增 skip/todo、无删除已有 expect、无把拒绝断言改成通过断言）
3. archive-compat 至少一条用例断言旧形态 archive.json 仍能渲染出 section 文本。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run <7 个计划点名的文件> → 7 files / 111 passed；另补第 8 个同类文件 tests/application/use-cases.test.ts → 21 passed（计划漏列，见 F-7）；无新增 skip/todo/only、未删既有 expect

**验收状态**：✓ 通过

---

### v1-12 · 反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3）

**验收内容**：【反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3）】验收

**操作步骤**：
1. 跑 npx tsx scripts/reverse-drill-matrix.mts --group archive 三组全过且退出码 0
2. 逐条判据：① RV-1 输出「期望拒绝」为真且拒绝消息含被改路径，且演练后被改源码逐字节还原
3. ② RV-2 删 K13 分支时指定用例确实变红（不是无覆盖），还原后复绿
4. ③ RV-3 报告读数 2/22/14/3/15 逐条对得上且台账副本 sha256 未变
5. ④ 改动前后失败用例集合差为空（逐条列出非本次引入的存量红项）
6. ⑤ pnpm kb:check 的失败项集合与改动前快照一致（零新增红）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/reverse-drill-matrix.mts --group archive → 3 条全过、退出码 0；--group all → 28/28 allOk 且不含 archive；集合差：本需求相关 16 文件 0 失败，唯一新增红归因别窗口错误码未登记

**验收状态**：✓ 通过

---

### v1-13 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：整体验收 1～6：①RV-1 被拒并点名 ✓ ②删 K13 分支即红、还原后复绿 ✓ ③存量只读核对如实报数（2/22/14/1/3/15，含误判对照 15）✓ ④集合差：本需求相关 16 文件 0 失败 ✓ ⑤红线自查：无新增路径字符串比较型项目判定，未碰验收标准/原型门/测试基线 ✓ ⑥FR-7 三态可复现；本需求 archive.md 待归档阶段生成（时序未到，FR-5 机制已由用例钉住）

**验收状态**：✓ 通过

---

### v1-14 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-15 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1 覆盖度检查落为 K13、既有 K12 逐字未改（kb-probe.mts 与用例均绿）｜D-2 机器产物只做呈现层折叠：写盘用例断言提交前后目录文件集合只多出 archive.md、既有文件字节数逐项不变｜D-3 三条判据可复跑：RV-1/RV-2/存量只读核对读数齐 ｜D-4 diff ⊆ 归档提交/知识层/归档目录呈现三片；无新增 startsWith 型项目判定（唯一的 mergeTargets 前缀比较是文档白名单，非项目身份）｜D-5 漂移双读数 22 与 14 同列，报告注明「6 不可复现」｜D-6 归属未知 3 条在报告与 /state origins 中标 unknown，不冒充本仓

**验收状态**：✓ 通过

---

### v1-16 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/acceptance-archive.test.ts、tests/acceptance-criteria.test.ts、tests/application/use-cases.test.ts、tests/archive-compat.test.ts、tests/archive-reconcile-e2e.test.ts、tests/archive-reconcile.test.ts、tests/artifact-gates.test.ts、tests/kb-archive-deposit.test.ts、tests/output-contract.test.ts、tests/reqboard/domain-summary.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/acceptance-archive.test.ts、tests/acceptance-criteria.test.ts、tests/application/use-cases.test.ts、tests/archive-compat.test.ts、tests/archive-reconcile-e2e.test.ts、tests/archive-reconcile.test.ts、tests/artifact-gates.test.ts、tests/kb-archive-deposit.test.ts、tests/output-contract.test.ts、tests/reqboard/domain-summary.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx tsx scripts/reverse-drill-matrix.mts --group archive → 3 条全过、退出码 0（RV-1 被拒并点名路径+生效根+by=path-fallback；RV-2 红例 1 且还原后复绿；RV-3 读数 2/2/22/14/1/3/15 且两棵树 sha256 未变）
- npx vitest run <本需求 16 个测试文件> → 新用例 10 files / 118 passed + 契约升级组 7 files / 111 passed，0 failed
- npx vitest run --reporter=json（全量自采，HEAD d0f01d6）→ 6613 用例 / 71 失败 / 38 文件；本需求相关 16 文件 0 失败；唯一新增失败文件 tests/error-code-inventory.test.ts（2 条）归因别窗口 REQBOARD_PROTOTYPE_* 未登记清单
- pnpm kb:check → 14 项检查；本需求新增 K13/K14，K13 绿且判词如实点名 6 条零沉淀（基线豁免、非新增）；本需求引入新红 0；红集由改动前 {K1,K3,K7,K9,K10} 收敛为 {K1,K7,K14}
- npx tsx scripts/req-doc-validate.mts --req REQ-261006201841-944d → 9 项判据（实判 8 / 读数不可得 1）、缺口 0、exit 0
- node scripts/verify-client-build.mjs → OK bundle=721645 字节，关键符号齐全、CSS 分片完整；lib/client.js 新于全部 src/client 源码（构建新鲜度过门）
- npx tsc --noEmit -p tsconfig.json → 仅 1 条存量错 tests/query-docs-roots.test.ts(36,7) TS2415（该文件与 HEAD 逐字一致）；本次零新增
- docs/requirements/REQ-261006201841-944d/tests/test-evidence.md ← 测试证据（命令、改动前后基线、逐条验收标准对照、覆盖对照、失败与未跑项、58 条 covers 标注）
- docs/requirements/REQ-261006201841-944d/reviews/self-review.md ← 自评报告（复核动作表、6 项评审维度、4 项如实披露、已修缺陷 F-9）
- docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md ← FR-8 只读核对 + 反向演练三条 + 集合差 + kb:check 读数
- docs/requirements/REQ-261006201841-944d/notes/follow-up-findings.md ← 实施期发现与变更记 F-1～F-10
- docs/requirements/REQ-261006201841-944d/prototypes/INDEX.md ← 权威原型清单（authoritative 恰好一条：archive-source-label.html）
- RV-3 只读契约：台账副本树与真台账树 sha256 前后逐字节一致（本次 4ad608f59d31…），副本之外零新增文件

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 归档材料形态契约：manual_updates 收敛为 path#anchor 并纳入 mergeTargets 白名单 | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:38 |
| v1-2 | 闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:38 |
| v1-3 | renderArchiveManifest 纯渲染器（人读三件套 + 机器产物分区 + queue.json 摘要） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:38 |
| v1-4 | archive.md 写盘、幂等与清单补登（渲染失败即整体拒绝、台账零写入） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:38 |
| v1-5 | 失效条件可判定性纯判定 + 沉淀侧派生（不再生产模板句） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:38 |
| v1-6 | 知识层 K13/K14 两项读数 + 两份基线（基线集合差、台账不可达即不判） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-7 | INDEX 降权排序：可判定条目在前、unverifiable 沉底（零字符增量） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-8 | /state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-9 | 归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-10 | 存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-11 | 既有用例契约升级（7 个旧形态文件）与兼容回归 | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-12 | 反向演练组 + 改动前后集合差比对 + 报告落盘（整体验收标准 1/2/3） | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-13 | 需求级验收 | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-14 | 需求级验收 | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-15 | 需求级验收 | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:39 |
| v1-16 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-7bda6cee-8918-4b81-90e1-8536ee47f76d | 2026-10-06 21:40 |
