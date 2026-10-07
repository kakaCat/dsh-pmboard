# 拆分计划（REQ-261006201508-5cb6 pm 插件工具面梳理与文档计数校准）

> **目标**：把「工具面有几个、叫什么、谁说了算」从四处手写收敛为**一处登记面 + 两条派生校验**——
> 文档与日志向 `src/tools/registry.ts` 对齐，漂移从「没人发现」变成「跑一次就红」。
> **做法**：4 张卡——文档面 1 张、源码面 1 张、两条守卫用例各 1 张；两条依赖边是语义时序（守卫必须在被守卫的改动之后才能绿）。
> **不做的**：不动任何工具的行为 / schema / 返回体 / 错误码，不新增或删除工具，不碰 `src/http`、`src/client`。
>
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。批准即自动落库并进入实施。

## 编号口径

覆盖对照靠编号跨文档拉齐；引用必须能在对方文档里查到——查不到 = 悬空引用，等同于没写。

| 编号 | 出自 | 本需求的实际情况 |
|---|---|---|
| FR-x | `requirement.md` 功能点表 | FR-1 / FR-2 / FR-3 / FR-4（四条，全部 P0） |
| D-x | `requirement.md`「讨论与裁定记录（D-x）」 | D-1（先梳理再校准）、D-2（立项类型与落盘位置） |
| T-x | `design/test-cases.md` 用例矩阵 | T-1 ~ T-11（本需求沿用该文档的 T-x 编号，不另编 TC-x） |
| t-x | 本文档任务表 | t1 ~ t4 |
| I-x | `design/interfaces.md` 接口清单 | **本需求零对外接口变更**，故**不编 I-x**；引用一律指向该文档的**节**（§1 / §2 / §3 / §4），可逐字查到 |
| P-x / C-x / S-x | frontend / backend 设计文档 | 不存在（`sides: []`：无端侧改动，这两份条件必交文档本就不交） |
| UC-x | `design/use-cases.md` 场景总览 | UC-1 / UC-2 / UC-3（场景，供人读；不落进任务卡的覆盖列） |

**为什么没有 I-x**：本需求一个字节都不改工具的入参 / 返回 / 错误码（见 `design/interfaces.md` §1）。
编一个空的 I-1 反而会让覆盖对照出现查不到的编号。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 按登记面重写 README 工具表并校准计数 | FR-1, FR-2 | `interfaces.md` §2 + README.md + package.json | — | D-1 | doc | doc | — | M | ① README 表内 `reqboard_` 行数 = 27（`grep -c` 计数）；② README 名字集合与 `TOOL_REGISTRY` 双向差集为空（`comm -13` 两条）；③ `grep -c reqboard_advance README.md` = 0；④ README 与 package.json 里 `13 个` / `21 个` 命中数 = 0；⑤ 表内可见 archive_amend / handoff / skill_install / task_refs | dev,review |
| t2 | （落库后回填） | 让注册日志从登记面派生 | FR-3 | `interfaces.md` §3 + src/tools/index.ts + src/index.ts | — | — | implement | backend | — | S | ① `grep -n '13 → 9' src/tools/index.ts` 无输出；② 注册日志行含 `TOOL_REGISTRY.length`，不含字面量 `(13)`；③ `pnpm typecheck` 退出码 0 | dev,review |
| t3 | （落库后回填） | 新增 README 工具面校验用例 | FR-1, FR-4 | `interfaces.md` §4 + tests/readme-tool-face.test.ts | — | D-1 | test | backend | t1 | M | ① `pnpm vitest run tests/readme-tool-face.test.ts` 全绿；② 逆验证：删 README 里 `reqboard_kb` 那行 → 红且消息含 `reqboard_kb`，还原复绿；③ 逆验证：加一行 `reqboard_advance` → 红且点名；④ 用例内不出现字面量 `27` 参与比较 | dev,review,test |
| t4 | （落库后回填） | 新增注册日志派生校验用例 | FR-3 | `interfaces.md` §3 + tests/registry-log.test.ts + tests/apply-wiring.test.ts（复用其 stub 手法） | — | — | test | backend | t2 | S | ① `pnpm vitest run tests/registry-log.test.ts` 全绿；② 逆验证：把日志改回字面量 `(13)` + 19 个名字 → 红，还原复绿；③ `pnpm typecheck` 退出码 0 | dev,review,test |

- 一个任务只干一件事，标题动词开头；落点 = 覆盖对照里出现过的编号 + 具体文件路径。
- **原型锚点 / 关联 D-x 两列**：本需求 `sides: []`（无 UI 卡），原型锚点全部写「—」；
  关联 D-x 只在卡确实承接裁定时写（t1 / t3 承接 D-1：先梳理再校准，判据即 README 表与登记面对齐）。
- **依赖理由（软门禁会点名的两条边）**：t3 → t1 与 t4 → t2 两端 `implementation` 文件**零交集**
  （守卫用例在 `tests/`，被守卫的改动在 `README.md` / package.json / `src/`），会命中「疑似伪依赖」点名。
  **这两条边是真实的语义时序，不是伪依赖**：用例的验收标准就是「被守卫的改动已成立」，
  依据见 `design/test-cases.md` T-1 前置条件（README 已按设计重写）与 T-7 前置条件（日志已派生）。
  本仓 `reqboard_submit` 的 tasks schema 不接受 `dep_reasons` 字段，故理由写在本行，供批阅人复核。
