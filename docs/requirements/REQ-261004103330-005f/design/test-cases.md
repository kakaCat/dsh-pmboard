---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sides: [frontend, backend]
---

# 测试用例设计：运行设置与可切换存储后端（REQ-261004103330-005f）

> 本文档给的是**可落地的断言**，不是"应该测一下"。每个 TC 都写明落点 vitest 文件与可证伪的期望。
> 任务绑定（`covers: t-xxx`）在拆分阶段落库后由拆分计划回填——设计阶段任务卡尚不存在，不在此处臆造编号。
> 反向演练（mutation）用例单列一节：**去掉风险处置后必须变红**，否则该处置等于没写。

## 测试策略与分层 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17 -->

| 层级 | 范围 | 手段 | 落点文件 | 运行 |
|---|---|---|---|---|
| 单元 | 纯函数：设置解析 / 校验 / 事件载荷 / 版本比对 / 陈旧判定 | vitest，零 IO，临时目录注入 | `tests/reqboard/settings-file.test.ts`、`tests/reqboard/system-record.test.ts` | `npx vitest run tests/reqboard/settings-file.test.ts` |
| 契约 | `RequirementStore` 同一份断言跑遍所有实现 | 注册表驱动（`IMPLEMENTATIONS`） | `tests/reqboard/store-contract.test.ts` | `npx vitest run tests/reqboard/store-contract.test.ts` |
| 集成 | 装配期后端选择 / 迁移门三态 / 初始化语义 / HTTP 路由 | 组合根装配 + 假文档端口 + 临时 `dshHome` | `tests/reqboard/settings-init.test.ts`、`tests/reqboard/migration-gate.test.ts`、`tests/reqboard/settings-router.test.ts` | `npx vitest run tests/reqboard/settings-init.test.ts` |
| 集成 | 迁移脚本五步 + 失败回滚 + 校验不过不写设置 | 进程内调用脚本函数（不 spawn） | `tests/reqboard/sqlite-migrate.test.ts` | `npx vitest run tests/reqboard/sqlite-migrate.test.ts` |
| E2E | 看板改上限 → 宿主快照 → Dive 到顶停手；确认门 → 开窗 → 迁移 → 重启后生效 | 假投递端口 + 假窗口开启器，全链路走真实装配 | `tests/reqboard/settings-e2e.test.ts` | `npx vitest run tests/reqboard/settings-e2e.test.ts` |
| 反向演练 | 移除风险处置后原用例必须变红 | 临时补丁 + 断言"红" | 同各自落点 | 见「反向演练」一节，逐条给出红法 |

基线纪律：开工时先跑 `npx tsc --noEmit 2>&1 | grep -c 'error TS'` 与 `npx vitest run tests/reqboard tests/application tests/http` 记下**基线数值**，写进任务卡；交付时不得劣化。

## 单元层用例 <!-- serves: FR-1, FR-2, FR-4, FR-6, FR-13, FR-14, FR-15, FR-16, FR-17 -->

### TC-1: 设置来源顺序四态 <!-- serves: FR-1, FR-2 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-1, FR-2

- **前置**：`resolveRunSettings()` 可import；准备 file / config / env 三份输入。
- **步骤**：依次喂 ① file+config+env ② config+env ③ env ④ 全空，各调一次并取 `stageMaxRounds.implementing`。
- **期望**：
  - ① `value=800, source='settings'` ② `value=500, source='config'` ③ `value=300, source='env'` ④ `value=1000, source='default'`
  - 四态下 `default` 字段恒为 1000（默认值来自 `STAGE_CONFIGS`，不是复制品）
  - 未被任何来源提到的 `design` 恒为 `200 / 'default'`

### TC-2: 上限取值校验与逐键作废 <!-- serves: FR-1, FR-2, FR-4 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-2, FR-4

- **前置**：file 里 `implementing: 0`、`design: 10001`、`accepting: 1.5`、`brainstorming: 300`。
- **步骤**：调 `resolveRunSettings({file})`，逐个断言语义。
- **期望**：
  - 三个非法键 `value` 回落到默认（1000 / 200 / 50），`source='default'`，且 `problems[]` 各有一条含键名与原因
  - **合法键不受牵连**：`brainstorming.value=300, source='settings'`（不整份回退）
  - 边界值 `1` 与 `10000` 均判**合法**（闭区间）

### TC-3: 设置文件损坏 / 未知 schemaVersion 的响亮回落 <!-- serves: FR-1, FR-17 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-1, FR-17

- **前置**：临时 `dshHome`；写入 `{"schemaVersion": 2, ...}` 与 `"{ 这不是 JSON"` 两份文件各跑一轮。
- **步骤**：`FileSettingsStore.refresh()`。
- **期望**：
  - 两轮都不抛；`snapshot()` 全为默认值 + `source='default'`
  - `problems` 非空且 `fellBackTo` 写明回落到什么
  - 归档断言：`SystemRecordStore` 收到一条 `settings-invalid` 事件（键名 + 原因 + fellBackTo）

### TC-4: `roundLimitFor` 同步读快照 + PATCH 后下一回合生效 <!-- serves: FR-2 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-2

- **前置**：`SettingsStore` 已装配，初始快照 `implementing=1000`。
- **步骤**：① 直接调 `roundLimitFor('implementing')` ② `update({stageMaxRounds:{implementing:5}})` 后再调 ③ 断言函数签名同步（返回 number，非 Promise）。
- **期望**：
  - ① 返回 `1000` ② 返回 `5`（**无需 await**，热路径不引入异步）
  - `roundLimitFor('不存在的阶段')` 回落 `10`（与既有"未知阶段回落"语义一致）

