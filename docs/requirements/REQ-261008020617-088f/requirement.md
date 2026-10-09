---
id: REQ-261008020617-088f
title: 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面
category: refactor
status: brainstorming
sides: [backend]
created_at: 2026-10-08T02:08:45+08:00
source: 基线守恒台账 docs/reviews/test-baseline.other.txt 分诊为「须另立需求」；经 session-646e8ead 逐处定性后交接立项
---

# 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## TL;DR

`tests/layer-boundary.test.ts` 里 application/ 那条用例恒红：15 处越界 import 分四族。
本次把 I/O 收进端口面或移出 application/，并给这门补上**显式豁免面**（理由必填、只减不增、过期即红）
——它此前没有任何豁免机制，这正是它必然恒红的结构原因。
做完得到：application/ 零越界、`tsc` 0 错、改后失败集合 ⊆ 改前基线（tools/http 那条腿如实留给另一条需求）。

## 现状

### 改前读数（2026-10-08 02:07 实测，本仓库共享工作树）

| 命令 | 读数 |
|---|---|
| `npx vitest run tests/layer-boundary.test.ts` | 9 tests / **2 failed**：① application/ 越界（本需求）② tools/+http/ 状态字面量（另一条腿） |
| `npx vitest run tests/message-hygiene.test.ts` | 5 tests / **3 failed**（另一条腿，本需求不碰） |
| `npx tsc --noEmit` | 退出码 0，0 错误 |
| 相关用例集（layer-boundary + 3 个门单测 + rtm-health 系 + dive-wiring + degraded-startup + create-doc-location + query-run-status） | 15 files / 5 failed / 104 passed |

### 15 处越界（逐处定性已完成，按根因分四族）

| 族 | 文件 | 越界 import | 根因 |
|---|---|---|---|
| ① 同构克隆 ×3 | `src/application/gate/acceptance-gate.ts`、`design-gate.ts`、`task-coverage-gate.ts` | `node:fs/promises`、`node:path`（6 处） | 三个门各写一遍 `fs.readFile(path.join(workspaceRoot, 'docs/requirements/<id>/rtm.yaml'))`，只差"查哪个字段"。它们写在 DocsPort 单点确立之前，新一代 `internal/content-gate-wiring.ts` 没替完 |
| ② 宿主态/日志无端口 | `src/application/internal/diag-log.ts`、`src/application/internal/rtm-health.ts` | `node:fs`、`node:path`（4 处） | 前者直接写诊断日志文件（512KB 轮转 + 双写），后者读写 `stateDir` 下的 `rtm-failures.json` / `rtm-trigger-traces.json` 并读需求文档 front-matter——全是同步 I/O，没有端口面 |
| ③ 规则一刀切误伤 | `src/application/use-cases/CaptureRequirement.ts`、`src/application/use-cases/CreateRequirement.ts` | `node:path`、`node:fs`（4 处） | 只用 `isAbsolute`（纯字符串函数，**无任何 I/O**）与 `statSync`（目录存在性检查，本可走端口） |
| ④ 层归属错位 | `src/application/dive/ReqboardDiveManager.ts` | `@deepseek-ai/cordis`（1 处） | 它 `extends Service`、`static inject = [...]`——**它本身就是 cordis Service**，不是"用例依赖了框架"，是"外壳放错了层" |

### 现状补充事实（本次勘察新增，影响选型）

1. **三个 RTM 门在生产代码里没有引用方**：全仓 `grep` 只有 `src/application/gate/index.ts`
   这个 barrel 再导出它们，而 barrel 自身零引用；生产链路用的是 `vendor/reqboard/src/rtm/acceptance-gate.js`
   （由 `accept-sheet-rtm-integration.ts` / `status-rtm-integration.ts` 调用）。**但目前有 3 份单测**
   （`tests/unit/gate/*.test.ts`，共约 360 行）钉着它们的语义——"改走端口"与"直接删死码"两条路都成立，
   本需求取**合并为单点 + 端口化**（保留被测试钉住的语义，删除死码另议）。
