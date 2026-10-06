# 前端设计（REQ-261006123819-3af3）· serves: FR-3

> 本需求是审计优化类，前端面**只有 FR-3 一条**：删掉一个没有写入者的字段，从而让一个
> **早就写好、但永远不可达**的「已归档」状态变为可达。
> 其余五条 FR 不动前端（FR-1/FR-2/FR-4/FR-5/FR-6 见 interfaces.md / architecture.md）。

## 原型页面 <!-- serves: FR-3 -->

**本需求不交原型**，走需求级豁免（D-5，`requirement.md` front-matter 的 `prototype_exempt`，理由非空）。
豁免成立的三条依据，逐条可核验：

1. **措辞与 class 已在代码里存在**，本次不改文案、不改样式：
   - `src/client/views/panels/docs.ts:849` 已有 `'<span class="dsh-pm-review" data-state="pass">已归档 ' + esc(fmtTime(...))`
   - `src/client/views/verification.ts:242` 同上
   - 本次只是把**进入该分支的谓词**从「无写入者的字段」换成「需求状态 / 服务端门禁读数」。
2. **没有"长什么样"的新决策**：三态（未提交 / 待归档（材料已备） / 已归档）的措辞、class、
   `data-state` 取值全部沿用现状，零新增设计令牌（见本文「样式与主题」的零改动判据）。
3. **唯一的待定项是数据契约**，不是视觉：删掉 `archivedAt` 后，「已归档」后面显示哪个时间。
   该契约钉死在 `design/interfaces.md` 的「归档时刻取值」一节，并已用真实台账数据验证
   （87/87 条归档记录都能取到真实时刻）。

**若人否决豁免**：需补交 `prototypes/archive-block-states.html`，画出三态在文档面板归档块与
验收页归档区的呈现，并在 `prototypes/INDEX.md` 标唯一权威版本、登记 `reqboard_submit(kind=prototype)`。

## 目录与包结构 <!-- serves: FR-3 -->

### 生产改动（5 个文件 / 10 行） <!-- serves: FR-3 -->

| 文件 | 行 | 现状 | 改动 |
|---|---|---|---|
| `src/shared/protocol.ts` | 983-984 | 声明 `archivedAt?: number` / `archivedBy?: ActorRef` | **删除两行** |
| `src/client/types.ts` | 144-145 | 客户端镜像声明同上 | **删除两行** |
| `src/client/views/panels/docs.ts` | 847 / 849 / 868 | `a.archivedAt === undefined` 三处判据 | 改用服务端归档门读数 |
| `src/client/views/verification.ts` | 241 / 242 / 247 | `a.archivedAt !== undefined` 三处判据 | 改用 `archivedMomentOf(req)` 与 `req.status` |
| `src/client/node-panel.ts` | 322 | `const at = a.archivedAt ?? a.submittedAt` | 改为 `const at = a.submittedAt`（该渲染器只在 `stage:'archived'` 下调用，无需条件） |

### 新增（1 个文件） <!-- serves: FR-3 -->

| 文件 | 职责 |
|---|---|
| `src/domain/status/ArchivedMoment.ts` | 纯函数 `archivedMomentOf(req): number \| undefined`——「这条需求是什么时刻进入 archived 的」的**唯一判定点** |

**为什么放 `domain/` 而不是 `shared/`**：两侧都要用（服务端 `QueryDocs` 算门禁读数、客户端
`verification.ts` 渲染徽标），而 `client/` 已经在 import `domain/`（先例：`src/client/node-panel.ts:31`
`import { ... } from '../domain/status/Predicates.js'`、`src/client/render/subtask-view.ts:17`），
放 domain 与既有分层一致，且不增加 `shared/protocol.ts` 的行数（该文件 1114 行，正卡在
`size-budget` 白名单里，不宜再增内容）。

**为什么不放进 `domain/status/Predicates.ts`**：该文件已有多个消费方；本次改动面越小，
审计可复核性越高（改动文件清单就是验收清单）。新增一个专职小文件，删它即可回滚。

## 组件结构 <!-- serves: FR-3 -->

三个渲染点**数据可得性不同**，故口径不同——但共同原则是：
**「已归档」这件事只在服务端判一次，客户端不复制谓词。**

