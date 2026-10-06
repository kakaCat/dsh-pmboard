# 测试证据 · REQ-261005141830-7a3b

> 逐条对 `requirement.md` 的「验收标准（可证伪，可跑）」与各卡 acceptance 给命令 + 输出摘要。
> 复跑环境：`/Users/mac/Documents/ai/dsh/dsh-pmboard`（2026-10-05，**共享工作树**，另有他需求在建改动）。
> 每个 `## TC-n` 块标 `covers:`（被覆盖的任务卡）与 `validates:`（被验证的需求条款），供 RTM 追溯。

## TC-1 会话 → 项目身份（N:1）、项目 → 根（1:1）

- covers: t-1920a2, t-b2e0a8, t-842bf8, t-c79c73, t-e4c854, t-90a74a
- validates: FR-2, FR-3
- 命令：`npx vitest run tests/project-identity.test.ts -t T-01` / `-t T-07`
- 结果：**通过**。T-01（2 条）：同项目的两个窗口解出同一个 id、另一项目解出各自 id；不在任何 `sessionIds` 里的会话解不出。
  T-07（8 条）：按 id 取到条目 `path`（形状归一）；条目缺失 / 有 id 无根 → `undefined`（触发兜底）；
  同一项目两个窗口取到的根一致；开窗落点与项目身份同源。

## TC-2 拿不到项目表 / 未命中 → 不抛、不编造

- covers: t-1920a2, t-b2e0a8, t-c79c73
- validates: FR-2, FR-8
- 命令：`npx vitest run tests/project-identity.test.ts -t T-02`
- 结果：**通过**（4 条）。注册表未装配 / 非对象 / 无 `list` / `list` 抛错 / 返回非数组 → 一律 `undefined`；
  坏行被跳过、数字 id 归一为字符串；同一会话被两个项目认领（宿主不一致）也返回 `undefined`（T-07c）。

## TC-3 同一项目判据：id 优先、路径兜底、缺失不猜

- covers: t-1920a2, t-b2e0a8, t-c79c73, t-e4c854
- validates: FR-4
- 命令：`npx vitest run tests/project-identity.test.ts -t T-03` / `-t T-04` / `-t T-05` / `-t T-06`
- 结果：**通过**（2 / 1 / 3 / 2 条）。同 id 不同路径写法（软链、尾斜杠、相对）→ 判同一项目且 `by='project-id'`；
  不同 id 路径一字不差 → 判不同项目；任一侧缺 id → 路径兜底且 `attributed=false`；两侧都缺且无可比 → `same=false`（不猜）。

## TC-4 立项即定身份与未归属标注

- covers: t-bf959f, t-610eb4, t-3b6fa7, t-ec5119, t-78ba89
- validates: FR-1, FR-8, FR-10
- 命令：`npx vitest run tests/project-identity.test.ts -t T-08` / `-t T-09` / `-t T-11` / `-t T-12`
- 结果：**通过**（8 / 1 / 4 / 4 条）。入口级（走真实立项用例）：记录与摘要都带 `projectId`；回执带 `project_source`；
  窗口不属任何项目 → **不写该键**、回执 `path-fallback`、台账评论出现「未归属项目（按路径兜底）」；
  同项目另一窗口立项不被「本项目已有需求」拒（守卫是窗口级）；推进其中一条 → 另两条逐字段零变化。

## TC-5 同一项目下多条需求：按项目一次问出

- covers: t-54297d, t-fcf3f1, t-df7a89, t-d96e0c, t-0f3b19, t-1de429
- validates: FR-10
- 命令：`npx vitest run tests/project-identity.test.ts -t T-10`
- 结果：**通过**（6 条）。同项目 3 条一次问出、另一项目 0 条；不传筛 = 全量（老行为）；
  显式要求「并回未归属」时才把无身份存量带回（缺省关闭）；单独给该开关不产生筛选效果。

## TC-6 取根：身份带出根 / 存量回落 / 两级兜底

- covers: t-d75839, t-443646, t-8334df, t-8193ba, t-0ac3a6, t-1de429
- validates: FR-3, FR-5, FR-8
- 命令：`npx vitest run tests/project-identity.test.ts -t T-13` / `-t T-14` / `-t T-15`
- 结果：**通过**（5 / 5 / 5 条）。有身份 → 用项目条目 `path`（记录自带旧路径不作数、不读共享单例当前值）；
  未装配 / 查不到 → 回落记录路径；存量（无身份）→ 回落自带路径并标 `attributed=false`，读写照旧；
  两者都没有 → 取根 `undefined` + 写侧回落调用方根，连它都没有则 `undefined`；
  身份指向的根不存在 → 写侧响亮拒绝（不降级到别的项目）。