2. **`diag-log.ts` 在 application/ 里只剩一个引用方**：`ReqboardDiveManager.ts`（族④要移出 application/）。
   其余引用方（`src/index.ts`、`src/gate-wiring.ts`、`src/wiring/*`）与 2 份测试都在 application/ 之外。
   ⇒ 族②的日志半边**不必新造端口**，把实现移到 adapters 就自然越界消失。
3. **族③的文件里还藏着规则看不见的同类 I/O**：`CaptureRequirement.resolveWorkspaceAnswer` 用了
   `process.cwd()`（`host` 哨兵）。它不是 import，门禁抓不到，但同属"application 直接读宿主态"——
   本次连同 `isAbsolute` / `statSync` 一起收口（同一函数、同一主题，不扩到别的文件）。
4. **`rtm-health.ts` 的调用方持有端口**：`syncRTMYamlWithSnapshot` 与 `QueryState` 都已拿到 `deps.docs`
   （`DocRepository`），只是把 `stateDir` / `workspaceRoot` 当字符串传下去。⇒ 端口化有现成的注入点。

### 为什么不够用（这条门恒红的结构原因）

门禁只有 `LAYER_RULES`（禁止项正则），**没有任何豁免出口**。于是任何一处"当期不修、但确实有理由"
的越界，唯一结果就是这条用例永久红——而永久红等于没人看（本轮 15 处里已经出现"写得早、没人替完"的
三份克隆，正是"红了没人看"的产物）。缺豁免面 ⇒ 只能全修或长期红，二者都不是可持续的门禁形态。

## 边界

**做（in-scope）**：只动上述 8 个越界文件 + `tests/layer-boundary.test.ts` 与新增豁免台账夹具 +
族①合并后的单点文件（落在 `application/gate/` 或 `application/internal/`）+ 各文件对应的适配器实现
（I/O 落 `src/adapters/`）+ 因签名变化必须同步的**直接调用方与对应单测**（`src/index.ts`、
`src/gate-wiring.ts`、`src/wiring/*`、`tests/unit/gate/*`、rtm-health 系 4 份测试）。

**不做（out-of-scope）**：

- **tools/ 与 http/ 的状态字面量（另一条腿）**：`src/http/routers/{requirements,stages,settings,settings-support}.ts`
  仍红，本需求不修；其中 `settings*.ts` 两处 `code === 'failed'` 属规则误伤（那是结果码不是状态），
  留待那条腿一并裁定。**不得把这条腿记进豁免面来假装全绿**。
- **消息卫生棘轮**（`tests/message-hygiene.test.ts` 的 3 条红）：另一条腿，一行不碰。
- **不删死码**：族①的三个门合并后仍保留同名导出与语义（删死码是另一件事，另立项）。
- **不改规则口径**：`LAYER_RULES` 的禁止项一条都不放宽（只新增"带理由的显式豁免"这一出口）。
- **不动工作树里其他需求的在途改动**（当前 262 个文件被其他窗口改写）；不 `git add -A`。
- **不修 bug、不加功能**：顺手发现的问题另立项（refactor 档纪律）。

## 目标结构

```
   改前                                        改后
   +--------------------------+                +--------------------------+
   | application/             |                | application/             |
   |  gate/{acceptance,       |                |  gate/rtm-gates.ts  ---------> 端口 DocsPort
   |    design,task-coverage} |--+ node:fs     |    (单一实现、纯判定)     |    (读 rtm.yaml)
   |   -gate.ts  （三份克隆）  |  | node:path   |  internal/rtm-health.ts  -----> 端口 HostStatePort
   |  internal/diag-log.ts    |  |             |    (纯判据 + 端口调用)    |    (JSON 原子写 / 读文本)
   |  internal/rtm-health.ts  |  |             |  use-cases/{Capture,      |
   |  use-cases/{Capture,     |  |             |    Create}Requirement.ts -----> 端口 PathProbePort
   |    Create}Requirement.ts |  |             |    (判定走端口/纯函数)    |    (绝对路径目录探测)
   |  dive/ReqboardDive-      |  |             +--------------------------+
   |    Manager.ts（Service）  |  |                        ^
   +--------------------------+  |                        | 只依赖 domain / shared 类型 / 端口
                                 |                        |
                                 v                        |  实现落在下面（越界消失）
   +--------------------------+                +--------------------------+
   | 同层的 I/O 直接写在这里   |                | adapters/                |
   | （无端口、无法替测）      |                |  FileDocRepository（已有）|
   +--------------------------+                |  FileHostState（新）      |
                                               |  AbsPathProbe（新）       |
                                               |  DiagLog（迁移）          |
                                               |  DiveManager 外壳（迁移） |
                                               +--------------------------+

   改动点：src/application/**（8 文件）· src/adapters/**（新增/迁移）· tests/layer-boundary.test.ts（豁免面）
```

