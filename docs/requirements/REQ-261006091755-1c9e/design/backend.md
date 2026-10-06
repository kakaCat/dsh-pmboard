---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 后端设计（REQ-261006091755-1c9e）

> 条件必交（`requirement.md` front-matter `sides` 含 `backend`）。本次改动全在 **host 侧应用层**
> （`src/application/internal/`），不涉及 HTTP 路由、台账存储、工具入参 schema。

## 分层与落点 `serves: FR-1`

| 层 | 目录 | 本次是否改动 | 职责 |
|---|---|---|---|
| 领域层 | `src/domain/**` | 否 | 规则常量与纯判定（豁免/原型的**语义**在这里，本次不改） |
| 应用层 | `src/application/internal/**` | **是（唯一）** | 门禁编排与判定前置（`content-gate-wiring.ts`） |
| 用例层 | `src/application/use-cases/**` | 否 | 三条入口只调 `assertClauseCoverageGate`，签名不变 |
| 适配层 / HTTP | `src/adapters/**`、`src/http/**` | 否 | 无新端点、无新错误码映射 |

**为什么改在应用层而不是领域层**：豁免与「有没有原型」都已经是领域/内部模块里的**既有纯函数**；
本次缺的是"在锚点维之前调用它们"这一步编排，属应用层职责。把判定下移到领域层反而会新增一个函数。

## 执行时序（三条入口共用） `serves: FR-1, FR-4`

```
① reqboard_submit(kind=plan)      SubmitArtifact（kind=plan 预检）
② reqboard_decompose              Decompose
③ 计划批准后落库                   approved-plan-landing.landApprovedPlan
        │
        └─► assertClauseCoverageGate(docs, req, rawTasks)
                 ├─ 存量需求（artifacts 空）→ 直接放行
                 ├─ 维① FR 落点（先）→ 有缺口即返回 requirement_uncovered
                 └─ 维② assertUiCardPrototypeAnchors（后）
                          ├─ 非 UI 需求 → 放行
                          ├─ 【新】豁免生效 ∧ 已登记原型 == 0 → 放行（本需求）
                          ├─ 计划文档通道（decomposition.md「原型锚点」列）+ 任务对象双源合并
                          └─ 逐卡：缺锚点 / 形态不合法 / 指向非权威 → prototype_anchor_missing
```

**短路顺序即语义**：先"哪条 FR 没人接"，再"UI 卡有没有锚点"。本次改动插在第二维的**最前面**，
因此对第一维零影响；既有的"一次只报一件事"文案风格保持不变。

## 文件与职责 `serves: FR-1`

| 文件 | 本次改动 | 一句话职责 |
|---|---|---|
| `src/application/internal/content-gate-wiring.ts` | 加 2 行前置 + 2 个 import | 门禁接线与判定单点（本需求唯一改动文件） |
| `src/application/internal/prototype-gates.ts` | 无（只被调用） | 原型三门的判定与豁免纯函数 |
| `src/application/internal/prototype-registration.ts` | 无（只被调用） | 「原型已登记」的唯一判据 |
| `src/application/internal/plan-prototype-refs.ts` | 无（只被调用） | 计划侧锚点取数（双源合并） |
| `tests/plan-prototype-anchor-gate.test.ts` | 加断言 | 锚点维的行为锁（含豁免四组合） |

## 错误码与前置条件 `serves: FR-2`

| 情形 | 码 / 行为 | 是否变化 |
|---|---|---|
| 未豁免 + 缺锚点 | `prototype_anchor_missing`（gaps 逐卡点名） | 不变 |
| 豁免生效 + 无已登记原型 | **返回 `undefined`** | **新增（唯一行为变化）** |
| 豁免生效 + 有已登记原型 + 缺锚点 | `prototype_anchor_missing` | 不变 |
| 未落章 / 理由空 | 视为未豁免 → 同上 | 不变 |

**不新增码、不改文案**：跳过不是错误，没有可展示的失败信息；拒绝路径的 `envelope` 文案逐字保留
（既有用例对 `gaps` 内容有逐字断言）。

## 性能与资源 `serves: FR-1`

- 跳过路径**少一次文档读**（不再读 `decomposition.md`）与 0 次逐卡判定 ⇒ 比改动前更省。
- 未豁免路径：多两次纯内存判定（`prototypeExemptOf` 读 front-matter 对象；`registeredPrototypesOf` 过滤数组），无 IO、无分配热点。
- 无并发面：门禁是请求内的同步/异步只读判定，不共享可变状态。

## 观测与排障 `serves: FR-1, FR-2`

- 门失败时的 `failure.code` + `gaps` 就是唯一观测面（既有形态）；跳过路径**不写日志**（静默放行是设计而非异常，且它只发生在"人已裁定不要原型"的需求上）。
- 事后复核入口：看板需求详情的产物簿（`kind=requirement.confirmedAt`）与 front-matter（`prototype_exempt`）——两者共同决定这次是否走过跳过分支。

## 迁移与回滚（后端视角） `serves: FR-1`

- 无 schema / 无迁移 / 无数据回填；不新增环境变量或插件配置。
- 回滚 = 删除前置两行与两个 import；已豁免需求的判定立即恢复为"被拒"，无需清理任何状态。
- 部署面：改动落在 host 侧源码 ⇒ 需 `pnpm build`（规范 C-11）后重启生效；client 侧不受影响。

## 可执行的验证命令 `serves: FR-1, FR-2, FR-3`

```bash
npx vitest run tests/plan-prototype-anchor-gate.test.ts      # 本维行为（含豁免四组合）
npx vitest run tests/move-gate-paths.test.ts                 # 四条转移路径的既有拒绝行为
npx vitest run tests/prototype-gates.test.ts                 # presence / version / anchors 三门
npx vitest run tests/category-doc-sets.test.ts               # sides → 适用性判据
pnpm typecheck && pnpm build                                 # C-15 / C-11
```

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 改动层 | 在领域层新增一个 `isPrototypeDimApplicable()` | 应用层调用既有两个纯函数 | 少一个函数、少一处口径；编排本就是应用层的事 |
| 入口覆盖 | 在三条入口各加一次判断 | 改共用函数 | 三条入口共用单点，只改这里 = 三处自动生效（少一处漏接线） |
| 观测 | 跳过时打日志/留痕 | 不打日志 | 它是正常路径（人已裁定），打日志会把正常态做成噪音；复核靠产物簿 |

## 技术方案与亮点 `serves: FR-1`

- **一处早退覆盖三条入口**：把修复放在 `assertUiCardPrototypeAnchors`，使 `reqboard_submit(kind=plan)`
  预检、`reqboard_decompose`、计划批准落库三条路径同时生效（可核验指向：`tests/plan-prototype-anchor-gate.test.ts` 直接调 `assertClauseCoverageGate`，即这三条路径的共同入口）。