### TC-5: 读盘失败保留旧快照，绝不静默退默认 <!-- serves: FR-1, FR-2 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-1, FR-2

- **前置**：快照已是 `implementing=300`；随后把设置文件替换为不可读（权限 000 或删父目录）。
- **步骤**：`refresh()` → 读 `snapshot()`。
- **期望**：
  - 快照**仍是 300**（不是 1000）——静默退默认会让上限突然翻三倍
  - `onWarn` 收到一条含路径与原因的告警；`problems` 标注本次刷新失败

### TC-6: 原子写（临时文件 + rename） <!-- serves: FR-1, FR-4 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-1, FR-4

- **前置**：已有设置文件含 `design: 150`；注入 rename 失败（mock fs）。
- **步骤**：`update({stageMaxRounds:{implementing:7}})`。
- **期望**：
  - 抛 `REQBOARD_IO_FAILED`（消息含路径与原因）
  - **旧文件逐字节未变**（仍是 `design:150`，无 `implementing` 键）；无残留 `.tmp` 文件被当成正式文件读取

### TC-7: 版本比对写 `upgrade` 事件 <!-- serves: FR-15, FR-16 -->

**层级** 单元 · **落点** `tests/reqboard/system-record.test.ts` · **validates** FR-15, FR-16

- **前置**：系统记录里 `plugin.version='0.0.9'`、`buildStamp='A'`；当前为 `0.1.0 / B`。
- **步骤**：`reconcileVersion({version:'0.1.0',buildStamp:'B'}, 1)`；再调一次。
- **期望**：
  - `history` 末尾新增 `upgrade`，`from={0.0.9,A}`、`to={0.1.0,B}`、`detectedBy='startup-compare'`
  - 顶层 `plugin.version` 刷成 `0.1.0`；`counters.upgrades` 从 0 → 1
  - 第二次调用**不新增事件**（版本相同即幂等），`upgrades` 仍为 1

### TC-8: 库 schema 不匹配 → 报警 + 重建指引，不硬读旧表 <!-- serves: FR-16 -->

**层级** 单元 · **落点** `tests/reqboard/system-record.test.ts` · **validates** FR-16

- **前置**：库 `meta.sqlite_schema_version = 0`，当前常量 `1`。
- **步骤**：`reconcileVersion({version:'0.1.0',buildStamp:'B'}, 1)` 与 `SqliteRequirementStore` 构造。
- **期望**：
  - 结论 `consistent=false`，含 `REQBOARD_SQLITE_SCHEMA_MISMATCH` 与"重建库"指引文案
  - 构造器**抛错而不降级读表**（断言：任何查询方法都未被执行）
  - 系统记录 `compat.consistent=false`（屏上可红字）

### TC-9: 陈旧库判定 <!-- serves: FR-13 -->

**层级** 单元 · **落点** `tests/reqboard/system-record.test.ts` · **validates** FR-13

- **前置**：分片 `requirements=128`、库 `requirements=44` 且 `migratedAt` 早于分片最后写入。
- **步骤**：`updateStores()` 后读 `stores.sqlite`。
- **期望**：`stale=true` 且 `staleReason` 含两侧条数与日期；库条数 ≥ 分片时 `stale=false`（不误报）

### TC-10: 后端来源解析与 `restartRequired` <!-- serves: FR-6 -->

**层级** 单元 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-6

- **前置**：本进程 `effective='json'`；设置文件写 `storage.backend='sqlite'`。
- **步骤**：`refresh()` → 读 `snapshot().storage`。
- **期望**：
  - `backend.value='sqlite'`、`source='settings'`、`effective='json'`（本进程没换实现）、`restartRequired=true`
  - 四级来源逐态可验：settings → config → `PMBOARD_STORAGE` → `'json'`
  - 非 `json|sqlite` 的字面量 → 作废并记 `settings-invalid`，回落 `json`

### TC-11: 系统记录事件载荷构造（含插件版本与确认人） <!-- serves: FR-14, FR-15 -->

**层级** 单元 · **落点** `tests/reqboard/system-record.test.ts` · **validates** FR-14, FR-15

- **前置**：固定时钟与 `PluginStamp`；构造五类事件（startup / upgrade / migration / backend-switched / settings-invalid）。
- **步骤**：调 `events.ts` 的载荷构造函数。
- **期望**：每条都带 `at` 与 `plugin{version,buildStamp}`；`migration` 带 `result/requirements/durationMs/windowKey/confirmedBy`；`backend-switched` 带 `keptOtherStore` 与 `confirmedBy.channel='board-confirm'`

## 契约层用例 <!-- serves: FR-7, FR-8, FR-9 -->

### TC-12: 注册表登记（SQLite 进 `IMPLEMENTATIONS`） <!-- serves: FR-8 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-8

- **前置**：`SqliteRequirementStore` 可构造（临时库文件）。
- **步骤**：读注册表，定位该实现条目。
- **期望**：
  - 存在且 `suites` 含 `'read'` 与 `'write'`（**不能只声明 read**）
  - 注册表自检用例通过：无"声明了却未覆盖"的套件、无重复 id
  - 临时库路径位于测试临时目录（断言不在 `~/.dsh` 下留文件）

### TC-13: 读套件全绿 <!-- serves: FR-7, FR-9 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-7, FR-9

- **前置**：同一批 seed（含大字段 `description`/`dive`/`advance`/`artifacts`/`tokenUsage`、评论、历史）。
- **步骤**：跑 read 套件（`get` / `getSummary` / `listSummaries` / `listComments` / `listHistory` / `head`）。
- **期望**：
  - `get` 装配结果与 seed **逐字段深比较相等**
  - `listSummaries` 排序契约 `updatedAt DESC, id ASC` 成立；游标翻页拼接结果 == 全量结果，且 `nextCursor===undefined` 收尾
  - `listComments`/`listHistory` 的 `since`（含起点）与 `limit` 语义与分片实现一致