## 行为不变式

（重构需求的验收锚点，逐条可验证；与「功能点」编号分开，避免与 RF-x 撞号。）

- **INV-1 三个 RTM 门的判定结论逐字不变**：同一份 rtm.yaml，`passed` / `code` / `gaps` / `message`
  四个字段与改前一致（含 `rtm_not_found` 的兜底分支与消息原文）。
- **INV-2 rtm-health 的落盘形状不变**：`state/rtm-failures.json` / `state/rtm-trigger-traces.json`
  的键、顺序、只保留最近 100 条、原子写（临时文件 + rename）语义不变；读不回 / 坏文件 → 空数组。
- **INV-3 原型节适用性判据不变**：`prototypeSectionVerdict` 的三层判定（sides 命中 / `legacy` 豁免 /
  确定缺节才点名）与 `PROTOTYPE_RULES_SINCE` 常量值不变（纯函数，逐字保留）。
- **INV-4 诊断日志行为不变**：控制台 + 文件双写、512KB 轮转为 `.1`、任何失败静默不挡主流程。
- **INV-5 两处路径判定的对外行为不变**：非绝对路径 → `undefined`（capture 侧）/ `REQBOARD_INVALID_WORKSPACE`
  （create 侧）；目录不存在 / 不可读 → 同一错误码与同一句文案；`host` / `session` 哨兵的解析结果不变。
- **INV-6 Dive Service 的装配与行为不变**：Service 名仍是 `dive-manager`，`inject` 仍是
  `['agents','reqboard']`，订阅分组（root 2 路 + per-agent 6 路）与失败留痕行为不变。
- **INV-7 层门口径不变**：`LAYER_RULES` 的禁止项集合逐字不变；豁免面**只减不增**，且每条豁免必须
  仍命中一处真实越界（实现修好后豁免条目不同步删除 → 当场红）。

## 功能条款（需求条款）

| 编号 | 功能点 | 用例角色 | 描述（谁 · 什么场景 · 做什么 · 看到什么结果） | 优先级 | 备注 |
|---|---|---|---|---|---|
| RF-1 | 层门口径不变、application/ 越界清零 | 维护者 | 我跑 `npx vitest run tests/layer-boundary.test.ts`，application 那条用例 0 处越界、转绿，而规则本身一条没放宽 | P0 | 本需求主锚点 |
| RF-2 | 三个同构 RTM 门合并为单点并走 DocsPort | 维护者 | 我改 rtm.yaml 的读取口径时，只需改一个文件：三份克隆合成一份，读取走注入端口 | P0 | 族① |
| RF-3 | rtm-health 的宿主态读写端口化 | 维护者 | 我要用内存替身测 RTM 健康检查时，不再需要真临时目录——状态文件读写走端口 | P0 | 族② |
| RF-4 | 诊断日志实现移出 application/ | 维护者 | 我读 `src/application/**` 时看不到 `node:fs` 日志代码，日志行为一字未变 | P0 | 族② |
| RF-5 | 两处"绝对路径 + 目录存在性"判定收口 | 调用者 | 我用自定义落点立项时，判定结果与错误文案和改前逐字一致，但用例层不再直接碰 `node:fs` | P0 | 族③ |
| RF-6 | Dive Service 外壳移出 application/ | 维护者 | 我在 application/ 里 grep `@deepseek-ai/cordis` 得 0 命中，Dive 装配与服务名不变 | P0 | 族④ |
| RF-7 | 层门补显式豁免面（理由必填、只减不增、过期即红） | 维护者 | 我遇到"当期确实不修"的越界时，能把它连同理由登记进台账而不是让门永远红；实现修好后忘了删条目会被门抓回 | P0 | 缺它则门必然恒红 |
| RF-8 | 边界外标红如实留痕 | 评审人 | 我读交付材料时能看到 tools/http 与消息卫生仍红、且不是本需求引入的，改前改后读数可比对 | P1 | 防"顺手扩大范围"与"假绿" |

