/**
 * 绑定读（t8/B11）：从**新端口**取"本窗口绑定的开放需求"——只读摘要，不装配整册。
 *
 * ## 为什么要有它
 *
 * 旧形状 `openRequirementsFor(deps.repo.台账快照读（已删除）, windowKey)` 为了回答"本窗口绑定了谁"，
 * 要先把**整个台账**装配出来（含 65KB 评论 / 71KB 验收材料…）。这正是本需求
 * （REQ-261002161439-277d）要治的读放大。
 *
 * 新端口的摘要投影（`RequirementSummary`，FR-4）已带绑定判定所需的全部标量
 * （`sourceSessionId` / `status`）⇒ 绑定读可以完全不碰大字段。
 *
 * ## 与 `openRequirementsFor` 的语义差异（**必须知道**）
 *
 * 后者还含 **triages 锚点路径**（`ledger.triages` → `resultRequirementId(s)`）。该路径在新端口
 * 没有对应 API，已按裁定移除（见 notes/known-defects.md §10.1）⇒ 本函数语义 = **仅 direct**
 * （`sourceSessionId === windowKey` + 开放态）。**这是有意的行为收敛，不是遗漏。**
 *
 * ## 为什么是纯函数（而非吃 `deps`）
 *
 * 它只依赖端口与领域判定。把"取访问器（`requirementStoreOf`）"留在调用方，可避免
 * `application/internal/` 反向依赖 `application/use-cases/` —— 分层门（`tests/layer-boundary.test.ts`）
 * 那 16 条既有噪声会掩盖新违规，不值得冒这个险。
 *
 * @module dsh-pmboard/application/internal/binding-read
 */
import type { RequirementStore } from '../ports.js'
import type { RequirementSummary } from '../../domain/requirement/RequirementSummary.js'
import { isOpenRequirement } from '../../domain/status/Predicates.js'
import { seatOfSummary } from './window.js'

/**
 * 本窗口绑定的**开放**需求（摘要）——**按席位取用**（REQ-261003215944-9e04 FR-3）。
 *
 * ## 两条来源都要取（这条是本次改造的要点）
 *
 *  ① `sourceSessionId === windowKey`：我立的需求；**也是全部存量记录的唯一入口**
 *     （无 `seats` 的记录经读端折算成单 owner，角色判定在下面统一做）。
 *  ② `seatWindowKey === windowKey`：别人立项、把席位派给了我的形态——**旧实现取不到这一条**，
 *     于是「worker 推阶段必须被拒」这类断言根本走不到授权判定就被"本窗口没有绑定中的需求"挡掉。
 *
 * ## 预筛不是授权判定
 *
 * 两个筛都只是**缩小候选集**；谁是 owner / worker / observer 由唯一折算处 `seatOfSummary` 裁，
 * 见下：无席位者一律丢弃。因此即便预筛多带回一条（例如 `seats` 里明确没有我），也不会被误判成有权限。
 * 反过来说：**授权真值不依赖任何存储筛选**——筛选只影响"看不看得见这条候选"。
 *
 * ## 与 `openRequirementsFor` 的语义差异（**必须知道**）
 *
 * 后者还含 **triages 锚点路径**（`ledger.triages` → `resultRequirementId(s)`）。该路径在新端口
 * 没有对应 API，已按裁定移除（见 notes/known-defects.md §10.1）⇒ 本函数语义 = 仅 direct + 席位。
 * **这是有意的行为收敛，不是遗漏。**
 *
 * ## 为什么是纯函数（而非吃 `deps`）
 *
 * 它只依赖端口与领域判定。把"取访问器（`requirementStoreOf`）"留在调用方，可避免
 * `application/internal/` 反向依赖 `application/use-cases/` —— 分层门（`tests/layer-boundary.test.ts`）
 * 那 16 条既有噪声会掩盖新违规，不值得冒这个险。
 *
 * ## 单页（与改造前同口径）
 *
 * 只取各筛的**首页**（端口 `limit` 缺省 200），不追 `nextCursor`：本窗口的绑定列表是"我参与的需求"，
 * 现实量级个位数；且端口排序契约（`updatedAt` 降序）保证刚动过的那条在最前。
 *
 * @module dsh-pmboard/application/internal/binding-read
 */

/**
 * 本窗口绑定的**开放**需求（摘要）。
 *
 * @param store 需求存储端口（由调用方用 `requirementStoreOf(deps)` 取；缺装配会响亮抛错）
 * @param windowKey 当前会话窗口键
 */
export async function boundSummariesOf(
  store: RequirementStore,
  windowKey: string,
): Promise<readonly RequirementSummary[]> {
  const [direct, seated] = await Promise.all([
    store.listSummaries({ sourceSessionId: windowKey }),
    store.listSummaries({ seatWindowKey: windowKey }),
  ])
  const out = new Map<string, RequirementSummary>()
  for (const s of [...direct.items, ...seated.items]) {
    // 开放态判定复用领域判定器（**不另立状态集合**：单一事实源）。
    if (!isOpenRequirement(s)) continue
    // 唯一折算处：席位权威，无席位 → 不进绑定列表（哪怕 sourceSessionId 是我）。
    if (seatOfSummary(s, windowKey) === undefined) continue
    if (!out.has(s.id)) out.set(s.id, s)
  }
  return [...out.values()]
}