### TC-14: 写套件全绿 <!-- serves: FR-7, FR-8 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-7, FR-8

- **前置**：空库；写用例与分片实现共用同一份断言。
- **步骤**：跑 write 套件（`create` / `mutate` / `appendComment` / `sweep` / `replaceAll` / `subscribe`）。
- **期望**：
  - `create` 重复 id → `REQBOARD_ALREADY_EXISTS` 且**不覆盖**已有记录
  - `mutate` 返回 `undefined`/`{changed:false}` 时**不 bump version、不广播**
  - `subscribe` 回调在**事务提交后**触发（回调内 `get` 能读到本次写入）
  - `sweep` 一次事务覆盖多条；`replaceAll` 后 `head.revision` 与导入结构一致

### TC-15: CAS 语义（`mutateIf` 冲突不静默覆盖） <!-- serves: FR-7 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-7

- **前置**：记录 `version=3`。
- **步骤**：`mutateIf(id, 2, …)` → 捕获错误；再 `get(id)`。
- **期望**：抛 `REQBOARD_CONFLICT` 且错误里带**当前版本 3**；库内容与 version 均未变

### TC-16: 冷侧只读 <!-- serves: FR-7 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-7

- **前置**：seed 一条 `archived` 记录。
- **步骤**：对该 id 调 `mutate` / `appendComment`。
- **期望**：均抛 `REQBOARD_COLD_IMMUTABLE`；读路径（`get`/`listSummaries` 冷侧 scope）仍可读

### TC-17: `headAfterDrain` 返回"已落盘"的 revision <!-- serves: FR-7, FR-9 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-7, FR-9

- **前置**：空库；连续两次 `mutate` 不 await 排空。
- **步骤**：紧跟一次 `headAfterDrain()`。
- **期望**：返回值 ≥ 两次写入后的 revision，且**随后立刻读 `get` 能看到两次写入的结果**（"先落盘再遗弃"的证据指针成立）

### TC-18: 两后端数据形态等价 <!-- serves: FR-9 -->

**层级** 契约 · **落点** `tests/reqboard/store-contract.test.ts` · **validates** FR-9

- **前置**：同一批 20 条 seed（含大字段与冷侧）。
- **步骤**：分别灌入分片实现与 SQLite 实现，逐条 `get` 深比较；再比较 `listSummaries` 分页序列。
- **期望**：`JSON.stringify` 级深度相等（大字段键集合一致）；分页 id 序列逐位相同；`REQBOARD_SCHEMA_VERSION` 两实现均报 **9**（未升版）

## 集成层用例 <!-- serves: FR-3, FR-4, FR-6, FR-10, FR-11, FR-12, FR-13, FR-14, FR-17 -->

### TC-19: `GET /settings` 形状与来源标注 <!-- serves: FR-3, FR-15 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-3, FR-15

- **前置**：临时 `dshHome`；设置文件含 `implementing=800`；插件配置含 `design=150`。
- **步骤**：`GET /dashboard/api/reqboard/settings`。
- **期望**：
  - `data.plugin` 含 `name/version/buildStamp`，`version` 等于 `package.json.version`
  - `stageMaxRounds.implementing={value:800,default:1000,source:'settings'}`、`design.source='config'`、`accepting.source='default'`
  - `storage.effective` 与 `restartRequired` 自洽（`effective≠value` ⇒ `restartRequired===true`）
  - 信封为 `{success:true,data}`（沿用既有形状，不新造）

### TC-20: `PATCH /settings` 校验与落盘 <!-- serves: FR-4 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-4

- **前置**：初始无设置文件（惰性）。
- **步骤**：① `PATCH {stageMaxRounds:{implementing:0}}` ② `PATCH {stageMaxRounds:{implementing:10001}}` ③ `PATCH {stageMaxRounds:{implementing:250, design:80}}`。
- **期望**：
  - ①② `400 invalid_input`，消息含**项名 + 范围 + 怎么改**；**设置文件仍未创建**（失败零副作用）
  - ③ `200`，回体含新生效值；文件此时才出现，且只含被改的两个键 + `schemaVersion`；再 `GET` 读回同值

### TC-21: `PATCH` 不得绕过确认门切后端 <!-- serves: FR-4, FR-11 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-4, FR-11

- **前置**：设置文件存在，`backend` 缺省。
- **步骤**：`PATCH {"storage":{"backend":"sqlite"}}`。
- **期望**：`400`，`code=invalid_input`，消息**指向确认门路由** (`POST /settings/storage/switch`)；设置文件里**没有** `storage.backend`；无 `backend-switched` 事件

### TC-22: 切换路由落章并留痕 <!-- serves: FR-6, FR-11, FR-14 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-6, FR-11, FR-14

- **前置**：库已迁移就绪（有数据）；会话 id 已知。
- **步骤**：各先 `POST /settings/storage/request {action:'switch'}` + 作答落章取票据，再 `POST /settings/storage/switch {backend:'sqlite', reason:'试点', ticket}`；切回同理 `{backend:'json', ticket}`。
- **期望**：
  - 两次均 `200` 且 `restartRequired=true`；设置文件的 `backend` 随之变化
  - 系统记录 `history` 追加两条 `backend-switched`，`confirmedBy={kind:'human',channel:'board-confirm',sessionId,pluginVersion}`、`keptOtherStore=true`
  - `counters.rollbacks` 在切回 `json` 时 +1；切 sqlite 时若库无数据 → `409 sqlite_not_migrated`（**不写设置**）

