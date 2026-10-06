# 自评审报告（REQ-261005122915-9f90）

> 评审对象：本次 6 处改动（8 张卡）的**范围纪律 / 设计一致性 / 反向风险 / 诚实性**。
> 评审人：本窗口 agent 自评（不是人工验收；人工验收在验收单）。

## 一、范围纪律：有没有夹带？

| 检查项 | 结论 |
|---|---|
| 是否只改需求边界内的东西？ | ✅ 6 处改动逐条对应 FR-1~FR-5（矩阵见 `../tests/test-evidence.md` §一） |
| 是否动了「不做」清单里的东西？ | ✅ 未动：清场 HTTP 协议逐字保留；`RollbackSpec` 阶段语义未改；队列/台账 schema 未改（`compat-check.md` §1）；未新增 agent 可调用的清场工具 |
| 是否修了别人的在飞文件？ | ✅ 未动。工作区里 `category-doc-sets.ts` / `support.ts` / `ports.ts` / `MoveRequirement.ts` 的未提交改动一律没碰；只把它们导致的既有红**归因**并如实登记（`compat-check.md` §4） |
| 是否顺手做了计划外重构？ | ✅ 无。唯一的「抽取」是 FR-2 要求的单一实现收敛（`stale-rework.ts`），且是从 `Decompose.ts` 原地搬出、文案逐字保留 |
| 是否把独立缺陷夹带进来？ | ✅ 没有。跨窗口根竞态只登记不修（`verification.md` §六） |

## 二、设计一致性：代码与已确认的设计是否一致？

| 设计文档 | 声明 | 实现 |
|---|---|---|
| `design/architecture.md` §单一实现收敛 | 两条落库编排各调一次 `cancelStaleReworkCards` | ✅ `approved-plan-landing` 覆盖批准两条入口、`Decompose.ts` 覆盖手动入口 |
| `design/data-model.md` §读侧派生口径 | 真卡/占位卡口径单点，四处一律 import | ✅ `liveRealCards` 被 `approved-plan-landing` / `confirm-settle` 使用；`rollback-tasks` 用 `isReworkPlaceholder` |
| `design/backend.md` §落库编排新顺序 | 先收敛、再判定、返回体带 `staleReworkCanceled` | ✅ 顺序即语义（代码注释同款） |
| `design/test-cases.md` 核心判据 1~5 | 逐条要有用例 | ✅ 5 条全有（含 3b02 现场形态） |
| `design/frontend.md` §入口位置与形态 | 操作条按钮、无回退记录不渲染、回执逐条展示 | ✅ 三条都有用例锁定 |

**一处实现比设计更严**（已在代码注释与本文件说明）：回退态下除 `checkDecomposeIdempotency` 放行外，
另加「**顶层真卡非空则视为已重建**」的判据——设计 `test-cases.md` 第 2 条要求「连调两次幂等」，
不加这条就会在同一次回退里重复落库（实测确实会）。回退刚结束时顶层真卡必为空，故不妨碍重建。

## 三、反向风险：这次改动可能怎么害人？

| 风险 | 评估 | 缓解 |
|---|---|---|
| 误把真卡当占位卡（判据只看 `reworkOf`） | 低：`reworkOf` 由物化时写死，普通卡不带该键、空串也判为非占位（有用例） | `rework-placeholder.test.ts` 三条边界用例 |
| 收敛误伤常规旧卡 | 低：收敛只碰 `reworkOf` 非空且未取消的卡，且经 `mutateQueue` 收口（写盘根核验） | `decompose-stale-rework.test.ts` 跨需求/已取消用例 |
| 削弱事故 B（幽灵卡）防线 | 已核：只替换取数（活卡→真卡），未放宽 `ok` 条件；非回退态已有真卡仍拒 | `approved-plan-landing-rework.test.ts` 非回退态用例 |
| `alreadyLanded` 语义收窄破坏外部契约 | 无外部消费者（盘点见 `compat-check.md` §2），且不落盘、不在对外类型里 | grep 全量命中比对 |
| 看板按钮误点导致误清 | 中：批量操作 | `confirm` 说明后果 + 回执逐条展示 + 「不碰 done 卡」+ 幂等；且只在**有回退记录**时渲染 |
| 占位卡不再复位会丢掉「要重做」的可见性 | 低：占位卡的存在意义是「等新计划落库前可见」；本改动让它在**同一轮回退里**被取消，而它的原卡已由回退正常取消 | `rollback-tasks.test.ts` 三条用例 |

## 四、诚实性：有没有把「没做到」说成「做到了」？

- ✅ **既有的红照实报**：全量套件 105 个失败项、归因方法与「本次新增 0」的证据都写在
  `compat-check.md` §4，没有含糊成「测试全绿」。
- ✅ **现场结论照实报**：3b02 不是被我修的——是 peer 窗口用「再回退一次」绕行解开的；
  我两次清场都是空操作（`canceled: 0`），且这条结论连同 peer 的理由原文一起写进 `verification.md` §四之二。
- ✅ **生效范围照实报**：客户端按钮刷新页面可见；服务端逻辑需宿主重启（当前 host 仍是旧构建 `4df1d51d2e19`）。
- ✅ **人工门的代发如实留痕**：`decomposing → implementing` 由用户在弹框中明确授权后经看板通道代发，
  台账 reason 写明「用户在对话中经弹框明确授权 agent 代发」，`actor = human`。
- ✅ **一个盲区自己揭出来**：逆验证首轮发现「只回退 FR-1 判据时测试仍绿」，已补用例（见 §三 与测试证据 §二）。

## 五、结论

范围没有外溢，实现与已确认设计一致（一处更严且有据），反向风险逐条有缓解或已核不成立，
未达成项与既有红全部如实登记。**建议提交人工验收**。
