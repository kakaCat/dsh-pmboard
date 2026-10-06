# REQ-261005200052-ce40 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：原型登记不再钉死窗口，拦截文案只列真实出路，真门口径逐字未变。① 源头：原型登记删掉自动确认（只留通知），auto_confirm 如实投影 triggered:false；② 守卫：新增两读时谓词（该 kind 有没有确认门 / 台账有没有该产物），无门或无产物一律放行，产物出现即恢复拦截；③ 表述：拒绝原文/回执/登记通知/status 投影共用同一 facts 单点，只列真实可用出路（含失效时刻），无门产物不写「看板一键确认」；④ 预防：确认调用在登记票之前先校验可落章，不造答不了的票。证据：转正回归用例 2 例 + 五套件 65 例 + 逆验证 N1~N6 必红还原 + tsc 0 + 文档缺口 0 + 全量差集零新增。已知边界：68 条既有失败与本需求无交集（id 格式漂移、缺依赖、他工具 RESPONSE_SOURCES 等），已逐类列出。

## 1. 验收列表

### v1-1 · 加守卫两谓词与判定序：无门/无产物的票不拦写路径

**验收内容**：【加守卫两谓词与判定序：无门/无产物的票不拦写路径】验收

**操作步骤**：
1. 命令 npx vitest run tests/pending-guard.test.ts 退出码 0
2. 新增四例：① kind=prototype 的票 ⇒ livePendingConfirm 返回 undefined
3. ② kind=verification 且台账有产物未落章的票 ⇒ 仍返回该票
4. ③ kind=requirement 但台账无该 kind 产物的票 ⇒ 返回 undefined
5. ④ 同一张无产物票在登记产物之后再次判定 ⇒ 恢复拦截（读时谓词）。逆验证 N1（谓词④ 恒 true）打红第①③例、N2（谓词④ 恒 false）打红第②例。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

### v1-2 · 原型登记不再产生挂起票 + 确认前移校验（不造空票）

**验收内容**：【原型登记不再产生挂起票 + 确认前移校验（不造空票）】验收

**操作步骤**：
1. 命令 npx vitest run tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts 退出码 0
2. 新增用例：① 真 fs + 真工具壳调 reqboard_submit(kind=prototype) 成功后 pending_confirms 为空，且随后 reqboard_submit(kind=requirement) 不被 REQBOARD_CONFIRM_PENDING 拒（先断言旧行为会留下 pc- 票作为对照）
3. ② 对无 kind=requirement 产物的需求调 ask_confirm ⇒ 抛 REQBOARD_MISSING_ARTIFACT 且 pendingConfirms.pendingForWindow 仍为 undefined。逆验证 N6（删掉前移校验）必须打红第②例。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

### v1-3 · 诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路

**验收内容**：【诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路】验收

**操作步骤**：
1. 命令 npx vitest run tests/pending-guard.test.ts 退出码 0
2. 断言：① prototype 票与「有门但无产物」票的拒绝原文不含「看板点确认」、含缺产物说明
3. ② kind=verification 且有产物的票的原文含「看板点确认」且含失效时刻
4. ③ artifactNotifyText(req, {kind:'prototype'}) 不含「一键确认」且含「无需人工确认」
5. ④ reqboard_status 的 pending_confirms[] 五项新键在场且旧键逐字未变。逆验证 N4（文案固定三条出路）打红①、N5（通知无条件输出确认入口）打红③。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

### v1-4 · 探针转正 + 六条逆验证 + 全量基线比对

**验收内容**：【探针转正 + 六条逆验证 + 全量基线比对】验收

**操作步骤**：
1. 命令逐条可跑：① npx vitest run tests/prototype-registration-no-pin.test.ts 退出码 0
2. ② 六条逆验证 N1~N6 全部真跑必红且打印改坏点，还原后同批用例复绿
3. ③ pnpm test 与改动前基线比对零新增失败（失败数变化逐条解释）
4. ④ npx tsc --noEmit -p tsconfig.json 退出码 0
5. ⑤ npx tsx scripts/req-doc-validate.mts --req REQ-261005200052-ce40 缺口数不增。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 命令 npx vitest run tests/prototype-registration-no-pin.test.ts → 2 passed（真实时序 2.4 秒：登记原型后无票、写路径放行）
- 命令 npx vitest run tests/pending-guard.test.ts tests/pending-guard-integration.test.ts tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts tests/status-pending-confirm.test.ts → 65 passed
- 命令 npx tsc --noEmit -p tsconfig.json → exit=0、输出 0 行
- 命令 npx tsx scripts/req-doc-validate.mts --req REQ-261005200052-ce40 → 缺口 0、exit 0
- 命令 pnpm test → 488 文件 / 68 failed / 5610 passed；与上一轮 70 failed 集合差无新增，消失两条即本次修复项
- 逆验证 N1~N6 全部真跑必红（1/3/5/3/1/2 条）后逐字节还原（md5 一致）
- 测试证据 docs/requirements/REQ-261005200052-ce40/tests/acceptance-evidence.md（含 13 张父/子卡 covers 标注与失败口径）
- 实施评审 docs/requirements/REQ-261005200052-ce40/reviews/implementation-review.md（含偏离与风险）
- 证据汇编 docs/requirements/REQ-261005200052-ce40/evidence/verification-evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 加守卫两谓词与判定序：无门/无产物的票不拦写路径 | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
| v1-2 | 原型登记不再产生挂起票 + 确认前移校验（不造空票） | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
| v1-3 | 诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路 | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
| v1-4 | 探针转正 + 六条逆验证 + 全量基线比对 | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-336d078f-ed9d-4b78-8359-0382bcad5763 | 2026-10-05 20:25 |