### TC-23: 迁移入口开窗成功路径与并发拒绝 <!-- serves: FR-10 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-10

- **前置**：注入假 `SessionWindowOpener`（成功档）+ 假 `CrossWindowDeliver`；已有合法确认留痕（见 TC-39）。
- **步骤**：① 首次调用 ② 迁移进行中二次调用。
- **期望**：
  - ① `200 {windowKey,sessionId,task:'migrate-ledger-to-sqlite'}`，且投递底稿含五步（备份→建库→迁移→校验→写设置）
  - ② `409 migration_in_progress`，**不重复开窗**（断言 opener 调用次数仍为 1）
  - 路由实现口径：直接用 `deps.windowOpener` + `deps.crossWindowDeliver`，**不走 `openWindow` 用例**——后者要求 live driver，HTTP 路由侧没有 `exec`（用例以"未注入 exec 也能开窗"反证这一点）

### TC-39: 确认门是代码级门槛（未留痕直接打接口必拒） <!-- serves: FR-11 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-11

- **前置**：临时 `dshHome`；注入假 `UserQuestionPort`（可回放"弹框作答 / 看板确认按钮 / 文字证据命中真实用户消息"三通道）；**不经过看板**直接发请求。
- **步骤**：
  1. 无票据：`POST /settings/storage/switch {backend:'sqlite'}`（请求体不带 `ticket`）
  2. 无票据：`POST /settings/storage/migrate {}`
  3. 正常建票：`POST /settings/storage/request {action:'migrate'}` → 得 `{action, ticket:'sc-…', expiresAt:+10min, requestedBy}`，且 `UserQuestionPort` 收到确认框推送；再经**作答通道**落章
  4. 用**已建票但未落章**的票据调 migrate
  5. 用**已落章**票据调 migrate → 成功后**复用同一 ticket** 再调一次
  6. 用**过期**票据（伪造 `expiresAt` 已过）调 migrate
  7. 用**属于其它会话**的票据调 migrate
- **期望**：
  - ①②⑤(复用)⑥⑦ 均 `403 confirmation_required`：**不开窗**（opener 调用 0 次）、**不写设置文件**（不存在或 `storage.backend` 未变）、**文件内无事件**（断言系统记录文本不含 `"event":"migration"` 与 `"event":"backend-switched"`）
  - ④ 同样 `403` —— "建了待确认记录" ≠ "人已确认"；**只有作答通道落章后的票据才放行**
  - ⑤ 首次放行；**票据一次性**：消费即作废，第二次调用即 `403`（不可重放）
  - ⑥ **过期即拒**；⑦ **会话不匹配即拒**；两者都**不消费**该票据（第三方请求不改变票据状态）
  - **留痕可审计**：落章记录为 `{kind:'human', at, channel:'board-confirm', sessionId, pluginVersion}`；系统记录 `history` 中 `migration` / `backend-switched` 事件的 `confirmedBy` 与该落章**逐字段一致**（`at` / `sessionId` / `pluginVersion` 不漂移、不补零值）
  - 反向对照：删掉路由里的票据校验后，①② 会变成 200 并开窗（该"红"由 TC-41 覆盖）
  - **实现口径**：门槛在**路由处理函数内**（代码级）；票据由 `POST /settings/storage/request` 产生、仅由作答通道落章；前端"取消"只是不发起落章

### TC-40: 开窗失败三态一律不伪造"已开始" <!-- serves: FR-10 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-10

- **前置**：已有合法确认留痕；三个失败档各跑一轮——(a) `deps.windowOpener` 未装配 / 不可用 (b) `create` 拿不到项目落点（会话头无 cwd 且无回落） (c) `deps.crossWindowDeliver` 投递失败。
- **步骤**：每种失败各调一次 `POST /settings/storage/migrate {}`，随后读系统记录文件原文与设置文件。
- **期望**：
  - 三轮均返回**结构化失败**信封 `{success:false, code, error}`（(a) `window_opener_unavailable`、(b) `window_open_failed`、(c) `dispatch_failed`），**不是 200 也不是裸 500 文本**
  - 三轮**系统记录文件文本都不含 `"event":"migration"`**（直接对文件内容断言，不只看接口返回）
  - 三轮设置文件都未被写入 `storage.backend`
  - (c) 若窗口已开出：如实标注"窗口已开但投递失败"并给窗口键，**仍不写 migration 事件**（不留"已开始"的假记录）

### TC-24: 迁移脚本五步 + 校验不过不写设置 <!-- serves: FR-10, FR-13 -->

**层级** 集成 · **落点** `tests/reqboard/sqlite-migrate.test.ts` · **validates** FR-10, FR-13

- **前置**：临时分片根 128 条（含大字段/评论/历史/冷侧）；目标库不存在；另备一个"陈旧库"（44 条）。
- **步骤**：① `--dry-run` ② 正常跑（含 `--write-settings`）③ 陈旧库场景 ④ 把校验阈值改坏以触发校验不过。
- **期望**：
  - ① 打印五步计划，**磁盘零新增文件**（dry-run 不建库不备份不写设置）
  - ② 库 `requirements=128`、抽样 5 条逐字段相等；备份目录存在且含分片副本；退出码 `0`；设置文件此时含 `backend:'sqlite'`
  - ③ 旧库先被备份为 `<库>.bak-<时间戳>` 再重建（断言旧文件仍在），**不把 44 条当现状**
  - ④ 退出码 `3`、**事务已回滚**（库内条数为 0 或无半成品）、设置文件**未写**、源分片逐字节未变

