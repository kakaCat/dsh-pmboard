# 自评审报告（REQ-261006091755-1c9e）

> 范围：本需求全部改动的对抗式复核（**作者自审 + 逐卡复核段留痕，非独立评审人**）。
> 结论：**未发现需返工的缺陷**；三处偏离/外部事实已具名（§三）。
> 独立复核以验收单的人工逐项裁决为准，本报告不作为通过依据。

## 一、复核对象

| 文件 | 角色 |
|------|------|
| `src/application/internal/content-gate-wiring.ts` | 唯一改动点：`assertUiCardPrototypeAnchors` 前置（2 行 + 2 个 import） |
| `src/application/internal/prototype-gates.ts` | 读侧：`prototypeExemptOf`（豁免唯一判据，未改） |
| `src/application/internal/prototype-registration.ts` | 读侧：`registeredPrototypesOf`（"已登记原型"唯一判据，未改） |
| `tests/plan-prototype-anchor-gate.test.ts` | TC-1～TC-10（新增 10 项） |
| `docs/requirements/REQ-261006091755-1c9e/design/*` | 设计六份（对照基准） |

## 二、逐条对抗式检查

| 检查项 | 方法 | 结论 |
|--------|------|------|
| 豁免判定是否单点 | `grep` 锚点维函数体 | 只有 `prototypeExemptOf(` 一处；无手写 `prototype_exempt`（TC-10 锁死） |
| 「有没有原型」是否单点 | 同上 | 只有 `registeredPrototypesOf(` 一处；不读磁盘目录 |
| 是否引入静默放行面 | 读早退条件 | 条件只依赖**登记事实**，不依赖 INDEX 解析结果（解析失败 ≠ 没有原型） |
| 未豁免路径是否零改动 | 既有拒绝用例 + diff 检查 | 既有判定分支与 envelope 文案**零删除**；四个既有文件 111 项全绿 |
| 早退位置是否最省 | 读代码顺序 | 在 `applies` 之后、计划文档通道之前 ⇒ 跳过路径少一次文档读 |
| 是否误放行「豁免 + 已交原型」 | TC-6 / TC-7 | 缺锚点仍拒；补权威锚点才放行 |
| 是否误放行「未落章」 | TC-3 / TC-4 | 理由空或未落章一律照旧拒 |
| 三条入口是否都受益 | 读代码 + 既有用例 | 判定在 `assertClauseCoverageGate` 内 ⇒ `SubmitArtifact(kind=plan)` / `Decompose` / `approved-plan-landing` 同时生效 |
| 回滚是否可逆 | 回滚演练 + `diff -q` | 只退源码 → tsc 0；整链回滚 → 改动前 19 项；恢复逐字节一致 |
| 新断言是否可证伪 | 三条逆向验证 | 删前置红 TC-1/2；放宽条件红 TC-6；塞手写判据红 TC-10 |

## 三、偏离与外部事实（具名，不粉饰）

| # | 事实 | 处置 |
|---|------|------|
| 1 | **复核段抓出的一处设计偏离**：设计列了 TC-10（判据单点源码锚点），实现阶段只做了人工 grep，未落成断言 | 已补成真断言（读源码切函数体），并做可证伪验证（塞手写判据 → 必红） |
| 2 | **回滚脚本第一次不干净**：残留一行 import 导致回滚态 `tsc` 报错，若不复核会被误读成"回滚不可行" | 重做干净回退取得 `tsc=0` 证据；两次结果都如实写进 t3 汇报 |
| 3 | **工作区被并发编辑**：交付前 `npx tsc --noEmit` 出现 2 处错误，全部在别的窗口 09:45 刚改的 `src/application/use-cases/SubmitArtifact.ts`（326 行未提交改动，`autoConfirm` 变 Promise 而两处调用点未 `await`） | 不修别人的在飞文件；具名到文件与行；该窗口修复后复查 `tsc` 退出码 0 |
| 4 | **全量失败集合逐轮漂移**：三轮采样各多出一个不同文件（`canceled-legacy-read` / `header-progress-e2e` / `settings-init`），三者单跑均通过 | 如实记录：多窗口工作区里 C-14 的「逐文件一致」无法成立，改用「同一噪声带 + 逐文件归因 + 单跑复核」 |
| 5 | **本卡改动文件另有别人的未提交 hunk**：`content-gate-wiring.ts` 的文件级 diff 含 254 增 13 删（原型锚点维本体来自 REQ-261005105032-3b02 的在飞工作） | 本次 delta 仅三处约 9 行；基线与回滚演练都只回退本需求 hunk |

## 四、结论

- 早退条件、位置、判据来源与设计逐条一致；未豁免路径零回归；
- 三条逆向验证证明新断言可证伪（不是绿灯摆设）；
- 回滚双向可逆、恢复逐字节一致、无残留；
- 遗留风险：无（豁免语义不变、无新增门/码/开关；唯一行为变化是"豁免且无原型时不再拦"，正是需求目标）。
