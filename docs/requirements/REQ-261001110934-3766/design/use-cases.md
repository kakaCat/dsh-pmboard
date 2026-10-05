---
req: REQ-261001110934-3766
doc: use-cases
serves: FR-1, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10
---

# 用例设计 · 七个场景怎么走（REQ-261001110934-3766）

> **TL;DR**：知识层的价值只在**七个真实动作**里兑现——冷启动、归档沉淀、改 UI、按规范自证、断点回档、
> 决策更替、自检门禁。每个用例都写清：谁触发、读什么、写什么、**省了多少 token 或防住了什么错**。

## UC-1 冷启动认知：新窗口 3 千字符内知道项目长什么样 `serves: FR-1, FR-6, FR-8`

```
新会话（无历史对话）
   │  节点输入包（节点边界或首轮）
   ├─▶ ## 项目知识（索引截断，≤3,000 字符）
   │      · 一句话项目摘要（四层架构 + 插件形态）
   │      · INDEX.md 的分节条目行（架构/规范/前端令牌/决策/坑/契约/术语/代码地图）
   │      · 每行自带指针 → 想深入就 reqboard_kb(id=…)
   ▼
Agent 直接在少 token 下答出：分几层、依赖往哪边、硬纪律在哪、加工具落哪、前端用什么色
   │  不够用时
   └─▶ reqboard_kb(kind='architecture') / (id='kb-conventions-c-01') / (query='颜色')
```

| 项 | 现状 | 目标 |
|---|---|---|
| 建立认知的读入量 | 读 README + 4 篇架构 + 若干源码（≥ 数万字符，且**可能漏**） | 索引 ≤3,000 字符 + 命中条目（单次 ≤1,500 字符） |
| 是否可能漏 | 全靠 Agent 自觉找文件 | 索引分节固定，缺节即门禁失败（I-3） |

**A3 判定**：只给索引 + 代码地图，回答 5 个固定问题（分层、依赖方向、审计门禁位置、加新工具落点、前端色值来源），答对 ≥4/5。

## UC-2 归档即沉淀：走完一次归档，知识自动留下 `serves: FR-3`

```
Agent: reqboard_submit(kind=archive, dir, docs[], merged_into, index_entry)
   │  ① 既有校验（index_entry 非空 / merged_into 合法 / 文件可打开）
   ├─▶ ② DepositKnowledge
   │       ├── 分配 kb-0008（索引现有最大号 +1）
   │       ├── 写 entries/kb-0008.md（kind=decision；若有 retro → 另生成 pitfall 草案）
   │       └── 在 INDEX.md `## 决策` 节追加一行（原位幂等）
   └─▶ ③ 返回归档回执（索引路径 + 条目 id）
        写失败 → 抛错（不静默）：归档材料已登记，但索引缺失会被 kb-probe 报死链
```

**A4 判定**：真实跑一次归档 → 索引新增一行且字段齐全；抽掉 `index_entry` 再提交 → 代码级拒绝。

## UC-3 改 UI 前取令牌：不再吞 13 万字符 CSS `serves: FR-10`

```
任务："把归档区的卡片配色改成与看板一致"
   │
   ├─▶ reqboard_kb(query='归档', kind='tokens')        # 命中 kb-tokens-classes 等小节
   │      返回 ≤1,500 字符：相关类名分组 + 颜色值 + 变量名 + 断点
   ├─▶ reqboard_kb(id='kb-tokens-colors')              # 需要全量色表时
   └─▶ 读 src/client/styles/board.ts 的**目标片段**（而不是全量）
```

**A10 判定**：`kb-build --check` diff 为空；往 `base.ts` 加一个颜色后重跑，diff 恰为该色 → 证明是确定性抽取而非手抄。

## UC-4 按规范自证：每条纪律都能跑 `serves: FR-9`

```
Agent 开工前：reqboard_kb(kind='standard')           # 拿到 C-01…C-NN 的「一句话 + 校验命令」
   │
   实施中改到跨层 import → npx vitest run tests/layer-boundary.test.ts → 红
   │
   修完：把该条规范挂的命令跑一遍，作为「自证」证据写进任务汇报
```

**A9 判定**：遍历 `conventions.md` 每条规则，其 `校验：` 目标**存在且可跑**（100%）；删掉被引用的测试 → 自检非零退出并指出 `C-NN`。

## UC-5 断点回档：被遗弃的窗口按包续跑 `serves: FR-1, FR-6`

```
节点边界 / 上游中断
   │  既有：断点（跑到哪）+ 台账投影 + 路由提示词
   ├─▶ 新增：## 项目知识（索引截断）——「项目是什么」不再靠对话历史
   ▼
新窗口凭「索引 + 断点 + 台账投影」续跑；需要历史决策时 reqboard_kb(query='为什么…')
```

- 与既有 `checkpoint.ts` / `reqboard_note_interruption` **互补**：断点答「跑到哪」，知识层答「项目是什么、为什么这么设计」。
- **压缩不丢原文**：条目 `pointer` 必指 L2 原文（对齐「codex resume 压缩丢上下文」的反面教训）。

## UC-6 决策更替：一条新决策取代旧决策 `serves: FR-2, FR-3`

```
新需求推翻旧结论
   ├─▶ 写新条目 kb-0012（kind=decision，supersedes: kb-0003）
   ├─▶ 旧条目 status: superseded
   └─▶ 索引：kb-0003 行**移除**，kb-0012 行加入（旧文件保留供追溯）
```

- 好处：同一个问题**只有一条 active 结论**会被检索到，避免「同一决策多版本反复被引用」。
- 校验：I-7（superseded 不入索引）、I-5（索引行必可解析到实体）。

## UC-7 知识层自检：把「知识库腐烂」变成红色退出码 `serves: FR-7`

| 触发点 | 命令 | 失败后果 |
|---|---|---|
| 本地/提交前 | `npx tsx scripts/kb-probe.mts` | 非零退出，指出 id/行号 |
| CI / 发版 | `npx tsx scripts/kb-build.mts --check && npx tsx scripts/kb-probe.mts` | 生成物漂移或预算超限即阻断 |
| 验收（本需求） | 上述两条 + `python3 evidence/volume-probe.py` | 三条证据进验收材料 |

**防的是什么**：索引越过 8K（token 黑洞）、条目指向已删除文件（死链）、条目不在索引（孤儿）、
生成物被手改（漂移）、规范写了却跑不了（空话）。

## 用例与功能点对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10`

| 用例 | 主要功能点 | 关键断言 |
|---|---|---|
| UC-1 冷启动 | FR-1, FR-6, FR-8 | A2, A3, A8 |
| UC-2 归档沉淀 | FR-2, FR-3 | A4 |
| UC-3 取令牌 | FR-10 | A10 |
| UC-4 按规范自证 | FR-9 | A9 |
| UC-5 断点回档 | FR-1, FR-6 | A7（兼容）+ 冷启动问答 |
| UC-6 决策更替 | FR-2, FR-3 | I-5, I-7 |
| UC-7 自检门禁 | FR-7 | A6 |