| 渲染点 | 手上有什么 | 采用口径 | 依据 |
|---|---|---|---|
| `verification.ts` `renderArchiveSection(req: RequirementRecord)` | 完整 `req`（含 `status` 与 `statusHistory`） | 直接调 `archivedMomentOf(req)`；`req.status === 'archived'` 即已归档 | 该函数已持有 `req`，无需改签名 |
| `views/panels/docs.ts` `archiveSection(a: ArchiveRecord)` | 只有 `ArchiveRecord`；同载荷有 `DocsResponse.gates` | **从载荷的归档门读数取**（`d.gates` 里 `gate === 'archive'` 那条）：`verdict === 'passed'` ⇒ 已归档，`at` 即时刻 | 服务端 `buildGateVerdicts` 已把谓词算完；客户端照抄一个判据就是第二个事实源（本仓反复踩过的形态） |
| `node-panel.ts` `renderArchivedInfo(p: Extract<StageDetail,{stage:'archived'}>)` | 只有 `p.body.archive` | `at = a.submittedAt`，无分支 | 该渲染器的**阶段参数本身**就是 `archived`，再判一次是冗余 |

**签名变更**：`archiveSection(a: ArchiveRecord)` → `archiveSection(a: ArchiveRecord, gate: GateVerdict | undefined)`；
调用点 `views/panels/docs.ts:910` 传入从 `d.gates` 里取到的那条（取不到传 `undefined`，走保守分支）。

**边界**：`d.archive === undefined` 时该块整体不渲染（`:910` 现状），故本需求不需要处理
「无归档材料」在文档面板的呈现（那 22 条无清单需求在文档面板没有归档块，其读数由门禁页说「尚未提交归档材料」）。

## 状态管理 <!-- serves: FR-3 -->

不新增任何客户端状态。三处渲染的数据全部来自**既有载荷字段**：
`DocsResponse.gates`（已存在且为必填字段）、`RequirementRecord.status` / `.statusHistory`（已存在）、
`StageDetail.body.archive.submittedAt`（已存在）。**零新请求、零新缓存、零重绘门控改动。**

## 样式与主题 <!-- serves: FR-3 -->

**零样式改动**是本条的验收内容之一：

- 不新增、不删除任何 CSS 类名与设计令牌；沿用既有 `dsh-pm-review` + `data-state="pass" | "pending"`。
- 不改 `src/client/styles/` 下任何分片。
- 判据：改动前后 `git diff --stat src/client/styles/` 为空；`pnpm build:client` 打印
  `[verify-client] OK`（关键符号齐全、样式归属章在场、CSS 分片完整）——即规范 C-12 的期望输出。

## 关键决策与取舍 <!-- serves: FR-3 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 文档面板怎么判"已归档" | 给 `DocsResponse` 新增 `status` 字段，客户端自己判 | 复用载荷里**已有**的 `gates` 归档门读数 | 客户端再写一个判据就是第二个事实源；`gates` 已在载荷里，零新增字段 |
| "已归档"要不要显示时刻 | 用 `archive.submittedAt` 顶着（`node-panel` 现状的 fallback） | 用 `statusHistory` 里 `status='archived'` 的真实时刻 | 真实台账 **87/87** 条可取值；`submittedAt` 是"材料提交时刻"，标成"归档时刻"就是本次要修的同类谎报（D-2） |
| 谓词放哪 | 放进 `shared/protocol.ts` | 新增 `domain/status/ArchivedMoment.ts` | protocol.ts 已 1114 行且在 size-budget 白名单内；且两侧都可 import domain（有先例） |
| 三个渲染点要不要统一签名 | 全部改成传 `req` | 按数据可得性各用其道，但判据只在服务端发生一次 | 强行统一要改 `ArchiveRecord` 载荷形状（影响更大），而三处的可用数据本就不同 |

## 技术方案与亮点 <!-- serves: FR-3 -->

- **删字段而不是补写入点**：字段在 64 条归档记录中命中 0（见需求文档 FR-3），补写入点只会让
  一个断过一次的字段继续存在；删掉后判据回到单一事实源（`status`），且**不需要数据迁移**。
- **"可达性"修复的最小形态**：不改文案、不改样式、不新增组件，只换分支谓词——因此回滚
  就是把谓词换回去，改动可逆且边界清晰。
- **反假绿**：验收要求至少一条测试用例走**真实归档状态**（而非手工夹具构造 `archivedAt`）。
  现状 6 个测试文件都用夹具构造该字段，这正是"生产从不写它"能长期无人发现的原因；
  本次把夹具改成状态路径，等于给同一个洞补上覆盖。