## TC-7 老 SQLite 库：开库幂等补列

- covers: t-ed3264, t-cd48c5, t-5c3d00, t-14c117, t-54297d, t-fcf3f1, t-d96e0c, t-0f3b19
- validates: FR-8
- 命令：`npx vitest run tests/project-identity.test.ts -t T-16`；`npx vitest run tests/reqboard/sqlite-store.test.ts`
- 结果：**通过**（T-16 2 条；SQLite 套件 18 条）。新库带 `project_id`、无身份读回不带该键；
  老库（缺列）打开时按 `PRAGMA table_info` 补列，**补列前写全挂、补列后读写全通**（实测探针：`table requirements has no column named project_id`）。

## TC-8 Dive 归属按项目、起轮按窗口

- covers: t-90a74a, t-8dd63f, t-ebe240, t-d0db51, t-623e44
- validates: FR-7
- 命令：`npx vitest run tests/project-identity.test.ts -t T-17`；`npx vitest run tests/project-identity.e2e.test.ts -t E-03`
- 结果：**通过**（T-17 4 条 / E-03 1 条）。需求属 w-1、窗口被解析成 w-2 → **零投递** + 一条含 `project=` 的留痕；
  同项目 → 照常起轮；存量未归属 → 不拦；端口未装配 → 一律放行（老装配零行为变化）；
  同项目两窗口先后 idle → 投递数 **1**（起轮仍是窗口级）。

## TC-9 跨项目派席 / 交接 / 改绑拦截

- covers: t-90a74a, t-8dd63f, t-623e44
- validates: FR-11, FR-9
- 命令：`npx vitest run tests/project-identity.test.ts -t T-18`（含 T-19/T-20/T-21）；`npx vitest run tests/project-identity.e2e.test.ts -t E-04`
- 结果：**通过**（6 条 / 1 条）。跨项目派席 → `REQBOARD_CROSS_PROJECT_SEAT`（文案含两个 id、各自根与**判据来源**），
  **台账零改动**；同项目异 session → 成功且 `project_source='project-id'`；解绑跨项目窗口 → 不因项目而拒；
  跨项目交接 → 拒绝且台账零改动；同项目交接 → 放行；
  看板改绑（HTTP）跨项目 → 400 + 该错误码、`sourceSessionId` 未改。

## TC-10 三窗口端到端（各看各的 / 产物互不越界 / 共享根被改走）

- covers: t-1de429, t-dab64c, t-5aa22c, t-7fe8a1, t-41f24b, t-fd6cd0, t-555692, t-77b835, t-e4c149
- validates: FR-4, FR-6, FR-8, FR-10
- 命令：`npx vitest run tests/project-identity.e2e.test.ts`
- 结果：**通过**（6 条）。E-01：x/y（同属 P1）只看到 P1 的需求、z（属 P2）只看到 P2 的，`projectId` / `projectSource` / 根如实回传；
  产物互不越界：P1 下的同名需求目录不会被算成 P2 的产物，**P2 目录树零新增**；
  E-01b：本项目 + 未归属一起显示，未归属那条摘要里没有 `projectId`；
  E-02：邻居窗口把共享根改走 P2 后，x 的写入仍落 P1、P2 与记录里那份过期路径**零新增**。

## TC-11 知识层自举：去重键按项目身份

- covers: t-1de429, t-5aa22c, t-7fe8a1
- validates: FR-6
- 命令：`npx vitest run tests/kb-bootstrap-compat.test.ts`；`npx vitest run tests/kb-bootstrap-hooks.test.ts`
- 结果：**通过**（10 / 9 条）。同一 `projectId`、两个窗口各自解析出的根 → **只自举一次**（按身份去重，不是按路径）；
  另一个项目 → 各一次；不给身份（存量）→ 回落按归一路径去重（老行为）。

## TC-12 跨项目分区与写盘点静态门禁

- covers: t-1de429, t-5aa22c
- validates: FR-6, FR-5
- 命令：`npx vitest run tests/project-scope.test.ts`
- 结果：**1 failed / 27 passed**。唯一失败项＝`EnsureKnowledgeLayer.ts:169` 的裸写点未受守卫保护，
  该行在 `HEAD` 处逐字存在（`git show HEAD:src/application/use-cases/EnsureKnowledgeLayer.ts` 核验）⇒ **零新增失败**。

