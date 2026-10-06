# 拆分计划（REQ-261005165552-6783 capture 段改字面量）

> 目标：让捕获段（`reqboard:capture`）不再被宿主当模板插值——台账/用户文本里的花括号占位符不再打挂整轮。
> 做法：**段上声明字面量（一行字段）→ 接线回归钉死显式声明 → 三组外来原文反例带证伪半 → 重建产物留证据**，4 张卡。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。
> 需求源：`docs/requirements/REQ-261005165552-6783/requirement.md`（4 条 FR / 3 条 D-x / 6 条验收标准）。
> 设计源：`docs/requirements/REQ-261005165552-6783/design/`（6 份）。
> 本阶段**不二次创作设计**：与设计不一致之处一律进 §4「需退回设计」，不在卡里私改口径。

## 1 改动盘点（对照 design/ 6 份逐份列）

### 1.1 architecture.md（模块改动地图）

| 类别 | 清单 |
|---|---|
| 新增 | `tests/capture-literal-section.test.ts`（t3）；`docs/requirements/REQ-261005165552-6783/notes/build-evidence.md`（t4，命令级证据） |
| 修改 | `src/gate-wiring.ts`（t1：注册处加 `interpolate: false` + 注释）· `tests/apply-wiring.test.ts`（t2：两处断言） |
| 重建 | `dist/index.mjs`（t4：`pnpm build`） |
| 删除 | 无 |

### 1.2 interfaces.md（接口面）

| 接口 | 改动 | 落卡 |
|---|---|---|
| 宿主段注册调用 `systemPrompt.section(spec)` | 入参多一个字段 `interpolate: false`；`name`/`order`/`text` 逐字不变 | t1 |
| agent 工具 / HTTP API | **无变更**（零签名变更、零新端点） | —（不改，如实记录） |
| 删除 | 无 | — |

### 1.3 data-model.md（结构 / 字段 / 不变量）

| 类别 | 清单 |
|---|---|
| 新增 | 仅宿主**内存结构**字段 `PromptSection.interpolate`（非持久化，t1） |
| 修改 | 无（台账 / `queue.json` / 产物簿结构一个字段都不加） |
| 删除 | 无；**无迁移脚本**（零数据形态变化，见 data-model.md §迁移与回滚） |

### 1.4 backend.md（S-1~S-5）

| 服务/函数 | 落卡 | 服务/函数 | 落卡 |
|---|---|---|---|
| S-1 段注册改动 | t1 | S-4 产物重建与解冻证据 | t4 |
| S-2 接线回归断言 | t2 | S-5 边界不变量 | t1、t2（验收期复核） |
| S-3 反例测试判据 | t3 | 删除 | 无 |

### 1.5 test-cases.md（TC-1~TC-8）

| 类别 | 清单 |
|---|---|
| 修改用例文件 | `tests/apply-wiring.test.ts`（TC-1、TC-2、TC-8 的构建半） |
| 新增用例文件 | `tests/capture-literal-section.test.ts`（TC-3、TC-4、TC-5、TC-6） |
| 既有断言不动 | `tests/capture.test.ts` / `tests/stage-prompts.test.ts` / `tests/acceptance-criteria.test.ts`（TC-7 守卫文本逐字节不变） |
| 删除 | 无 |
| 说明 | 设计阶段 `covers`（任务卡编号）不填——卡还不存在；落库后由既有回填机制补 |

### 1.6 use-cases.md（UC-1~UC-4）

| UC | 承接卡 |
|---|---|
| UC-1 领到"验收标准里引用了模板占位符"的卡 | t1、t3 |
| UC-2 未绑定窗口收到含占位符的用户消息 | t1、t3 |
| UC-3 维护者新增提示词段（显式声明纪律） | t2 |
| UC-4 事故恢复（重建 + 重载 + 证据） | t4 |