- **子卡段**为何不写联调：4 张卡都没有运行时接口面（纯文本 / 内部再导出 + 日志字符串 / 两条只读用例），
  联调段无处可联——按 `design/architecture.md` §4「对外工具接口零变更」判定。故用显式 `stages` 覆盖默认模板，
  而不是让 4 张卡白跑联调段。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | —（零接口变更，见 `interfaces.md` §1） | —（纯文档条款：改的是 README 表，无端侧模块） | T-1, T-2, T-4, T-5, T-10, T-11（6） | t1, t3（2） | ✅ |
| FR-2 | —（零接口变更，见 `interfaces.md` §1） | —（纯文档条款：README 正文 + package.json 描述） | T-2, T-3, T-8, T-10（4） | t1（1） | ✅ |
| FR-3 | `interfaces.md` §3（注册日志契约，**内部契约非对外接口**） | src/index.ts + src/tools/index.ts（2） | T-7, T-8, T-9, T-10（4） | t2, t4（2） | ✅ |
| FR-4 | `interfaces.md` §4（校验用例输入输出契约） | tests/（新增 2 个用例文件） | T-1, T-2, T-4, T-5, T-6, T-9, T-10（7） | t3, t4（2） | ✅ |
| **合计** | 0 对外接口（4 条指向设计节） | 2 模块 + 2 用例文件 | 11 用例（T-1~T-11） | 4 任务 | 4/4 条款有主 |

- FR-1 / FR-2 的「接口」「页面/模块」两格为空并**按规则写「—」+ 一句话理由**：这两条是纯文档条款
  （改 README 与 package.json 的描述文本），既无接口面也无端侧模块。
- FR-3 / FR-4 的接口格指向 `design/interfaces.md` 的**节**（该文档可逐字查到），
  因为它们定的是**内部契约**（再导出、日志形态、用例输入输出），不构成对外工具接口。

## 容量核算（一轮装不装得下：先算，再切）

口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 = 16 DU（常量只在 `src/domain/limits.ts` 定义一次）。

| 卡 | files | anchors | chars | detailUnits | 超容量？ |
|---|---|---|---|---|---|
| t1 | 2 | 5 | 3400 | 2 + 2.5 + 1.70 = **6.20** | 否 |
| t2 | 2 | 3 | 1300 | 2 + 1.5 + 0.65 = **4.15** | 否 |
| t3 | 2 | 4 | 2600 | 2 + 2.0 + 1.30 = **5.30** | 否 |
| t4 | 2 | 3 | 1600 | 2 + 1.5 + 0.80 = **4.30** | 否 |

四张卡都远低于容量，**无需切分、无需标红**（无 `⚠️超容量` 行）。
`files` 的声明口径：`implementation` 里点到、且会被路径正则计入的路径数
（`src/` `tests/` `docs/` `scripts/` 前缀）——t1 点到的 README.md / package.json 不计入该正则，
声明 2 仍高于下限；t3 点了新建的 `tests/readme-tool-face.test.ts` 与作为手法参照的 `tests/apply-wiring.test.ts`，故声明 2；
t4 点了 `tests/registry-log.test.ts` 与复用的 `tests/apply-wiring.test.ts`，故声明 2。

## 边界校验

- **每张卡可独立验收**：零会话历史的新窗口只凭任务卡 + 设计文档即可开工（卡的落点、契约指向、验收命令都在卡上）。
- **本阶段不二次创作设计**：与设计矛盾时不在这里改设计——按设计第 14 节的取舍执行；确需变更则退回设计重交并重新确认。
- **无迁移卡的理由**：本需求零数据变更、零接口变更、无旧调用方兼容问题
  （依据：`design/data-model.md` §1「结论：无数据结构变更」、§3 兼容性分析全行为「无变更」）。
  单列一张迁移卡只会是一张空话卡（薄卡会被代码级拒绝），故不列。
- **超范围设计反向核查**：`design/interfaces.md` / `test-cases.md` / `use-cases.md` / `data-model.md` 里的编号
  （T-1~T-11、UC-1~UC-3）没有引入任何未被 FR-1~FR-4 覆盖的新功能面——沿用既有 FR 的承接关系，无孤儿条款。

## 覆盖完整性规则（本计划的结论）

1. **每行三格不许空**：FR-1 / FR-2 为空的两格已按规则写「—」+ 一句话理由（纯文档条款）；
   FR-3 / FR-4 指向 `interfaces.md` 的具体节。无「缺接口 / 缺页面模块 / 缺用例 / 缺接收任务」的行。
2. **反向也要查**：本计划未引入超范围设计——4 张卡全部落在 FR-1~FR-4 之内，t1~t4 的覆盖条款与
   `design/test-cases.md` 的覆盖度统计逐条对得上。
3. **每个 FR-x 必须有人接**：FR-1 → t1/t3；FR-2 → t1；FR-3 → t2/t4；FR-4 → t3/t4。无孤儿条款。