### TC-25: 迁移门三态 <!-- serves: FR-12, FR-17 -->

**层级** 集成 · **落点** `tests/reqboard/migration-gate.test.ts` · **validates** FR-12, FR-17

- **前置**：临时 `dshHome`；三种布局各跑一遍装配。
- **步骤**：① `backend=sqlite` + 库空 + 分片非空 ② 库有效（有数据） ③ 分片与库**都**不存在（全新安装）。
- **期望**：
  - ① 进"未就绪"：HTTP `503`，`code=REQBOARD_REQUIRES_SQLITE_MIGRATION`，消息含**可复制命令**；**任何读接口都不返回空台账**
  - ② 正常启动，`effective='sqlite'`，`GET /settings` 的 `system.stores.sqlite.exists=true`
  - ③ 正常启动（三相的第三相），首条 `startup` 记 `requirements: 0`，看板不报错；**不建库也不建设置文件**

### TC-26: 初始化语义（记录自动建 / 设置惰性建 / 库迁移时建） <!-- serves: FR-17 -->

**层级** 集成 · **落点** `tests/reqboard/settings-init.test.ts` · **validates** FR-17

- **前置**：临时 `dshHome`，两份文件都不存在；分片为空（全新安装）。
- **步骤**：① 跑一次装配 ② 断言两文件存在性 ③ `PATCH` 一次上限 ④ 再断言。
- **期望**：
  - ① 装配不抛 ② **系统记录已自动创建**且含 `plugin`/`paths`/`active` 与**首条 `startup`**；**设置文件仍不存在**（`fs.existsSync === false`）
  - ③ `200` ④ 设置文件此刻才出现，且 `stageMaxRounds` 只有被改的键
  - 幂等：再跑一次装配，`history` 只**追加**一条 `startup`，既有内容与计数不被覆盖

### TC-27: 记录只追加 + 上限截断 <!-- serves: FR-14 -->

**层级** 集成 · **落点** `tests/reqboard/system-record.test.ts` · **validates** FR-14

- **前置**：构造 501 条事件（或把上限注到 5 便于快跑）。
- **步骤**：逐条 `append`。
- **期望**：`history.length === 500`（丢最旧、留最新）；`counters.truncated` 等于丢弃条数；`updatedAt` 随写更新；**任何既有事件字段未被改写**（只追加语义）

### TC-28: 记录不可写 → 不阻断但响亮 <!-- serves: FR-17 -->

**层级** 集成 · **落点** `tests/reqboard/settings-init.test.ts` · **validates** FR-17

- **前置**：`dshHome` 目录设为只读（或注入写失败）。
- **步骤**：装配 + `GET /settings` + `GET /settings/system`。
- **期望**：
  - 装配**不抛**、路由可用（看板不因档案设施瘫痪）
  - `GET /settings/system` 返回 `droppedEvents > 0` 且带失败原因文案（屏上红字的数据来源）
  - 日志有一条 error 级告警（不静默）

### TC-29: `settings-invalid` 进入历史 <!-- serves: FR-1, FR-14 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-1, FR-14

- **前置**：设置文件含非法键（`implementing: -3`）与非法 `schemaVersion` 两轮。
- **步骤**：装配 → `GET /settings/system?limit=10`。
- **期望**：`history` 末尾有 `settings-invalid`，字段 `key`/`reason`/`fellBackTo` 齐；`GET /settings` 同时反映回落值（两处口径一致，不互相打脸）

## 前端与 E2E 层用例 <!-- serves: FR-2, FR-5, FR-6, FR-10, FR-11, FR-14 -->

### TC-30: 设置弹窗四屏与关闭语义 <!-- serves: FR-5 -->

**层级** 集成 · **落点** `tests/client/settings-dialog.test.ts` · **validates** FR-5

- **前置**：jsdom + 假 `api`（返回固定 `GET /settings` 载荷）。
- **步骤**：渲染弹窗 → 依次点四个菜单项 → ESC → 点遮罩 → 点看板「⚙ 设置」。
- **期望**：
  - 左菜单四项（运行上限 / 存储与数据库 / 系统记录 / 通用）各渲染出对应内容，切换后旧内容不再可见
  - ESC 与点遮罩均关闭；再点页头「⚙ 设置」可重开且**保持上次所在屏**
  - 上限表 9 行（含"不自动跑"的 4 个阶段，灰显但对账可见）

### TC-31: 非法值当场拦、保存前不落盘 <!-- serves: FR-5 -->

**层级** 集成 · **落点** `tests/client/settings-dialog.test.ts` · **validates** FR-5

- **前置**：弹窗已开，初始 `implementing=1000`。
- **步骤**：① 输入 `0` ② 输入 `10001` ③ 输入 `1.5` ④ 输入 `250`。
- **期望**：
  - ①②③ 输入框标红、来源徽章为"待保存"或非法态、**保存键 disabled**；此过程**无任何 `PATCH` 请求**（断言假 api 调用次数为 0）
  - ④ 脏标记出现（行高亮 + 左菜单"1 项未保存"），点保存后发出**恰好一次** `PATCH {implementing:250}`，成功后徽章变"设置文件"

### TC-32: E2E · 上限改小后 Dive 到顶停手 <!-- serves: FR-2, FR-5 -->

**层级** E2E · **落点** `tests/reqboard/settings-e2e.test.ts` · **validates** FR-2, FR-5

- **前置**：全链路真实装配（假投递端口 + 假 agent 存活探针）；一条需求处于 `implementing`。
- **步骤**：`PATCH /settings {implementing: 5}` → 反复触发回合驱动，直到停手。
- **期望**：
  - `roundsInStage` 到 **5** 后不再新增回合（现状会一路跑到 1000）
  - 台账如实置 `driverHealth` 达上限态，且**不再有新回合评论/写放大**
  - 断言"已在跑的回合不被打断"：改动发生前已投递的那一回合正常结束