### 条款判据（每条可执行）

- **RF-1**：`npx vitest run tests/layer-boundary.test.ts -t 'application/'` → 该用例通过（bad = []，0 行）；
  `git diff tests/layer-boundary.test.ts` 中 `LAYER_RULES` 的 `forbidden` 数组**零改动**。
- **RF-2**：`grep -rn "node:" src/application/gate src/application/internal/rtm-health.ts` → 0 命中；
  `npx vitest run tests/unit/gate` → 3 份用例的断言（passed/code/gaps/message）全绿、用例数不减。
- **RF-3**：`npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/rtm-trigger-prototype.test.ts tests/submit-prototype.test.ts`
  → 全绿；`grep -rn "node:fs" src/application/internal/rtm-health.ts` → 0 命中。
- **RF-4**：`ls src/application/internal/diag-log.ts` → 不存在（已迁移）；`grep -rn "diag-log" src/application` → 0 命中；
  `npx vitest run tests/reqboard/degraded-startup.test.ts tests/dive-wake-wiring.test.ts` → 全绿。
- **RF-5**：`grep -rn "node:" src/application/use-cases/CaptureRequirement.ts src/application/use-cases/CreateRequirement.ts` → 0 命中；
  `npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts` → 与改前读数一致（不新增红）。
- **RF-6**：`grep -rn "@deepseek-ai/cordis" src/application` → 0 命中；`npx vitest run tests/dive-wake-wiring.test.ts tests/dive-gate-prompt.test.ts` → 全绿。
- **RF-7**：`npx vitest run tests/layer-boundary.test.ts -t '豁免'` → 新用例绿；
  `tests/fixtures/layer-boundary-exempt.json` 的 `entries` 为空数组且 `frozenCount = 0`；
  人为把某条豁免指向一处已修好的文件 → 该用例变红（过期豁免即红的可证伪判据）。
- **RF-8**：交付材料里给出改前/改后两份 `npx vitest run tests/layer-boundary.test.ts` 读数，
  且 tools/http 那条红**两次都在**（failed 用例数 2 → 1，不增不减）。

## 失败与并发路径

- **端口化把行为改漂了**：三个门的 `passed` / `code` / `gaps` / `message` 与 rtm-health 的落盘形状都是
  INV-1 / INV-2 钉死的量。纪律：**先记改前读数**（本文件「改前读数」表），改后逐条比对，
  出现差异先当回归处理，不得用"顺手改了文案"解释。
- **合并克隆后引用方漏改**：三个门现有 3 份单测 + `gate/index.ts` barrel。barrel 零引用但保留同名导出，
  合并后必须让 `import { designGateCheck }` 这类旧路径要么继续可用、要么编译期报错——**禁止**留一个
  同名但语义漂移的实现（那是第二套真相）。判据：`npx tsc --noEmit` 0 错误。
- **端口未装配时的降级**：新端口（宿主态 / 路径探测）缺省实现必须显式。宿主态读不到 → 与改前一致地
  退化为空数组 / `undefined`（不抛、不阻断）；路径探测不可用 → 与改前一致地按"不存在"处理并给同一错误码。
  任何"拿不到就换一种结论"的降级都算引入行为漂移。
- **豁免面被当垃圾桶**：理由与计划必须非空（照 `tests/fixtures/error-code-exempt.json` 的口径：
  `_note` 写清准入/清出/棘轮规则，`frozenCount` 只减不增，测试里另加一条硬上界常量——单改 JSON 数字会红）。
  且每条豁免必须仍命中真实越界：**过期豁免即红**。本需求自身 0 条豁免——不用新机制给自己开后门。
