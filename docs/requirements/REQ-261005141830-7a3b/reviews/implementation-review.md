# 实施评审记录 · REQ-261005141830-7a3b

> 评审对象：项目身份层（`src/application/internal/project-identity.ts` / `project-root.ts` / `ports.ts` /
> `support.ts` / `project-root.ts` / 适配器与仓储）+ 五处判定面接线（立项 / 取根 / 看板与扫描 / 知识层 /
> Dive 与席位）+ 三窗口 E2E 与判别力自证。
> 评审时间：2026-10-05 · 评审人：本窗口 agent（**汇总各卡复核子卡结论**：
> t-c79c73 / t-d96e0c / t-8193ba / t-ec5119 / t-41f24b / t-d0db51 / t-5c3d00 / t-77b835；
> 其中 D-9（跨项目派席默认拒绝）是本需求在设计期由 agent 提的**建议值**，已随设计确认由人批准）。

## 评审要点与结论

| # | 评审点 | 结论 |
|---|---|---|
| 1 | 判据是否真的单点 | 通过：`sameProjectOf`（同一项目）/ `rootOfRequirement`（这条需求的根）/ `requireSameProject`（席位与交接）三处；`partitionByProject` 复用同一判据，未再各写一套路径比较 |
| 2 | 判定顺序是否与设计表一致 | 通过：① 两侧都有 `projectId` → 比 id（根不参与比较）；② 任一侧缺 → 路径形状比较且 `attributed=false`；③ 都缺且无可比 → **不猜** |
| 3 | 归属 vs 投递是否分清 | 通过：归属按项目级（同项目任一窗口可读可写可扫），起轮/投递/席位仍按 `windowKey`；判别用例 E-03 专门钉死（把 `projectId` 当窗口用即变红） |
| 4 | 写侧是否仍然 fail-closed | 通过：`ensureWritableProjectRoot` 的判定顺序（① 非绝对不判 ② 绝对但不可用即拒 ③ 校正 ④ 复核）逐字未动，只把「声明根」的来源换成 `rootOfRequirement`（身份优先、路径兜底） |
| 5 | 存量兼容是否真的零迁移 | 通过：无 id 的记录沿用路径口径且读写全通（T-14 / TC-6）；老 SQLite 库开库幂等补列（T-16 / TC-7）；`REQBOARD_SCHEMA_VERSION` 维持 9 |
| 6 | 未归属是否如实标注（不静默） | 通过：取根回落 `attributed=false`；立项评论写明「未归属项目（按路径兜底）」；派席/交接回执带 `project_source`；看板把「本项目 + 未归属」一起列出（老记录不消失） |
| 7 | 跨项目是否默认拒绝且留痕 | 通过：派席 / 交接 / 改绑三处同一判据，拒 `REQBOARD_CROSS_PROJECT_SEAT`（HTTP 400），文案给两个 id、各自根与判据来源；`remove=true` 不校验（只做减法） |
| 8 | 工具输出契约是否同步 | 通过：`BindTool` / `HandoffTool` / `CreateTool` 的输出 schema 已声明新字段；`output-contract` 扫描这三个工具均绿 |
| 9 | 用例是否真有判别力 | 通过：六条接线逐一停用即红（T-13/E-02、T-03/T-04、T-10/E-01、T-17、T-18/E-04、T-08/T-12），另补一条「起轮按窗口」→ E-03 红；见 `evidence/t9-stop-red.md` |
| 10 | 影响面是否可控 | 通过：本需求不新增对外必填参数、不改 `REQ-xxx` 需求 id 语义、不做台账迁移；不改客户端页面（`projectSource` 等字段纯加性，前端不读也不报错） |

## 评审中发现并处理的问题

1. **`reqboard_create` 的输出 schema 漏声明（真缺陷，已修）**：用例层返回 `projectId` / `project_source`，
   而工具 schema 是 `additionalProperties: false` 且没声明这两个键 ⇒ **每次真实立项都会被绑定层拒收**
   `value.projectId is not a declared property`（与 2026-10-03 `reqboard_capture` 的同类事故同因）。
   已在 `src/tools/CreateTool/CreateTool.ts` 补声明，`output-contract` 该项转绿。
2. **E-02 判别力一开始是假的（已修）**：初版夹具让记录自带的 `workspaceRoot` 等于项目条目 `path`，
   于是「停用按身份取根」也能绿——该用例等于空过。改成记录里放一份**过期路径**（与项目当前路径不同）后，
   停用即红（T-13 同时红）。
3. **回滚说明里一处断言写错（已修）**：文档把 SQLite 读路径写成「`SELECT` 显式列名」，
   实际是 `SELECT *` + 行映射（缺列即 `undefined`）；复核时回到代码改正。
4. **「起轮按窗口」缺独立判别（已补）**：设计表把 E-03 挂在「Dive 归属比较」下，但 E-03 真正钉的是
   「归属项目级 ≠ 起轮窗口级」；补做该条停用证明（按项目找需求 → 投递数 2）。
5. **变更记（实施期，非 agent 自裁）**：看板列表新增的 `includeUnattributed` 选项
   ——**由人裁决**：看板按项目过滤后，没有项目身份的存量记录（实测 74 条全部如此）要继续显示并标注未归属，
   否则本项目窗口的看板会直接变空。裁决来源：本窗口 2026-10-05 对话选项「本项目 + 未归属一起显示（推荐）」。

## 遗留观察（不影响本次交付，需人知晓）

1. **台账里出现带 `projectId` 的新记录需要宿主重载**：当前运行中的插件仍是启动时的旧 build，
   故实测台账 74 条全部没有 `projectId`（属**存量口径**，不是缺陷）；用例层已证明新立项会写身份
   （T-08 / T-11 / T-12）。重启宿主后新立项即带身份，存量按路径兜底照旧可用。
2. **`project-scope.test.ts` 唯一失败项是 HEAD 既有失败**：`EnsureKnowledgeLayer.ts:169` 的裸写点未受写侧守卫保护，
   该行在 HEAD 处逐字存在；本需求新增脚本 0 个、新增裸写点 0 个，故为零新增。
3. **kb 闸门 4 项失败全部属其他在途需求**：kb-0043 条目问题（技能需求）、INDEX 超预算、6 个未归类脚本；
   本需求已把自己的生成物重生成到零漂移。
4. **并发工作树的干扰**：期间多次出现「重生成后又漂移」与「整仓类型检查多一条错误」，
   逐一核对后均来自其他窗口的并发改动（`window-inherit.ts` / `OpenWindow.ts` 等，零 `projectId` 痕迹）。
5. **架构级未做**：共享单例根仍是全局可变（本需求让判定不再依赖它）；「两写交错时后校正者获胜」仍是固有属性。
   跨项目**显式强制覆盖开关**未做（设计裁定：本次不提供）。