### TC-33: E2E · 确认门 → 开窗迁移 → 重启后生效 <!-- serves: FR-6, FR-10, FR-11, FR-14 -->

**层级** E2E · **落点** `tests/reqboard/settings-e2e.test.ts` · **validates** FR-6, FR-10, FR-11, FR-14

- **前置**：分片 128 条；假窗口开启器与假 agent 投递；临时 `dshHome`。
- **步骤**：① 点确认门"取消" ② 点"确认执行" ③ 假 agent 跑迁移脚本 ④ 用设置文件重新装配一次（模拟重启） ⑤ `GET /settings` 与 `GET /settings/system`。
- **期望**：
  - ① **零副作用**：无开窗、无文件写、无事件
  - ② 落章留痕（`confirmedBy` 含 sessionId 与插件版本）并开窗
  - ③ 五步进度可见，结束后 `migration ok · 128 条` 事件入库
  - ④ 重启后 `storage.effective='sqlite'`，需求条数与原分片一致（**抽查 5 条逐字段相等**）
  - ⑤ 系统记录时间线可读：`startup → upgrade? → migration → backend-switched? → startup`，`paths` 指向真实库与备份目录

## 反向演练（mutation）用例 <!-- serves: FR-2, FR-10, FR-12, FR-13, FR-17 -->

> 每条给出"**做什么手脚 → 哪条 TC 必须变红**"。红不了 = 该处置没有真实约束力，等于没写。

### TC-34: 去掉迁移回滚分支 → 迁移失败用例必红 <!-- serves: FR-10 -->

**层级** 反向演练 · **落点** `tests/reqboard/sqlite-migrate.test.ts` · **validates** FR-10

- **前置**：在迁移函数的 catch 分支里注释掉 `ROLLBACK`（临时补丁，不提交）。
- **步骤**：跑 TC-24 的第 ④ 步场景（校验不过）。
- **期望**：TC-24 **必红**——库内留下半成品数据、或源分片出现被改动的痕迹。补丁回退后转绿。

### TC-35: 把来源顺序写反 → 优先级用例必红 <!-- serves: FR-2 -->

**层级** 反向演练 · **落点** `tests/reqboard/settings-file.test.ts` · **validates** FR-2

- **前置**：把 `resolveRunSettings` 的合并顺序改成"默认 > 文件"（即文件被默认覆盖）。
- **步骤**：跑 TC-1 四态断言。
- **期望**：TC-1 **必红**（① 会得到 1000/'default' 而不是 800/'settings'）；回退后转绿

### TC-36: 系统记录改回惰性创建 → 初始化用例必红 <!-- serves: FR-17 -->

**层级** 反向演练 · **落点** `tests/reqboard/settings-init.test.ts` · **validates** FR-17

- **前置**：注释掉装配期的 `SystemRecordStore` 初始化调用。
- **步骤**：跑 TC-26。
- **期望**：TC-26 **必红**（断言 `系统记录已创建` 失败）；回退后转绿

### TC-37: 迁移门改成"空库也放行" → 三态用例必红 <!-- serves: FR-12 -->

**层级** 反向演练 · **落点** `tests/reqboard/migration-gate.test.ts` · **validates** FR-12

- **前置**：把"库空 + 分片非空"分支改成返回 `ok`。
- **步骤**：跑 TC-25 第 ① 步。
- **期望**：TC-25 **必红**——启动变成"正常"且读接口返回**空台账**（正是要拦的最坏结果）；回退后转绿

### TC-38: 陈旧库判定恒 false → 陈旧用例必红 <!-- serves: FR-13 -->

**层级** 反向演练 · **落点** `tests/reqboard/system-record.test.ts` · **validates** FR-13

- **前置**：把 `stale` 判定改成恒 `false`。
- **步骤**：跑 TC-9 与 TC-24 第 ③ 步。
- **期望**：两条**必红**（旧库被当现状直接启用 / 未先备份再重建）；回退后转绿

### TC-41: 删掉留痕校验 → 绕过前端用例必红 <!-- serves: FR-11 -->

**层级** 反向演练 · **落点** `tests/reqboard/settings-router.test.ts` · **validates** FR-11

- **前置**：临时补丁：移除 switch/migrate 路由里的"确认留痕"校验分支。
- **步骤**：跑 TC-39 的 ①②。
- **期望**：TC-39 **必红**——两个请求变成 `200` 且真的开了窗（"绕过看板就能切库"复现）；补丁回退后转绿

## 补充裁定用例（口径已定） <!-- serves: FR-2, FR-10, FR-11, FR-12, FR-13 -->

### TC-42: 上限下调/上调的当拍语义（不打断在跑回合） <!-- serves: FR-2 -->

**层级** 集成 · **落点** `tests/dive-round-driver.test.ts`（扩展）+ `tests/reqboard/settings-e2e.test.ts` · **validates** FR-2

- **前置**：一条需求处于 `implementing`，假投递端口 + 假存活探针；快照初始 `implementing=1000`；构造第二需求用于反向态。
- **步骤**：
  1. 驱动到 `roundsInStage=5`，且当前回合处于 **in-flight**（已投递、未结束）。
  2. in-flight 期间 `PATCH /settings {implementing:3}`（快照当拍刷新）。
  3. 让 in-flight 回合**正常结束**。
  4. 再触发一次回合判定。
  5. 反向态：另一需求 `roundsInStage=2`，`PATCH {implementing:5}`，触发判定。
