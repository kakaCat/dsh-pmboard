---
doc: migration
requirement_id: REQ-261008020552-4aa0
serves: [FR-1, FR-2, FR-5]
---

# 数据层与回滚设计：无 schema 迁移，留痕字段一处取值变更（D-3）

> 本仓覆盖要求：明确「是否改表 / 改 schema、迁移方式与回滚」。
> 结论先行：**不改台账 schema、无数据迁移**；唯一数据面值变化是 D-3 申报的
> `interruption.tool` 新记录取值，历史记录不改写。

## 1. 是否改表 / 改 schema <!-- serves: FR-1, FR-2 -->

**否。** 本批变更面全部在工具壳层（注册/分派/描述文案）与文档同步面：

- 台账（`~/.dsh/reqboard`，schemaVersion 9）字段零增删；无迁移代码、无版本 bump。
- 被删除的两个工具是**无状态壳**：ArchiveAmendTool / NoteInterruptionTool
  本身不持有数据，全部状态在用例与台账；收编后同一用例写同一份台账。
- task_move / submit 的描述减负只改工具 schema 的**描述字符串**——schema 不进台账，
  参数形状（键名/类型/必填/枚举）零变化，落库数据无感知。

## 2. 唯一数据面值变化：interruption.tool（D-3 已申报） <!-- serves: FR-2 -->

- 现状：`NoteInterruption.ts:92` 写死 `tool='reqboard_note_interruption'`，
  落入台账 `requirement.interruption.tool`（「最后成功调用的工具名」留痕）。
- 变更：新记录写 `'reqboard_task_amend'`（真实工具名；旧名删除后留痕指向死名字 = 误导）。
- **历史记录不改写**：已有台账里 `interruption.tool='reqboard_note_interruption'` 的
  值保持原样——它是历史事实（当时确实是那个工具写的），不是错误数据。
- 读者兼容：`interruption.tool` 是**可缺省的展示型留痕字段**（interfaces I-8 标注
  「可缺省」），读路径（断点节渲染 / 节点输入包）不对该值做枚举校验，
  新旧值混存无消费方受影响。
- 测试同步：`tests/interruption-checkpoint.test.ts:175` 的 bp.tool 断言改为新值。

## 3. 运行中会话的影响面 <!-- serves: FR-1, FR-2 -->

- **插件热加载/重启后**：被删的两个工具名从注册表消失。运行中会话若按旧记忆调用
  `reqboard_archive_amend` / `reqboard_note_interruption` → 宿主报 unknown tool。
  缓解：task_amend prompt 写明承接关系（「归档补录 = op=archive」「断点补写 =
  op=interruption」指路文案），与第三批 S2/S3 同款做法。
- **挂起确认 ticket / 实施链 run**：存取逻辑不经过这两个工具，零影响。
- **HTTP 看板面**：`/req/archive-amend` 路由与看板补录入口共用 `amendArchiveManifest`
  用例，本批不动；看板功能不因工具删除而缺失。

## 4. 回滚设计 <!-- serves: FR-5 -->

- **代码回滚**：U1~U5 五个回滚单元各自独立 commit；任一步出问题
  `git revert <该单元 commit>` 即回到上一步状态，单元间无耦合（U5 依赖前序已落地单元，
  回滚前序单元需先回滚 U5）。
- **数据回滚**：**不需要**。台账无 schema 变更、无写路径变更；
  收编前后用例写的是同一份记录结构。即使 U1/U2 回滚（两个旧工具恢复注册），
  期间经 task_amend 新 op 写入的归档补录 / 断点记录依然合法可读
  （同用例同结构，与入口无关）。
- **D-3 回滚特例**：若回滚 U2，`interruption.tool` 的新记录值（'reqboard_task_amend'）
  留存在台账——可接受：该字段是展示型留痕，不驱动任何判定。
