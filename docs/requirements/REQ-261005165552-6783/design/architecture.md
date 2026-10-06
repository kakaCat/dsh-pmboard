---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# 架构设计（REQ-261005165552-6783）

<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 一句话：把 pmboard 唯一的系统提示词段声明为**字面量段**，让"台账/用户文本里出现花括号占位符"从**整轮失败**降为**无害字符**。
> 证据基线：`record.json` → `interruption.reason` 逐字命中；诊断日志 `NODE-4`（`pending=NONE`）→ `NODE-5`（`windowBound=true` → 返回空）→ 兜底 `boundSectionTextFrom` 产能。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4`

**问题**：捕获段（`reqboard:capture`）是宿主 `systemPrompt` 的一个 section。宿主对 section 的默认语义是**模板**：
逐字扫描 `{{name}}`，名字非法或未注册即抛错。而本段的产能有三条，全部带**外来原文**：

| 产能函数 | 外来原文 | 触发条件 |
|---|---|---|
| `captureGuidanceText` | 无（纯字面量） | 未绑定窗口、无待捕获消息 |
| `capturePromptForMessage` | 用户消息节选（引用原文） | 未绑定窗口 + 待捕获消息命中 |
| `boundSectionTextFrom` | 在制任务 `description/context/acceptance`、需求标题、阶段提示词 | 已绑定窗口 |

于是"任务卡验收标准里引用了模板占位符"这类**完全正常的文档写法**，会把窗口每一轮都打死。

**当前状况**：注册处（`src/gate-wiring.ts`）只传 `{ name, order, text }`，把"要不要插值"交给了宿主默认值。

**设计方案**：注册处显式传 `interpolate: false`——本段是自撰文案 + 原文引用，从不使用宿主变量体系
（全仓无 `systemPrompt.variable(...)` 注册，任何变量名对本段都是"未注册"）。
宿主 `renderPrompt` 的分支是 `section.interpolate === false ? section.text : interpolate(section, …)`，
即：**开关一置，整段绕过扫描器，文本原样进提示词**。

**为什么修在这一层（而不是文本侧转义或宿主侧宽容）**：

- 文本侧转义（把花括号换全角/加空格）会**破坏原文保真**——用户原话、卡上验收原文都要能逐字引用，这是本仓既有语义；
- 宿主侧宽容（不抛错）超出本仓边界，且会让**真正写错的模板**静默失效（宿主当前的抛错是有意的响亮失败）；
- 契约侧声明（本方案）不改一个字节的文案，故障归零。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

```
  窗口每回合 ──▶ SystemPrompt.renderPrompt
                     │
                     ├─ section("reqboard:capture").interpolate === false ?
                     │        ├─ 是（改后）──▶ text 原样拼接 ──▶ 提示词
                     │        └─ 否（改前）──▶ interpolate(扫描 {{…}})
                     │                              └─ 名字非法/未注册 ⇒ throw ⇒ 本轮失败
                     │
                     └─ 段的产能（gate-wiring.ts 内联回调）
                            ├─ captureGuidanceText
                            ├─ capturePromptForMessage(用户消息节选)
                            └─ boundSectionTextFrom(任务 description/context/acceptance + 需求标题 + 阶段提示词)
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/gate-wiring.ts` | 改 | `systemPrompt.section({…})` 增 `interpolate: false` + 注释 | FR-1 | 仅该段的渲染语义；段文本逐字节不变 |
| `tests/apply-wiring.test.ts` | 改 | 断言 `interpolate === false`；断言"每个 section 都显式带 `interpolate`" | FR-1、FR-4 | 仅测试 |
| `tests/capture-literal-section.test.ts` | 新增 | 三组花括号反例 + 宿主同语义判据（防恒真） | FR-2 | 仅测试 |
| `dist/index.mjs` | 重建 | `pnpm build` 产物；重载后卡死窗口解冻 | FR-3 | 运行时装配 |

## 兼容性与回滚 `serves: FR-1, FR-4`

- **宿主版本耦合**：字段来自宿主 `PromptSection.interpolate?: boolean`（装机版本已支持，已读装机产物源码实证）。
  本插件经 `spCtx.systemPrompt`（`any` 缝）调用，**编译期不依赖该字段的类型**——旧宿主上多传一个未知字段会被忽略，
  行为退回"照旧插值"（不报错、不变更行为）。
- **回滚路径**：删掉 `interpolate: false` 一行即回到改动前行为（代价：故障复现）。无数据迁移、无 schema 变更、无灰度开关。
- **文本不变式**：段文本除插值语义外**逐字节不变**——`tests/capture.test.ts` / `tests/stage-prompts.test.ts`
  / `tests/acceptance-criteria.test.ts` 的既有断言是本不变式的守卫，本次一个都不改。

## 关键决策与取舍 `serves: FR-1, FR-3`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 修在哪一层 | 宿主宽容 / 文本转义 | 段契约声明 `interpolate:false` | 宿主开关本就为此而设；转义破坏原文保真；改宿主越界 |
| 解冻方式 | 手工改 `queue.json` + 重启 | 出修复产物 + 重载 | 任务是**进程内缓存**（`QueueTaskStore.cache`），热修同样要重启；一次重载同时消雷与解冻 |
| 是否加写法纪律 | 全仓禁止裸写花括号 | 只加"每段显式声明"（FR-4） | 关掉插值后裸写已无害；纪律成本高、收益为零 |
| 开关粒度 | 只给"动态产能"加开关、静态文本照旧插值 | 整段一个开关 | 段是**同一个** section，宿主按段判定；拆段会改段名/序位契约，且静态文本也无变量需求 |

## 技术方案与亮点 `serves: FR-1, FR-2`

- **单点改动**：一个布尔字段，零运行时分支、零新依赖、零新 I/O。
- **反例先行**：回归测试自带"与宿主同语义的插值判据"，先证"没有开关这笔输入会抛"，再证"有开关字节级保真"——
  避免写出恒真断言（本仓既有教训：判据要能证伪）。
- **与常规做法的差异**：常规是**在文本侧消毒**（转义/清洗/白名单），本方案是**在契约侧声明身份**；
  文本一个字节不改，故障归零。
