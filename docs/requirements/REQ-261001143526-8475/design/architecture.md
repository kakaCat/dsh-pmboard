---
req: REQ-261001143526-8475
doc: architecture
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 架构设计 · 技术规范自动沉淀（REQ-261001143526-8475）

> **TL;DR**：规范页从"只有代码纪律"扩成"代码纪律 + 工程操作"，并把**沉淀这件事做成缺口驱动**：
> `kb-probe` 新增 K10 报出「`package.json`/`scripts` 里还没进规范页的必跑动作」→
> 新脚本 `kb-conventions-sync.mts` 为缺口生成**候选条目骨架**（命令与期望从脚本定义推导）→
> Agent 按骨架补「何时跑/失败怎么办」并登记索引行 → K10 转绿。
> 提示词侧：`common/iron-rules.md`（floor，永不裁）加一句总纲 + 三阶段片段各加一句阶段专属提醒。

## 目标与总体方案 `serves: FR-1, FR-3, FR-4`

**问题**：必做动作（打包/构建/重生成/类型/测试/发版前）散在 `package.json` 的 10 个 scripts 与
`scripts/` 的 20 个入口里；规范页 10 条全是代码纪律。于是"开发完该跑什么"**只能靠人记得**。

**方案**：三处落点 + 一条闭环。

```
   (1) 规范页：单一事实源
   +--------------------------------------------------------------+
   | docs/knowledge/conventions.md                                 |
   |   ## 规则清单（代码纪律 C-01..C-10，既有，不动）              |
   |   ## 工程操作 #operations（本需求新增）                       |
   |       ### C-11 改了客户端源码必须重建 bundle #c-11            |
   |         何时跑 / 命令 / 期望输出 / 失败怎么办                  |
   +-------------------------------^------------------------------+
                                   | 缺口 -> 骨架 -> 补条目
   (2) 门禁：缺口驱动          +---+-----------------------------+
   +------------------------+  | scripts/kb-conventions-sync.mts |
   | kb-probe 新增 K10      |  |  --write 生成骨架（只加不改）    |
   | 覆盖度：scripts 必跑项  |  |  --check 与库内比对（CI 门禁）   |
   | 未进规范页 -> 非零退出  |  +---------------------------------+
   +------------------------+
                                   |
   (3) 提示词：让 Agent 知道去查/去补
   +-------------------------------v------------------------------+
   | common/iron-rules.md（floor）：三句话总纲（查/自证/沉淀）      |
   | brainstorming / design / implementing 片段：阶段专属一句      |
   +--------------------------------------------------------------+
```

**为什么用"缺口驱动"而不是"猜本次改了什么"**：插件里没有 git 端口，判定"这次需求新增了哪些工程操作"
要么引入 git diff（新依赖/新端口），要么改归档入参（契约变更）。缺口驱动把判定交给**可枚举的覆盖清单**：
`package.json` scripts + `scripts/` 白名单，扫一遍就知道谁没进规范页——确定性、可测、不猜。

## 三处落点的职责与边界 `serves: FR-1, FR-2, FR-4, FR-5`

| 落点 | 职责 | 不做什么 |
|---|---|---|
| 规范页 `conventions.md` | 写清「何时跑 / 命令 / 期望 / 失败怎么办」，按四档时机分组 | 不重复命令实现（命令本体仍在 package.json/scripts） |
| `kb-conventions-sync.mts` | 从覆盖清单生成**候选骨架**（`--write`）或比对漂移（`--check`） | 不覆盖已有条目、不改既有 10 条 |
| `kb-probe` K10 | 报出覆盖缺口（机器可读），逼着补齐 | 不替人写条目措辞 |
| 提示词片段 | 让 Agent 在正确阶段想起「查规范 / 自证 / 沉淀」 | 不重复规范内容（只给指引与工具名） |

## 自动沉淀的闭环（本需求的核心机制） `serves: FR-3, FR-4`

```
   Agent 收尾（归档材料提交前）
        |
        v
   npx tsx scripts/kb-probe.mts --json      <-- K10 列出缺口（例：build:client 未进规范页）
        |
        v
   npx tsx scripts/kb-conventions-sync.mts --write
        |   为每个缺口生成候选条目骨架（含命令/期望，来自 scripts 定义）
        v
   Agent 补「何时跑 / 失败怎么办」+ 登记索引行（kb-conventions-c-NN）
        |
        v
   npx tsx scripts/kb-probe.mts  ==> K10 转绿（缺一即红，不许"警告放过"）
```

**与既有写入端的关系**：规范页条目走**页面小节**（`kb-conventions-c-11` → `conventions.md#c-11`），
与上一需求的 `entries/kb-NNNN.md`（归档结论条目）**并存但职责不同**：
前者是"做事方法"（长期有效、按类组织），后者是"这次的决定/坑"（一次性的结论）。

## 分层落点与依赖方向 `serves: FR-3, FR-4`

| 层 | 新增/改动 | 说明 |
|---|---|---|
| domain | `src/domain/knowledge/operations.ts` | 覆盖清单纯逻辑：脚本 → 条目 id 的判定、四要素完整性校验（零 I/O，可单测） |
| scripts | `scripts/kb-conventions-sync.mts` | 读 `package.json` + 模板 → 生成骨架；复用 domain 的行语法与预算单点 |
| scripts | `scripts/kb-probe.mts`（改） | 新增 K10：覆盖度 + 四要素完整性（读 operations 单一事实源） |
| domain/prompt | `fragments/common/iron-rules.md` + 三阶段 light/heavy 片段（改） | 提示词接入（floor 与阶段各司其职） |
| docs | `docs/knowledge/conventions.md`（改） | 新增 `## 工程操作` 节与 `C-11…C-NN` |

**依赖方向**：scripts → domain（单向）；提示词片段是纯 markdown（由 `inline-prompt-fragments.mjs` 内联进产物）。
**禁止**：domain 读 `package.json`（I/O 在 scripts）；门禁不得"警告放过"。

## 兼容与回滚 `serves: FR-7`

| 项 | 结论 |
|---|---|
| 既有 10 条规范 | **语义零改动**（只可能在措辞上对齐，判据不动） |
| 台账 schema | **零改动**：不新增字段、不改工具签名（沉淀走页面小节 + 索引行） |
| 提示词预算 | 新增句子计入既有片段；`prompt-gates` 断言总字符 ≤ `DEFAULT_PROMPT_BUDGET` 且 floor 未被裁 |
| 老需求注入 | 除新增句子外逐字节不变（同上一需求的对比法：HEAD worktree 对比） |
| 回滚 | 还原三处：规范页新增节、两个脚本、片段句子；无数据迁移 |

## 风险与对策 `serves: FR-1, FR-2, FR-6`

| 风险 | 症状 | 对策 |
|---|---|---|
| 规范页膨胀超 200 行 | K3 失败 | 加条目到 ~180 行时**拆页**：工程操作独立成 `operations.md`（索引行改指 `operations.md#c-NN`），判据写进 test-cases |
| 操作清单太宽 | 一次性迁移脚本（migrate-ledger 等）也被要求进规范页 | 覆盖清单用**显式白名单 + 排除表**（排除表必须写理由），避免"为了过检查而堆砌条目" |
| 条目写成空话 | 只有命令没有"期望/失败怎么办" | K10 校验**四要素完整性**，缺一即红 |
| 门禁被绕过 | 有人把条目 id 从索引里删掉 | K5（索引与页面一一对应）+ K10 双查 |