## 2 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 在捕获段注册处声明字面量（interpolate 置 false） | FR-1 | S-1 + `src/gate-wiring.ts` | — | D-1, D-2 | implement | backend | — | S | ① `grep -n "interpolate" src/gate-wiring.ts` 输出含 `interpolate: false`，且该行落在 `systemPrompt.section({` 与 `text:` 之间；② `pnpm typecheck` 退出码 0；③ `npx vitest run tests/apply-wiring.test.ts tests/capture.test.ts tests/stage-prompts.test.ts` 退出码 0（文本逐字节不变式未破） | dev,review |
| t2 | （落库后回填） | 接线回归断言：本段字面量 + 每段显式声明插值开关 | FR-4（并复核 FR-1） | S-2 + `tests/apply-wiring.test.ts` | — | D-3 | test | backend | t1 | S | ① `npx vitest run tests/apply-wiring.test.ts` 退出码 0，且新增两条用例按名命中（`-t` 单跑）；② **可失败性自证**：临时删掉注册处的 `interpolate: false` → 该用例必红；恢复后转绿（两条都要贴输出） | dev,review |
| t3 | （落库后回填） | 反例回归：三组外来原文含占位符时节选/字段字面保真且不抛 | FR-2 | S-3 + TC-3, TC-4, TC-5, TC-6 + `tests/capture-literal-section.test.ts` | — | — | test | backend | t1 | M | ① `npx vitest run tests/capture-literal-section.test.ts` 退出码 0；② 文件内含三组反例（在制任务验收/说明、用户消息节选、需求标题）与**证伪半**（同文本在 `interpolate: true` 下必抛 `malformed prompt variable reference`）；③ `pnpm typecheck` 退出码 0 | dev,review,test |
| t4 | （落库后回填） | 重建产物并留命令级证据 | FR-3 | S-4 + `dist/index.mjs` + `docs/requirements/REQ-261005165552-6783/notes/build-evidence.md` | — | D-2 | test | backend | t1, t2, t3 | S | ① `pnpm build` 退出码 0，`dist/index.mjs` 的 mtime 晚于 t1 的源码改动；② `pnpm test` 全量退出码 0；③ 证据文件内含三条命令的退出码与 `dist/index.mjs` 的 sha256 前 12 位 | dev,review |

- 一个任务只干一件事，标题动词开头。
- **落点**一律给到具体文件路径；S-x 引用见 `design/backend.md`（§关键逻辑）。
- **原型锚点列全「—」**：本需求 `sides` 只含 `backend`，无 UI 卡（无原型产物，故不适用）。
- **关联 D-x** 原文取自 `requirement.md` §讨论与裁定记录（D-x），按编号取原话、不概括。
- 工作量口径：S = 半天内 / M = 1~2 天 / L = 3 天以上（本计划无 L）。

## 3 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | —（零接口变更，见 interfaces.md §新增/修改的工具接口） | S-1, S-5（2） | TC-1, TC-7, TC-8（3） | t1, t2（2） | ✅ |
| FR-2 | —（同左） | S-3（1） | TC-3, TC-4, TC-5, TC-6（4） | t3（1） | ✅ |
| FR-3 | —（同左） | S-4（1） | TC-8（1） + 运行时证据三项 | t4（1） | ✅ |
| FR-4 | —（同左） | S-2（1） | TC-2（1） | t2（1） | ✅ |
| **合计** | 0 接口（如实记录） | 5 模块（1 份 backend.md 内） | 8 用例 | 4 任务 | 4/4 条款有主 |

**接口格写「—」的理由**：本需求**刻意零接口变更**——不改任何工具签名、不加端点（见 `design/interfaces.md`）。
唯一变化是宿主段注册调用的一个入参字段，它不构成对外接口（调用方是本插件自己）。

## 4 说明（容量 / 边界 / 需退回设计）

1. **容量**：4 张卡逐卡声明 footprint（t1 1/3/1200 · t2 1/3/900 · t3 1/6/3200 · t4 2/3/900），
   合成量均远低于缺省容量 16 DU → **超容量 0 张**，无需「⚠️超容量(建议N批)」标记。
2. **无迁移卡**：本需求零数据变更（`design/data-model.md` §迁移与回滚），故不单列迁移卡；
   旧宿主兼容（忽略未知字段）与旧断言不变复核并入 t1 / t4 的验收。
3. **运行时解冻证据不在卡内**：重载插件与"被卡窗口跑一轮"需要宿主侧动作，子代理做不到；
   该证据由本窗口在**验收阶段**执行并留档（`design/test-cases.md` §运行时验证三项）。
4. **设计文档编号补记（如实披露）**：设计文档确认后，`design/backend.md` 的「关键逻辑」小节做了一次
   **纯编号补记**——把原有的两段（反例判据 / 边界不变量）重编号为 S-3 / S-5，并补了 S-1 / S-2 / S-4
   三个小节标题，使本计划的 S-x 引用可查。**设计决策口径未变**（正文语义逐条保留），
   不涉及任何 FR 结论、接口契约或数据契约的改动。
5. **需退回设计**：无。