- **期望**：
  - 步骤 ③ 当前回合**照常跑完**：未被 `abort`，台账无 `aborted:user` 记录，投递未被撤销。
  - 步骤 ④ **下一次**判定即停手：不新增回合（投递次数不增），停手原因**如实写入** `driverHealth`（达上限/上限被下调），不是静默停。
  - 步骤 ⑤ `roundsInStage=2 < 5` → **继续续跑**（投递次数 +1），证明"下调拦截"没有误伤"上调放行"。
  - 反向对照（不单独编号）：把"读内存快照"改成"读启动时常量"后，步骤 ④ 必红。

### TC-43: 两种"未就绪"必须分开指引，不许合并成一句 <!-- serves: FR-12 -->

**层级** 集成 · **落点** `tests/reqboard/migration-gate.test.ts` · **validates** FR-12

- **前置**：两个布局各装配一轮——**A** `backend=sqlite` + 库空 + 分片非空；**B** legacy 单册在场 + `meta.json` 不在（既有 v9 场景）。
- **步骤**：各触发一次读接口，取 503 响应体（`code` / `error` / `hint`）。
- **期望**：
  - A：`code=REQBOARD_REQUIRES_SQLITE_MIGRATION`，指引含 `scripts/migrate-ledger-to-sqlite.ts`（或看板迁移按钮）
  - B：`code=REQBOARD_REQUIRES_MIGRATION`，指引含 `scripts/migrate-ledger-v10.ts`
  - **两者 `error`/`hint` 字符串不相等**，且各自**不出现对方的脚本名**（合并成一句即判红）
  - 两者都**不返回空台账**（响应里没有 `requirements: []` 这种"看起来没数据"的降级形状）

### TC-44: 确认门覆盖"写设置"这一步 <!-- serves: FR-10, FR-11 -->

**层级** 集成 · **落点** `tests/reqboard/settings-router.test.ts` + `tests/reqboard/sqlite-migrate.test.ts` · **validates** FR-10, FR-11

- **前置**：临时 `dshHome`；分片 128 条；库未建；注入假 opener/deliver。
- **步骤**：
  1. **不带票据**直接调 `POST /settings/storage/migrate`。
  2. 走 `POST /settings/storage/request` → 作答落章 → 用**已落章票据**调同一路由，取投递给 Agent 的任务底稿。
  3. 手动路径：**不带** `--write-settings` 直接跑迁移脚本。
  4. 断言步骤 3 结束后的设置文件状态。
- **期望**：
  - 步骤 ① 拒绝（`403 confirmation_required`）且**设置文件不存在/未变**（这里专门断言"写设置"这一副作用，与 TC-39 的通用零副作用互为补充）。
  - 步骤 ② 底稿**含 `--write-settings`**——第 5 步写设置是**人工确认（含该票据）所授权**的动作，不是迁移的默认后果。
  - 步骤 ③④ 手动路径迁移数据照常完成，但**默认不写设置文件**（`--write-settings` 缺省关是手动路径的安全缺省）；**不得**因为"反正迁移完了"就顺手写设置。

### TC-45: 分叉检出与全量重建 <!-- serves: FR-10, FR-13 -->

**层级** 集成 · **落点** `tests/reqboard/sqlite-migrate.test.ts` + `tests/reqboard/system-record.test.ts` · **validates** FR-13, FR-10

- **前置**：迁移已完成（库 = 128 条）；分片目录可继续追加需求。
- **步骤**：
  1. 迁移完成后往分片**追加 1 条**需求 → 重新装配/刷新 `stores`。
  2. 断言陈旧检出与提示文案。
  3. 再跑一次迁移（全量重建）→ 断言库条数与旧库备份。
  4. 分叉重试：构造"迁移**失败**（校验不过）→ 分片又被追加 2 条新需求 → 重试成功"→ 断言库条数。
- **期望**：
  - 步骤 ② `stores.sqlite.stale=true`，`staleReason` 写明"分片比库多 1 条 / 更新"，提示**重跑迁移**；**不静默合并**、不自动双写、不把库当最新现状。
  - 步骤 ③ 全量重建后库条数 = **当前分片条数（129）**；旧库先被备份为 `<库>.bak-<时间戳>`（存在性断言），不是就地改。
  - 步骤 ④ 重试后库条数 = 分片当前条数（**131**），覆盖式重建不残留上一轮数据；失败那轮的备份与旧库备份**都还在盘上**（只增不删）。

### TC-46: `envelope.fail()` 新码的 HTTP 状态映射 <!-- serves: FR-4, FR-10, FR-11, FR-12 -->

**层级** 集成 · **落点** `tests/http/envelope.test.ts`（扩展） · **validates** FR-4, FR-10, FR-11, FR-12

- **前置**：`src/http/envelope.ts` 的 code→status 映射表已登记本次新增码（**不补就全落 500**，设计里已写明"必改"）。
- **步骤**：对每个码各构造一次失败响应，读回 HTTP status。
- **期望**（逐条断言具体状态码，不接受"非 500 即可"）：
  - `confirmation_required` → **403**（TC-39 / TC-44 的拒绝码）
  - `window_opener_unavailable` → **503**
  - `dispatch_failed` → **502**
  - `migration_in_progress` → **409**
  - 既有码不回归：`invalid_input` → 400、`not_found` → 404、`REQBOARD_REQUIRES_SQLITE_MIGRATION` → 503
  - 未登记码仍回落 500，且 **original message 不被吞掉**（未命中映射表时行为与改造前一致）

## 测试覆盖度统计 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17 -->

