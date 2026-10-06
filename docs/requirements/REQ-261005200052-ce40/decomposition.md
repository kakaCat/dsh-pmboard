# 拆分计划（REQ-261005200052-ce40 原型登记不得钉死窗口）

> 需求：`docs/requirements/REQ-261005200052-ce40/requirement.md`（FR-1~FR-6，D-1~D-3）
> 设计：同目录 `design/`（architecture / interfaces / data-model / backend / use-cases / test-cases）
> 现场：会话 `session-5632659d` seq 4726/4758/4790（提交被 `REQBOARD_CONFIRM_PENDING` 拒）；
> 诊断探针 `tests/_probe-prototype-pin.test.ts`（实测票 pc-f8faf6、kind=prototype、门值域无 prototype）

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（D-1 拦截口径不放宽 / D-2 原型自动确认是根因 / D-3 采用 A+C） |
| I-x | design/interfaces.md 接口表 | 内部函数签名 |

## §1 改动盘点（逐份对照设计）

| 设计文档 | 被哪张卡兑现 | 改动性质 |
|---|---|---|
| `design/architecture.md` | t1（判据单点与数据流）、t2（源头收口） | 1 处判定序扩展 + 1 处调用删除 |
| `design/interfaces.md` | t1（两谓词签名）、t3（facts 投影与四处文案） | 新增 2 函数 + 1 签名加可选参 + 1 输出门感知 |
| `design/data-model.md` | t1（读时谓词语义）、t4（零迁移/回滚核对） | 零 schema 改动、零迁移、零新持久字段 |
| `design/backend.md` | t1 / t2 / t3（落点清单逐行兑现） | application 4 文件 + 1 工具壳投影 |
| `design/use-cases.md` | t1（判定表）、t2（场景三/五）、t4（场景一回归） | 用例即验收脚本 |
| `design/test-cases.md` | t1（T3~T6）、t2（T1/T2/T10/T11）、t3（T7~T9）、t4（N1~N6 + 基线） | 新增 1 个测试文件 + 扩 2 个 + 转正 1 个 |

**零改动项（设计明确要求不动的）**：`PendingConfirmRegistry.ts`（注册表本体）、`ARTIFACT_CONFIRM_GATES` 值域、
TTL 与 `markInterrupted` 语义、`PENDING_CONFIRM_BLOCKED_TOOLS` 名单、台账 schema 与外置分片、
`src/client/**`（看板渲染不动）、`targetConfirmedInLedger` 落章判定。

## §2 RTM 覆盖对照表（每条 FR 的落点）

| 条款 | 承载卡 | 说明 |
|---|---|---|
| FR-1 原型登记不产生挂起票 | t2, t4 | t2 删第 ⑤ 步自动确认；t4 用转正用例钉死"登记后可写" |
| FR-2 守卫只拦「有门且有产物」的票 | t1, t4 | t1 两谓词 + 判定序；t4 逆验证 N1/N2/N3 |
| FR-3 拒绝/回执只列真实出路 | t3, t4 | t3 生成 facts 与文案；t4 逆验证 N4 |
| FR-4 登记通知不谎报确认入口 | t3, t4 | t3 改 `artifactNotifyText`；t4 逆验证 N5 |
| FR-5 不造答不了的票 | t1, t2, t4 | t1 谓词⑤ 兜存量；t2 校验前移；t4 逆验证 N6 |
| FR-6 口径锁与回归 | t1, t4 | t1 单点实现；t4 全量基线与逐字节还原 |

无遗漏条款；无「写进计划但无卡」的条款。

## §3 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 加守卫两谓词与判定序：无门/无产物的票不拦写路径 | FR-2 | I-1 + src/application/internal/pending-guard.ts | — | D-1, D-3 | implement | backend | — | S | `npx vitest run tests/pending-guard.test.ts` 退出码 0，且新增四例：prototype 票放行 / verification 有产物票必抛 / 无产物票放行 / 产物出现后同一票恢复拦截 |
| t2 | （落库后回填） | 原型登记不再产生挂起票 + 确认前移校验（不造空票） | FR-1, FR-5 | I-3 + src/application/use-cases/SubmitArtifact.ts | — | D-2, D-3 | implement | backend | t1 | S | 真 fs + 真工具壳：登记原型后 `pending_confirms` 为空、随后 `submit(kind=requirement)` 不被 `REQBOARD_CONFIRM_PENDING` 拒；无产物需求上 `ask_confirm` 抛 `REQBOARD_MISSING_ARTIFACT` 且未登记票（`npx vitest run tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts`） |
| t3 | （落库后回填） | 诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路 | FR-3, FR-4 | I-2 + src/application/internal/pending-guard.ts, src/application/use-cases/ConfirmReceipt.ts, src/application/internal/artifact-gates.ts, src/tools/StatusTool/StatusTool.ts | — | D-1 | implement | backend | t1 | S | 文案断言：prototype 票与无产物票的原文**不含**「看板点确认」、含「先登记产物」；verification 票含「看板点确认」与失效时刻；`artifactNotifyText(kind=prototype)` 不含「一键确认」；`reqboard_status.pending_confirms[]` 出现五个新键（`npx vitest run tests/pending-guard.test.ts`） |
| t4 | （落库后回填） | 探针转正 + 六条逆验证 + 全量基线比对 | FR-6 | tests/prototype-registration-no-pin.test.ts, tests/_probe-prototype-pin.test.ts | — | D-2 | test | backend | t1, t2, t3 | S | 六条逆验证（N1~N6）真跑**必红**并打印改坏点、跑完逐字节还原；`pnpm test` 与改动前基线比对**零新增失败**；`npx tsc --noEmit -p tsconfig.json` 退出码 0 |

