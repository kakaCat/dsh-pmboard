# 迁移方案：工具面精简 27 → 21（REQ-261007220012-bd29）

> refactor 档第二份：数据层结论、调用方迁移对照、分批与独立回滚。

## 数据层：不改表、不改 schema、无迁移 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

本批只动工具面（src/tools/）与查询组合（QueryState/TaskTree 用例的读取分支），
**不触碰台账写路径**：~/.dsh/reqboard 的 record/comments/history 形状不变，
队列任务卡形状不变，无 schemaVersion 迁移、无数据回填。
回滚因此不需要数据层补偿——任何一步 revert 后台账原样可用。

## 调用方迁移对照（旧名 → 新入口） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 被删工具 | 迁移到 | 语义映射 |
|----------|--------|----------|
| reqboard_task_execute | reqboard_task_run | 本来就是真委托同一工厂，零映射成本 |
| reqboard_confirm_receipt(ticket) | reqboard_ask_confirm(ticket=…) | 入参逐字一致；返回键是 ask_confirm schema 已有子集 |
| reqboard_run_status(requirement_id?, run_id?) | reqboard_status(requirement_id?, run_id?) → 读 `run` 节 | 入参逐字一致；snapshot.* 平移到 run.*，降级形状同今 |
| reqboard_task_status(task_id) | reqboard_task_tree(task_id=…) → 读 `task` 节 | 入参逐字一致；返回键平移到 task.*（含 workflow 保留键） |
| reqboard_task_refs | reqboard_task_amend(op=refs, …) | 其余入参逐字一致 |
| reqboard_task_adopt | reqboard_task_amend(op=adopt, …) | 其余入参逐字一致 |
| reqboard_task_regenerate | reqboard_task_amend(op=chain, …) | 其余入参逐字一致 |

**存量调用方硬断的处置**：合并后按旧名调用 → 宿主报 unknown tool。
本批接受这一硬断（用户已授权删除；agent 侧的记忆通道 = 工具 description 每轮重发，
新 description 写明承接关系），存续工具 prompt 更新指路：
task_run 删「已弃用别名」段改写「唯一链入口」；ask_confirm / status / task_tree /
task_amend 的 description 各加一句承接的旧能力。

**在途对象兼容**：挂起确认 ticket（pc-…）存取走同一个 pending-confirm registry，
ask_confirm(ticket) 取旧 ticket 不受影响；运行中的实施链 run 读同一份
record.advance + JobsPort，status 的 run 节读数与旧 run_status 一致。

## 分批与独立回滚 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

按「一次只改一类东西」分 6 批，每批一个 commit、批间 `pnpm test` 必绿、
任一批独立 `git revert` 可回滚（批次内容见 architecture.md §文件结构，
具体任务 DAG 由拆分阶段定，本表只定验证单元与回滚边界）：

| 批 | 一类改动 | 工具数 | 独立验证 |
|----|----------|--------|----------|
| B1 | 纯删除（S1：TaskExecuteTool 及其全部引用） | 27→26 | FR-1 grep 零命中 + 契约三件套绿 |
| B2 | 合并（S2：confirm_receipt → ask_confirm） | 26→25 | FR-2 判据 + 换入口测试绿 |
| B3 | 合并（S3：查询面 4→2） | 25→23 | FR-3 判据 + 换入口测试绿 |
| B4 | 合并+新建（S4：task_amend 三合一） | 23→21 | FR-4 判据 + 换入口测试绿 |
| B5 | 改名+单源化（S5+S6，不动工具数） | 21 | FR-5/FR-6 判据绿 |
| B6 | 文案同步面（README 工具表、package.json 计数） | 21 | readme-tool-face + FR-7 全判据绿 |

回滚注意点：B2~B4 之间有软序（都改 index.ts/registry.ts，revert 中间批需带上下文解冲突，
但每批的文件集合在工具目录层面互不重叠，目录级回滚始终干净）；
B6 只改文案，恒可独立 revert。台账数据任何批都不受影响（§数据层）。

## 失败路径与降级口径 <!-- serves: FR-2, FR-3 -->

- ask_confirm 三岔分派：evidence 与 ticket 同传 → evidence 优先（与现状 evidence 非空
  即走文字路径的口径一致），并在 note 里如实说明 ticket 被忽略；ticket 未知/过期 →
  REQBOARD_UNKNOWN_TICKET 原样（用例不改）。
- status 的 run 节：JobsPort 未装配 → jobStatus='not_found' 如实报（原 RunStatusTool 口径）；
  TaskStore 未装配 → 显式失败，不谎报「没有任务」；无 active run → run.runId 整键省略。
- task_tree 单卡模式：卡不存在 → task.status='not_found' + error（原 TaskStatusTool 口径）；
  task_id 与 parent_id 同传 → REQBOARD_INVALID_INPUT。
- task_amend：三个 op 的幂等性继承原用例（refs 值同不写盘 / adopt 只补缺失 /
  chain 缺省 dry_run 只读），无新增并发面；`assertNoPendingConfirm` 前置与原三壳一致。