- **并发写盘**：`rtm-failures.json` 的写仍是"读-改-写 + 原子替换"，本次不起新的并发模型（不引入锁）；
  多进程同时记失败仍是最后写者赢（改前即如此，如实继承，**不宣称已修**）。
- **共享工作树的干扰**：本仓工作树有 262 个其他需求的在途改动，测试失败集合在两次运行之间会变。
  判据取"**改后失败集合 ⊆ 改前失败集合**"（同一相关用例集），不做"全绿"承诺；提交时用显式路径 add。
- **越界修完但另一条腿仍红**：`tests/layer-boundary.test.ts` 整文件仍会剩 tools/http 那条红。
  交付材料必须点名它是另一条腿、改前就在、条数不变；**不得**用豁免面把它吞掉来换"全绿"。

## 验收标准

- [ ] `npx vitest run tests/layer-boundary.test.ts` → application/ 用例绿（0 处越界），tools/http 那条
      与改前同为 1 条红、且**未进豁免台账**
- [ ] `npx tsc --noEmit` → 退出码 0、0 错误
- [ ] 相关用例集（layer-boundary + 3 门单测 + rtm-health 系 4 份 + submit-prototype + dive-wiring +
      degraded-startup + create-doc-location + create-delegated-owner + query-run-status）
      → 失败集合 ⊆ 改前基线（改前 5 failed = layer-boundary 2 条〔application 越界 + tools/http 状态字面量〕
      + message-hygiene 3 条；改后 layer application 那条应消失，其余 4 条原样在）
- [ ] `grep -rn "node:\|@deepseek-ai/" src/application` → 0 命中（族①~④ 全清零）
- [ ] `tests/fixtures/layer-boundary-exempt.json` 存在、`frozenCount = 0`、`entries = []`，
      且"过期豁免即红"的另一条判据可证伪（人为构造一次即红）

## 讨论与裁定记录（D-x）

| 编号 | 类型 | 原话 / 出处 | 裁定 | 落点 |
|---|---|---|---|---|
| D-1 | 范围 | 用户 2026-10-08 02:07 选择「守边界：本需求只收 15 处 application/ + 层门豁免面」 | 验收锚点从"整个测试文件全绿"改写为"application/ 用例转绿 + 与改前基线比对不新增红"；tools/http 那条腿另议 | 本文「验收标准」「边界」「RF-8」 |
| D-2 | 方案 | 交接底稿建议"②新增 host state / log port 覆盖 diag-log 与 rtm-health" | 采纳一半：**rtm-health 端口化**（调用方已持有端口，且需替测）；**diag-log 只迁移实现到 adapters**（application 里只剩 1 个引用方且它本就要移出，新造端口是空转） | RF-3 / RF-4 |
| D-3 | 方案 | 交接底稿未提三个门是否有人在用；本次勘察实测**生产零引用、仅 3 份单测钉语义** | 取"合并为单点 + 端口化 + 保留同名导出"，不取"直接删死码"（删码另立项，避免本需求同时改接口与删结构） | RF-2 / 现状补充事实 1 |

## 版本记录

| 版本 | 日期 | 变更内容 | 提出人 | 状态 |
|---|---|---|---|---|
| v0.1 | 2026-10-08 | 初稿（15 处逐处定性 + 四族根因 + 豁免面 + D-1~D-3 裁定） | session-914181c9 | 草稿 |

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| RF-1 | ✅ 已接收 | t1、t3、t4、t5、t6、t7、t8、t-54f247、t-dca1de |
| RF-2 | ✅ 已接收 | t1、t-3ac912 |
| RF-3 | ✅ 已接收 | t3、t4、t2、t-8ba560、t-3b104c、t-a5c088 |
| RF-4 | ✅ 已接收 | t5、t2、t-8ba560、t-43b907 |
| RF-5 | ✅ 已接收 | t6、t2、t-8ba560、t-d2890d |
| RF-6 | ✅ 已接收 | t7、t-d18c15 |
| RF-7 | ✅ 已接收 | t8、t-54f247 |
| RF-8 | ✅ 已接收 | t9、t-dca1de |

> 无未接收条款（8 条全部有落点）。

<!-- reqboard:marks:end -->