无超容量卡（单卡上限 16 DU，最大约 6.7 DU）。

## §4 逐卡实施与验收

### t1 守卫两谓词与判定序
- **实施**：改 `src/application/internal/pending-guard.ts`：
  ① 新增 `hasConfirmGateOf(rec): boolean`——`target==='plan'` ⇒ true；`target==='artifact'` ⇒
  `kind ∈ Object.values(ARTIFACT_CONFIRM_GATES)`（自 `src/shared/protocol.ts` 取值域，禁止另写名单）；
  ② 新增 `hasConfirmableArtifactOf(req, rec): boolean`——`plan` ⇒ `req.plan !== undefined`；
  `artifact` ⇒ `(req.artifacts ?? []).some(a => a.kind === rec.kind)`；
  ③ `livePendingConfirm` 判定序扩展为：注册表过滤 → 台账查不到需求（**保守留挂，返回该票**）→
  `targetConfirmedInLedger` 落章放行 → 谓词④ 无门放行 → 谓词⑤ 无产物放行 → 拦。
- **验收**：`npx vitest run tests/pending-guard.test.ts` 退出码 0；新增四例断言见任务表；
  逆验证 N1（谓词④ 恒 true）与 N2（谓词④ 恒 false）必须分别打红 T3 与 T4。

### t2 源头收口：原型不发票 + 校验前移
- **实施**：① `src/application/use-cases/SubmitArtifact.ts` 删掉原型登记第 ⑤ 步的
  `triggerAutoConfirm(kind='prototype')` 整段（保留其上方 `notifyArtifactRegistered` 通知）；
  ② `src/application/use-cases/AskConfirm.ts` 在 `port.register(...)` **之前**追加两条校验——
  `target==='artifact' && kindArts.length === 0` ⇒ 抛 `REQBOARD_MISSING_ARTIFACT`（文案与
  `applyConfirmDecision` 内同源字符串一致）；`target==='plan' && targetReq.plan === undefined` ⇒
  抛 `REQBOARD_MISSING_PLAN`；既有"清理同窗口旧票"循环位置不变。
- **验收**：`npx vitest run tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts` 退出码 0；
  新增用例：登记原型后窗口可写（探针翻正）、无产物不登记票；逆验证 N6 必须打红新用例。

### t3 诊断投影与四处文案
- **实施**：① `pending-guard.ts` 新增 `pendingConfirmFactsOf(req, rec, now)`（四要素 + `usableRecovery[]`）与
  `pendingConfirmRejectMessage(p, facts?)`（缺省 facts ⇒ 逐字保持旧文案）；② `ConfirmReceipt.ts` 的
  `receiptNote` 接同一 facts；③ `artifactNotifyText`（`artifact-gates.ts`）改为门感知；
  ④ `StatusTool.ts` 的 `pending_confirms[]` 追加 `requirement_status` / `gate` / `artifact_count` /
  `expires_at` / `usable_recovery` 五键（schema 与投影同改，旧键不动）。
- **验收**：文案断言（任务表四条）；逆验证 N4（固定三条出路）与 N5（无条件「一键确认」）必须打红。

### t4 回归与逆验证
- **实施**：把诊断探针 `tests/_probe-prototype-pin.test.ts` 转正为
  `tests/prototype-registration-no-pin.test.ts`（保留真实时序：登记 → 2.4 秒 → 取票，断言翻转为"无票且可写"），
  删除探针文件；按 `design/test-cases.md` 跑 N1~N6 六条逆验证并逐字节还原。
- **验收**：上述命令全部退出码 0；`pnpm test` 与基线零新增失败（失败数变化逐条解释）；
  `npx tsc --noEmit -p tsconfig.json` 退出码 0；`npx tsx scripts/req-doc-validate.mts --req REQ-261005200052-ce40` 缺口不增。

## §5 覆盖完整性规则

- 覆盖对照的「覆盖条款」列只接受真实存在的 `FR-x`（悬空引用会被拒）。
- 每张卡独立可验收：零会话历史的新窗口只凭任务卡 + 本计划即可开工。
- 与设计矛盾时**退回设计**改设计文档后重交本计划，不在拆分阶段私改设计。