| 需求条款 | 覆盖用例 | 最高层级 | 覆盖状态 |
|---|---|---|---|
| FR-1 设置文件为唯一载体 | TC-1, TC-2, TC-3, TC-5, TC-6, TC-29 | 集成 | ✅ |
| FR-2 上限可配置与生效 | TC-1, TC-2, TC-4, TC-5, TC-32, TC-35, TC-42 | E2E | ✅ |
| FR-3 GET /settings | TC-19 | 集成 | ✅ |
| FR-4 PATCH /settings | TC-2, TC-6, TC-20, TC-21 | 集成 | ✅ |
| FR-5 设置弹窗 | TC-30, TC-31, TC-32 | E2E | ✅ |
| FR-6 存储后端开关 | TC-10, TC-22, TC-33 | E2E | ✅ |
| FR-7 SQLite 适配器 | TC-13, TC-14, TC-15, TC-16, TC-17 | 契约 | ✅ |
| FR-8 契约测试同跑 | TC-12, TC-13, TC-14 | 契约 | ✅ |
| FR-9 数据形态等价 | TC-13, TC-17, TC-18 | 契约 | ✅ |
| FR-10 一次性迁移 | TC-23, TC-24, TC-33, TC-34, TC-40, TC-44, TC-45, TC-46 | E2E | ✅ |
| FR-11 人工确认门 | TC-21, TC-22, TC-32, TC-39, TC-41, TC-44, TC-46 | E2E | ✅ |
| FR-12 迁移门拒绝服务 | TC-25, TC-37, TC-43, TC-46 | 集成 | ✅ |
| FR-13 陈旧库核对 | TC-9, TC-24, TC-38, TC-45 | 集成 | ✅ |
| FR-14 系统记录 | TC-11, TC-22, TC-27, TC-29, TC-33 | E2E | ✅ |
| FR-15 插件版本号落档 | TC-7, TC-11, TC-19 | 集成 | ✅ |
| FR-16 升级检测与一致性核对 | TC-7, TC-8 | 单元 | ✅ |
| FR-17 初始化语义 | TC-3, TC-25, TC-26, TC-28, TC-36 | 集成 | ✅ |

覆盖结论：17 条 FR **全部至少一案覆盖**；其中 6 条（FR-2 / FR-5 / FR-6 / FR-10 / FR-11 / FR-14）有 E2E 级用例，6 条风险处置各有反向演练用例（TC-34 ~ TC-38、TC-41）。
两条"绕过前端"的负面路径各有专案：**未留痕直打接口**（TC-39）与**开窗失败不伪造**（TC-40）——两者都断言到**文件内容**层面，而不是只看响应码。
另有四条**已裁定口径**落成用例：上限下调当拍停手但不打断在跑回合（TC-42）、两种未就绪分开指引不许合并（TC-43）、确认门覆盖"写设置"这一步（TC-44）、分叉检出与全量重建（TC-45）。
确认门按**票据契约**表述（`request` 建票 → 作答通道落章 → `switch`/`migrate` 携带一次性 `ticket`）：未持票 / 未落章 / 过期 / 跨会话 / 重放一律 `403 confirmation_required`，且断言到文件内容层面；新错误码的 HTTP 状态映射由 TC-46 单独锁。

## 歧义与待澄清 <!-- serves: FR-8, FR-12, FR-17 -->

1. **`covers: t-xxx` 的绑定时机**：本文档按设计阶段约束未写任务号；拆分计划落库后需回填，否则模板要求的 `covers` 字段在整个生命周期内始终缺失。建议在拆分任务卡里明确"回填 test-cases 的 covers"。
2. **`tests/client/*` 的既有先例**：`tests/client-page-panel.test.ts` 等是否存在 jsdom 依赖需实施时确认；若本仓 client 测试走的是"纯函数 + 字符串断言"而非 jsdom，TC-30/TC-31 需降级为渲染函数返回值的断言（不影响判定，只改手段）。
3. **`PMBOARD_STAGE_MAX_ROUNDS` 的解析失败粒度**：接口文档写"解析失败该键作废、不整份回退"，但未规定 `implementing=abc` 这类**整体畸形**是否算"该键"；TC-1/TC-2 目前按"逐键作废"断言，若裁定为"整份作废"需同步改这两条。
4. **确认留痕的载体与端点（已解决）**：本文档早先指出"前端在人确认后调用 = 人已确认"这个口径**区分不了"人点过确认"与"直接打接口"**，已被采纳：`interfaces.md` 补齐票据契约——`POST /settings/storage/request` 建待确认记录 `{action, ticket:'sc-…', expiresAt:+10min, requestedBy}` 并经 `UserQuestionPort` 推确认框；**作答通道**（弹框作答 / 看板确认按钮 / 文字证据命中真实用户消息）才落章 `{kind:'human', at, channel:'board-confirm', sessionId, pluginVersion}`；`switch`/`migrate` **必须携带 ticket**，消费即作废，缺失/未落章/过期/跨会话/重放 → `403 confirmation_required`。TC-39 / TC-44 已按此重写。
5. **错误码→HTTP 状态映射（必改项）**：`envelope.fail()` 的映射表需登记 `confirmation_required→403`、`window_opener_unavailable→503`、`dispatch_failed→502`（`window_open_failed→500`、`migration_in_progress→409` 已有）。**不补则全部落 500**，前端拿不到可分支的状态码。该映射由 TC-46 单独锁死（逐条断言具体码，不接受"非 500 即可"）。
6. **旧库备份的保留策略**：`<库>.bak-<时间戳>` 与 `backups/reqboard-<时间戳>/` 都只增不删，长期会堆积；本次边界未含清理，建议在归档材料里登记为已知项（不是本文档要解决的）。
