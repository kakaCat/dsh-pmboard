---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 后端设计（REQ-261006201920-2adc）

> 本文档面向：后端开发、测试。规则一律落在 domain 单点；application 只做编排与落库。

## 判据实现 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 判据 | 文件 | 实现要点 |
|---|---|---|
| 命令操作数是占位符 | `domain/task/Acceptability.ts` | 常量在命令**位置**（行首/空白/反引号/管道/`&&`/`;`/`(` 之后，且命令字后跟空白）匹配到命令字，其后 40 字符内出现尖括号 token 即命中 |
| 占位符词表与回填 | `domain/task/SubtaskTemplate.ts` | 声明式闭集 + 纯函数回填；词表外 token 由 `unknownPlaceholders` 报出 |
| 返工卡标准过检 | `domain/workflow/AcceptanceSheetSpec.reworkSpecFor` | 优先级：判据原文 → 来源卡标准 → 合成标准；每级都过 `checkAcceptance` + `checkHowToVerify` |
| 结果可复核 | `domain/workflow/AcceptanceSheetSpec` | `RESULT_ANCHOR`；无锚点 → `unverified` |
| 人工项事实 | 同上 | `HUMAN_FACT` + 长度 > 6；不满足 → 前置校验抛错 |
| 处置模板 | 同上 | `DISPOSITION_TEMPLATE` 两义 + 非空理由；不满足 → 前置校验抛错 |
| 处置完备不放行 | 同上 | `dispositionMissingItems` 接入 `isFullyDecided` / `sheetGateStatus` |
| 覆盖留档 | `application/internal/verdicts.ts` | 原子三元组 + 原文保留 |

**为什么占位符判据要判「命令位置」而不是裸正则**：裸 `/<[^>]{2,40}>/` 会误伤四类合法标准
（TypeScript 泛型 `Record<StageKind,string>`、产品字面量 `<svg>`/`<ts>`、路径形态模板 `prototypes/<name>.html`、
「断言不含 `<单册>`」）。实测：裸正则在 2005 张任务卡里命中 944 张，收窄口径命中 **921 张（97.6%）**
且命中的全是真模板占位符——收窄几乎不损失召回，却消掉了全部误伤。

## 落库点 <!-- serves: FR-1, FR-2 -->

**子卡落库（`application/internal/lazy-expand.ts`）**：

1. `makeChild` 先生成子卡 id，再以 `{ requirementId, taskId, parentAcceptance }` 调回填器。
2. 回填结果同时用于 `acceptance` 与 `implementation` 里嵌入的那段验收描述（两处必须同源）。
3. 回填器内部自检：产物中仍有尖括号 token → 抛错（不落库半成品）。

**返工卡落库（`application/internal/verdicts.materializeReworkTask`）**：

1. 规格由 `reworkSpecFor` 在 domain 算完（含判据与继承）。
2. 应用层只做「生成 id + 写状态事件 + 组装 `TaskRecord`」；`requirementRefs` / `prototypeRefs` / `decisionRefs` / `footprint`
   从规格逐字搬到卡上。
3. 两存储顺序不变：**返工卡先写队列，需求记录后写台账**。

**为什么 `prototypeRefs` 也必须继承**：UI 卡的返工卡若丢原型锚点，会被 UI 卡原型锚点门禁拒绝，
等于「返工卡一旦生成就再也不能开工」——这是必须堵死的死路。

## 两通道一致性与服务端权威 <!-- serves: FR-3 -->

```
http/routers/verdicts.ts  ─┐
                           ├─▶ application/internal/verdicts.applyVerdicts ─▶ domain/workflow/AcceptanceSheetSpec.applyVerdicts
use-cases/AcceptSheet.ts  ─┘
```

- 规则**只在域层**；两通道只做「采集入参 + 透传」。
- 路由层**不做** `passed` 的文本预校验（既有裁定：判定权统一归域层，避免两处口径漂移）。
- 前端校验仅为少一次往返；服务端判据独立成立。

## 覆盖写入的原子性 <!-- serves: FR-3 -->

覆盖生效时必须**一次性**写入四件事：`result` / `resultSource='human'` / `resultSuperseded` / `resultChangeReason`。
任一条件不满足（理由缺失、入参非法）→ **整次覆盖不写**，保持 agent 原文与 `agent` 来源（宁可零改动，也不留半截）。
重复覆盖：`resultSuperseded` 只在**首次**覆盖时写入，后续覆盖不覆盖该字段。
既有回滚开关 `DSH_REQBOARD_NO_ITEM_RESULT` 生效时整段跳过（不写四个字段中的任何一个）。

## 性能与副作用 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- 全部新增判据都是**同步纯函数**（正则 / 字符串处理），零 IO、零网络、无新增轮次。
- 回填发生在懒展开的同一次落库内，不额外读写台账。
- 弹框通道的补问**只在存在覆盖项时**发生（罕见路径），不增加常规裁决的往返。
- 全文扫描面：回填只看父卡一条验收标准；裁决只看当前项文本。无 O(全量) 行为。

## 失败模式与响亮失败 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 失败 | 行为 |
|---|---|
| 回填遇到词表外 token | **抛错**并点名 token（不静默保留） |
| 回填后仍有残留 | **抛错**（内部自检失败） |
| 返工卡三级取值都不可执行 | 抛错并给修法（先修订来源卡标准）——**不得静默落零锚点卡** |
| 覆盖缺理由 | 拒绝该次覆盖，code `result_change_reason_required` |
| 人工项文本无事实 | 前置校验抛错（错在落状态之前，台账零改动） |
| 处置未命中模板 | 前置校验抛错（同上） |
| 判据函数自身抛异常 | **不得**被 catch 后伪造成「通过」 |

**整批原子性**：`applyVerdicts` 保持既有「先整批校验、后落状态」纪律——任何一项校验失败，
**不留半批已改记录**。

## 与相邻窗口的接缝 <!-- serves: FR-3 -->

`domain/workflow/EvidenceAnchor.ts` 是另一窗口在飞建设的「可核验锚点」词表（服务条款级判据与结单证据）。
本需求：

- **不 import 未提交的文件**（避免两个窗口互相拖死）；
- 在本改动面内定义裁决 result 侧词表，并在文件头写明与它的**分工与差集**（result 侧必须认截图 / 日志等证据介质）；
- 共享核心（命令词、路径、明确计数）保持语义一致，收尾时可并到一处而无需重判。

## 环境与配置 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- 不新增环境变量；沿用既有开关 `DSH_REQBOARD_NO_ITEM_RESULT`（语义不变）。
- 不新增依赖、不改构建配置；改客户端源码时按 C-12 重建 bundle。