## TC-13 类型检查

- covers: t-1920a2, t-54297d, t-d75839, t-bf959f, t-1de429, t-90a74a, t-575285, t-ed3264, t-dab64c, t-b2e0a8, t-842bf8, t-c79c73, t-e4c854, t-fcf3f1, t-df7a89, t-d96e0c, t-0f3b19, t-443646, t-8334df, t-8193ba, t-0ac3a6, t-610eb4, t-3b6fa7, t-ec5119, t-78ba89, t-5aa22c, t-7fe8a1, t-41f24b, t-fd6cd0, t-8dd63f, t-ebe240, t-d0db51, t-623e44, t-cd48c5, t-5c3d00, t-14c117, t-2727fc, t-769797, t-555692, t-77b835, t-e4c149
- validates: 验收标准 7
- 命令：`npx tsc --noEmit`
- 结果：本需求改动文件**零新增错误**（最近一次整仓全绿：退出码 0）。
  当前整仓唯一 1 条错误位于 `tests/open-window-inherit.test.ts:688`，该文件属**另一窗口 15:34 的在途改动**
  （全文件零 `projectId` 痕迹），与本需求无关。

## TC-14 全量测试与基线

- covers: t-dab64c, t-555692, t-e4c149
- validates: 验收标准（`pnpm test`）
- 命令：`npx vitest run`
- 结果：**67 failed / 5456 passed**（5545 条；36 个文件失败）。开工前基线为 **68 failed**（本次少 1 条：
  `kb-generate` 因生成物重生成而转绿）；`design/test-cases.md` 记录的 HEAD 基线为 **106 failed**。
  失败集合与本需求开工前**逐条一致**（无新增失败文件）。

## TC-15 判别力自证（停用即红）

- covers: t-dab64c, t-77b835, t-555692
- validates: FR-9 与「每条接线都要有判别力」
- 命令：见 `docs/requirements/REQ-261005141830-7a3b/evidence/t9-stop-red.md`
- 结果：**通过**（六条 + 一条补充）。逐一停用：取根的身份分支（T-13/E-02 变红）、同一项目判据 id 优先（T-03/T-04）、
  按项目筛（T-10/E-01）、Dive 归属比较（T-17）、派席与改绑校验（T-18/E-04）、立项写身份（T-08/T-12）；
  补充一条：把「起轮按绑定窗口」改成按项目找（= 把 `projectId` 当窗口用）→ E-03 变红（投递数 2 ≠ 1）。
  每次恢复都做了**逐字节校验**，临时补丁零残留。

## TC-16 知识层生成物与闸门

- covers: t-575285, t-2727fc, t-769797
- validates: FR-9（文档口径落地）
- 命令：`npx tsx scripts/kb-build.mts --check`；`npx tsx scripts/kb-probe.mts`
- 结果：**kb-build 零漂移**（代码地图 / 符号表 / 设计令牌与源码一致）。
  kb-probe：**11 项检查 4 项失败**，全部来自其他在途需求——kb-0043 孤儿条目与超长 one-liner（技能需求）、
  INDEX 超预算 9101 > 8000、6 个未归类脚本（`.probe`、`doc-section-parity.mts`、`rework-inverse-verification.mts`、
  `rollback-landing-replay.mts`、`template-gate-probe.mts`、`template-render-map.json`）。
  本需求新增脚本 **0** 个、新增知识条目 **0** 条。

## TC-17 台账分布实测（存量不迁移、不拒写）

- covers: t-ed3264, t-cd48c5, t-14c117
- validates: FR-8
- 命令：`python3 -c "import json,glob,collections,os;p=os.path.expanduser('~/.dsh/reqboard')+'/**/record.json';print(collections.Counter((json.load(open(f)).get('workspaceRoot'),json.load(open(f)).get('projectId')) for f in glob.glob(p,recursive=True)).most_common())"`
- 结果：**74 条存量全部在盘**：本项目 58 / 另一项目 7 / 第三处 6 / 无根 3；`projectId` 一律为空（未归属）。
  读写全通由 TC-6 / TC-7 覆盖；台账里出现带身份的**新**记录需要宿主重载新产物（当前宿主仍按启动时的旧 build 跑）。
